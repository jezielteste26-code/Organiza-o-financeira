/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs/promises";
import { existsSync } from "fs";

dotenv.config();

// Inicialização preguiçosa (Lazy loading) do cliente do Gemini para evitar travamentos se a chave estiver vazia.
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("A chave GEMINI_API_KEY não está configurada nos segredos do AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Aumenta o limite para suportar PDFs e imagens pesadas codificadas em Base64
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API - Rota de saúde simples
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API - Processamento de Faturas com IA (Gemini)
  app.post("/api/parse-invoice", async (req, res) => {
    try {
      const { fileBase64, mimeType, fileName } = req.body;

      if (!fileBase64 || !mimeType) {
        res.status(400).json({
          success: false,
          error: "O arquivo e o tipo MIME são obrigatórios para processar a fatura.",
        });
        return;
      }

      // Inicializa e valida a chave do Gemini
      const ai = getGeminiClient();

      const promptText = `Você é um extrator de dados de faturas de cartão de crédito brasileiras.
Analise o arquivo anexado (que é uma imagem ou PDF de fatura de cartão de crédito) e extraia de forma precisa e completa as informações solicitadas.

Instruções críticas:
1. Identifique compras parceladas procurando por padrões de parcelas como "01/10", "3/12", "04/05", "1 de 6", etc. no nome ou descrição da transação.
2. Para transações parceladas:
   - 'isInstallment' DEVE ser true.
   - 'installmentCurrent' é o número atual da parcela sendo paga (ex: em '07/10' é 7, em '1 de 6' é 1).
   - 'installmentTotal' é o número total de parcelas contratadas (ex: em '07/10' é 10, em '1 de 6' é 6).
   - 'installmentValue' é o valor exato cobrado por ESSA parcela nesta fatura.
   - 'totalValue' deve ser o valor total final da compra original (se não souber, calcule multiplicando 'installmentValue' por 'installmentTotal').
3. Para transações normais (à vista):
   - 'isInstallment' DEVE ser false.
   - 'installmentCurrent', 'installmentTotal' e 'installmentValue' devem ser null.
   - 'totalValue' é o valor total da transação.
4. Identifique o mês de referência da fatura ('referenceMonth') no formato 'AAAA-MM' (ex: '2026-07'). Se não conseguir deduzir o ano na fatura, use 2026.
5. Estime a data de cada compra ('purchaseDate') no formato 'AAAA-MM-DD'. Se a fatura mostrar apenas dia e mês (ex: '15/05' ou '15 Mai'), complete usando o ano de referência deduzido da fatura.
6. IGNORE linhas referentes a pagamentos de faturas anteriores ("PAGTO RECEBIDO", "PAGAMENTO EFETUADO", "DEB.AUTOMATICO", etc.), saldos anteriores, créditos de juros/estornos de pagamentos, ou linhas de resumo de faturas. Foque em gastos reais, taxas, anuidades e compras realizadas.
7. Se houver alguma compra que você não conseguiu ter certeza de todos os campos ou que parece incompleta, preencha-a da melhor forma possível. Se 'installmentCurrent' ou 'installmentTotal' forem ilegíveis mas o item é parcelado, preencha-os como null para que o usuário possa revisar.`;

      // Define o esquema de resposta JSON estrito para garantir que o Gemini retorne exatamente o modelo desejado
      const invoiceResponseSchema = {
        type: Type.OBJECT,
        properties: {
          referenceMonth: {
            type: Type.STRING,
            description: "O mês de referência da fatura no formato 'AAAA-MM' (ex: '2026-07')."
          },
          totalValue: {
            type: Type.NUMBER,
            description: "O valor total desta fatura específica somando todas as despesas lançadas nela."
          },
          purchases: {
            type: Type.ARRAY,
            description: "Lista de compras e gastos extraídos da fatura.",
            items: {
              type: Type.OBJECT,
              properties: {
                description: {
                  type: Type.STRING,
                  description: "A descrição completa da compra como aparece na linha da fatura (ex: 'MERCADO LIVRE', 'UBER *TRIP')."
                },
                purchaseDate: {
                  type: Type.STRING,
                  description: "Data da compra no formato 'AAAA-MM-DD' ou null se não identificável."
                },
                totalValue: {
                  type: Type.NUMBER,
                  description: "O valor total cheio da compra. Se for parcelada, é o valor integral (parcela * total de parcelas). Se à vista, é o valor cobrado."
                },
                isInstallment: {
                  type: Type.BOOLEAN,
                  description: "true se for uma compra parcelada, false caso contrário."
                },
                installmentCurrent: {
                  type: Type.INTEGER,
                  description: "O número da parcela atual (ex: 5 em '05/12'). null se for compra à vista."
                },
                installmentTotal: {
                  type: Type.INTEGER,
                  description: "O número total de parcelas (ex: 12 em '05/12'). null se for compra à vista."
                },
                installmentValue: {
                  type: Type.NUMBER,
                  description: "O valor desta parcela específica cobrada nesta fatura. null se for compra à vista."
                }
              },
              required: ["description", "totalValue", "isInstallment"]
            }
          }
        },
        required: ["referenceMonth", "totalValue", "purchases"]
      };

      const mediaPart = {
        inlineData: {
          mimeType,
          data: fileBase64,
        },
      };

      const textPart = {
        text: promptText,
      };

      // Chamada oficial à API Gemini usando o SDK recomendado
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [mediaPart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: invoiceResponseSchema,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("O modelo Gemini não retornou nenhum texto.");
      }

      const parsedData = JSON.parse(responseText.trim());

      // Mapeia compras para garantir IDs e preenchimento adequado
      const purchasesWithIds = (parsedData.purchases || []).map((p: any, idx: number) => {
        const isInstallment = !!p.isInstallment;
        const current = p.installmentCurrent ? Number(p.installmentCurrent) : undefined;
        const total = p.installmentTotal ? Number(p.installmentTotal) : undefined;
        const val = p.installmentValue ? Number(p.installmentValue) : (isInstallment && total ? p.totalValue / total : p.totalValue);

        // Calcula as parcelas restantes contando a partir do mês da fatura (inclusive a atual)
        let remaining: number | undefined = undefined;
        if (isInstallment && total && current) {
          remaining = total - current;
        }

        return {
          id: `pur-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          description: p.description || "Compra Sem Nome",
          category: p.category || "Geral",
          purchaseDate: p.purchaseDate || undefined,
          totalValue: Number(p.totalValue || 0),
          isInstallment,
          installmentCurrent: current,
          installmentTotal: total,
          installmentValue: val ? Number(val) : undefined,
          installmentsRemaining: remaining,
        };
      });

      // Se alguma compra parcelada veio com dados de parcelas vazios mas está marcada como parcelada, precisa de revisão
      const needsReview = purchasesWithIds.some(
        (p: any) => p.isInstallment && (!p.installmentCurrent || !p.installmentTotal || !p.installmentValue)
      ) || purchasesWithIds.length === 0;

      const cardInvoice = {
        id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        referenceMonth: parsedData.referenceMonth || new Date().toISOString().substring(0, 7),
        uploadedAt: new Date().toISOString(),
        fileName: fileName || "fatura.pdf",
        totalValue: Number(parsedData.totalValue || 0),
        purchases: purchasesWithIds,
        parsedAt: new Date().toISOString(),
        needsReview,
      };

      res.json({
        success: true,
        invoice: cardInvoice,
      });

    } catch (error: any) {
      console.error("Erro no processamento da fatura:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Erro desconhecido ao processar fatura.",
      });
    }
  });

  // API - Sincronização compartilhada simples
  const SYNC_DIR = path.join(process.cwd(), "sync_data");

  // Garante que o diretório de sincronização existe
  try {
    if (!existsSync(SYNC_DIR)) {
      await fs.mkdir(SYNC_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("Erro ao criar diretório sync_data:", err);
  }

  // Sanitiza o código para evitar Path Traversal
  const sanitizeCode = (code: string) => {
    return code.replace(/[^a-zA-Z0-9_-]/g, "");
  };

  app.get("/api/sync/:code", async (req, res) => {
    try {
      const code = sanitizeCode(req.params.code);
      if (!code) {
        res.status(400).json({ success: false, error: "Código inválido." });
        return;
      }
      const filePath = path.join(SYNC_DIR, `data_${code}.json`);
      if (existsSync(filePath)) {
        const fileContent = await fs.readFile(filePath, "utf-8");
        res.json({ success: true, data: JSON.parse(fileContent) });
      } else {
        res.status(404).json({ success: false, error: "Nenhum dado encontrado para este código." });
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados sincronizados:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/sync/:code", async (req, res) => {
    try {
      const code = sanitizeCode(req.params.code);
      if (!code) {
        res.status(400).json({ success: false, error: "Código inválido." });
        return;
      }
      const filePath = path.join(SYNC_DIR, `data_${code}.json`);
      await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), "utf-8");
      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao salvar dados de sincronização:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Configuração do Vite Middleware em desenvolvimento ou arquivos estáticos em produção
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

startServer();
