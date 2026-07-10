/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { CardInvoice, CardPurchase } from "../types";
import { formatCurrency, formatMonth, parseInvoiceLine, getPurchaseFullDate, extractTotalValueFromText } from "../utils";
import { Upload, FileText, CheckCircle, AlertTriangle, Edit3, Trash2, Plus, Calendar, Settings, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as pdfjsLib from "pdfjs-dist";

interface CardInvoicesProps {
  selectedMonth: string;
  invoices: CardInvoice[];
  setInvoices: React.Dispatch<React.SetStateAction<CardInvoice[]>>;
}

export default function CardInvoices({
  selectedMonth,
  invoices,
  setInvoices,
}: CardInvoicesProps) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Edição/Criação Manual de compras na fatura
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);

  // Campos de Formulário de Compra
  const [purDesc, setPurDesc] = useState("");
  const [purValue, setPurValue] = useState("");
  const [purDate, setPurDate] = useState("");
  const [purCategory, setPurCategory] = useState("Geral");
  const [purIsInstallment, setPurIsInstallment] = useState(false);
  const [purInstallmentCurrent, setPurInstallmentCurrent] = useState("1");
  const [purInstallmentTotal, setPurInstallmentTotal] = useState("10");

  const activeInvoice = invoices.find((inv) => inv.referenceMonth === selectedMonth);

  // Helper para extrair texto de PDF localmente usando pdfjs-dist
  const readPdfTextLocal = async (file: File): Promise<string> => {
    // Configura o local do worker na CDN do cdnjs matching a versão importada do pdfjsLib
    const version = pdfjsLib.version || "4.10.38";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  // --- Função para Upload do Arquivo ---
  const handleFile = async (file: File) => {
    if (!file) return;

    // Valida o tipo de arquivo
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      setError("Tipo de arquivo inválido. Por favor, envie uma fatura em formato PDF ou Imagem (PNG/JPG).");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep("Lendo arquivo da fatura...");

    try {
      // 1. TENTATIVA DE PARSING LOCAL DO CARREFOUR PDF
      if (file.type === "application/pdf") {
        setLoadingStep("Processando PDF localmente (Sem IA / Offline)...");
        try {
          const pdfText = await readPdfTextLocal(file);
          
          // Quebramos em linhas para analisar individualmente
          const lines = pdfText.split("\n");
          const parsedPurchases: CardPurchase[] = [];
          let totalPurchasesSum = 0;

          // Se o pdf de alguma forma uniu o texto em linhas longas, vamos tentar quebrar também por espaços duplos
          const normalizedLines: string[] = [];
          for (const l of lines) {
            // Se a linha for muito grande, talvez tenha múltiplos lançamentos agrupados por tabulação do PDF.js
            // Vamos separar por quebras normais ou padrões comuns de data
            if (l.length > 120 && /\d{2}\/\d{2}/.test(l)) {
              // Divide a linha antes de cada padrão "DD/MM" para recuperar as linhas individuais
              const parts = l.split(/(?=\b\d{2}\/\d{2}\b)/);
              normalizedLines.push(...parts);
            } else {
              normalizedLines.push(l);
            }
          }

          for (let i = 0; i < normalizedLines.length; i++) {
            const parsed = parseInvoiceLine(normalizedLines[i]);
            if (parsed) {
              // Descartamos se isCredit === true (pagamentos/estornos de faturas anteriores - Regra 5.2/5.3)
              if (parsed.isCredit) {
                continue;
              }

              const fullDate = getPurchaseFullDate(parsed.date, selectedMonth);

              parsedPurchases.push({
                id: `pur-loc-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
                description: parsed.description,
                category: parsed.description.toUpperCase().includes("ANUIDADE") ? "Tarifas" : "Geral",
                purchaseDate: fullDate,
                totalValue: parsed.totalValue,
                isInstallment: parsed.isInstallment,
                installmentCurrent: parsed.installmentCurrent,
                installmentTotal: parsed.installmentTotal,
                installmentValue: parsed.installmentValue,
                installmentsRemaining: parsed.isInstallment && parsed.installmentTotal && parsed.installmentCurrent
                  ? parsed.installmentTotal - parsed.installmentCurrent
                  : undefined
              });

              // Soma o valor correspondente a esta fatura (se parcelado, o valor da parcela; se à vista, o valor cheio)
              totalPurchasesSum += parsed.isInstallment && parsed.installmentValue 
                ? parsed.installmentValue 
                : parsed.totalValue;
            }
          }

          if (parsedPurchases.length > 0) {
            // Tenta obter o total da fatura atual do topo do PDF
            const extractedTotal = extractTotalValueFromText(pdfText);
            const finalTotal = extractedTotal !== null ? extractedTotal : totalPurchasesSum;

            // Regra 5.4: needsReview se o total não bater com a soma (margem de 1 real de tolerância)
            let needsReview = false;
            if (extractedTotal !== null) {
              needsReview = Math.abs(totalPurchasesSum - extractedTotal) > 1.0;
            } else {
              needsReview = true; // Necessita de revisão se não achou o total do cabeçalho
            }

            const cardInvoice: CardInvoice = {
              id: `inv-loc-${Date.now()}`,
              referenceMonth: selectedMonth,
              uploadedAt: new Date().toISOString(),
              fileName: file.name,
              totalValue: finalTotal,
              purchases: parsedPurchases,
              parsedAt: new Date().toISOString(),
              needsReview,
            };

            // Regra de Negócio 4.1: Substitui completamente faturas do mesmo mês
            setInvoices((prev) => {
              const filtered = prev.filter((inv) => inv.referenceMonth !== selectedMonth);
              return [...filtered, cardInvoice];
            });

            setLoadingStep("Concluído!");
            setTimeout(() => {
              setLoading(false);
            }, 500);
            return; // Retorna com sucesso usando o parser offline local!
          } else {
            console.log("Nenhum lançamento padrão Carrefour encontrado no PDF local. Seguindo para o Gemini...");
          }
        } catch (localError) {
          console.error("Erro ao rodar extrator local, tentando via Gemini...", localError);
        }
      }

      // 2. FALLBACK PARA EXTRAÇÃO VIA GEMINI (Se for Imagem ou PDF de outro formato/banco)
      setLoadingStep("Conectando com o Gemini para analisar a fatura...");
      const base64Data = await convertFileToBase64(file);

      const response = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Ocorreu um erro ao processar a fatura via IA.");
      }

      setLoadingStep("Processando e estruturando dados recebidos...");

      const parsedInvoice: CardInvoice = data.invoice;
      // Sobrescreve o mês de referência para o mês atual que o usuário está visualizando para garantir consistência
      parsedInvoice.referenceMonth = selectedMonth;

      // Regra de Negócio 4.1: Substituir completamente faturas com o mesmo referenceMonth
      setInvoices((prev) => {
        const filtered = prev.filter((inv) => inv.referenceMonth !== parsedInvoice.referenceMonth);
        return [...filtered, parsedInvoice];
      });

      setLoadingStep("Concluído!");
      setTimeout(() => {
        setLoading(false);
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro inesperado ao processar arquivo.");
      setLoading(false);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Drag and Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // --- Funções de CRUD de Compras na Fatura ---
  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purDesc || !purValue || !activeInvoice) return;

    const val = parseFloat(purValue);
    if (isNaN(val) || val <= 0) return;

    let updatedPurchases: CardPurchase[] = [];

    const isInstallment = purIsInstallment;
    const current = isInstallment ? parseInt(purInstallmentCurrent) : undefined;
    const total = isInstallment ? parseInt(purInstallmentTotal) : undefined;
    const installmentValue = isInstallment ? val : undefined;
    const totalValue = isInstallment && total ? val * total : val;
    const remaining = isInstallment && total && current ? total - current : undefined;

    if (editingPurchaseId) {
      updatedPurchases = activeInvoice.purchases.map((p) =>
        p.id === editingPurchaseId
          ? {
              ...p,
              description: purDesc,
              category: purCategory,
              purchaseDate: purDate || undefined,
              totalValue,
              isInstallment,
              installmentCurrent: current,
              installmentTotal: total,
              installmentValue,
              installmentsRemaining: remaining,
            }
          : p
      );
      setEditingPurchaseId(null);
    } else {
      const newPurchase: CardPurchase = {
        id: `pur-man-${Date.now()}`,
        description: purDesc,
        category: purCategory,
        purchaseDate: purDate || undefined,
        totalValue,
        isInstallment,
        installmentCurrent: current,
        installmentTotal: total,
        installmentValue,
        installmentsRemaining: remaining,
      };
      updatedPurchases = [...activeInvoice.purchases, newPurchase];
      setIsAddingPurchase(false);
    }

    // Recalcula o valor total da fatura
    const newTotal = updatedPurchases.reduce((acc, curr) => {
      const val = curr.isInstallment ? (curr.installmentValue || 0) : curr.totalValue;
      return acc + val;
    }, 0);

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.referenceMonth === selectedMonth
          ? { ...inv, purchases: updatedPurchases, totalValue: newTotal }
          : inv
      )
    );

    // Reseta form
    resetPurchaseForm();
  };

  const handleEditPurchase = (purchase: CardPurchase) => {
    setEditingPurchaseId(purchase.id);
    setIsAddingPurchase(true);
    setPurDesc(purchase.description);
    setPurCategory(purchase.category || "Geral");
    setPurDate(purchase.purchaseDate || "");
    setPurIsInstallment(purchase.isInstallment);
    
    if (purchase.isInstallment) {
      setPurValue((purchase.installmentValue || 0).toString());
      setPurInstallmentCurrent((purchase.installmentCurrent || 1).toString());
      setPurInstallmentTotal((purchase.installmentTotal || 10).toString());
    } else {
      setPurValue(purchase.totalValue.toString());
    }
  };

  const handleDeletePurchase = (purchaseId: string) => {
    if (!activeInvoice) return;
    const updated = activeInvoice.purchases.filter((p) => p.id !== purchaseId);
    const newTotal = updated.reduce((acc, curr) => {
      const val = curr.isInstallment ? (curr.installmentValue || 0) : curr.totalValue;
      return acc + val;
    }, 0);

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.referenceMonth === selectedMonth
          ? { ...inv, purchases: updated, totalValue: newTotal }
          : inv
      )
    );
  };

  const handleDeleteInvoice = () => {
    if (confirm("Deseja realmente excluir todos os dados da fatura deste mês?")) {
      setInvoices((prev) => prev.filter((inv) => inv.referenceMonth !== selectedMonth));
    }
  };

  const resetPurchaseForm = () => {
    setPurDesc("");
    setPurValue("");
    setPurDate("");
    setPurCategory("Geral");
    setPurIsInstallment(false);
    setPurInstallmentCurrent("1");
    setPurInstallmentTotal("10");
    setEditingPurchaseId(null);
  };

  return (
    <div className="space-y-6" id="card-invoices-container">
      {/* Alerta de Erro */}
      {error && (
        <div className="bg-rose-50/80 border border-rose-100 text-rose-800 p-4 rounded-xl text-xs flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loader de Upload com Gemini */}
      {loading && (
        <div className="bg-zinc-900 text-white rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-2xl border border-zinc-800">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
          <div className="space-y-1">
            <h4 className="font-black text-base flex items-center justify-center gap-2 tracking-tight">
              <Sparkles className="w-5 h-5 text-emerald-300 animate-pulse" />
              Processando Fatura com IA
            </h4>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">{loadingStep}</p>
          </div>
          <div className="text-[9px] text-zinc-600 uppercase font-black tracking-widest animate-pulse mt-4">
            Isso pode levar alguns segundos...
          </div>
        </div>
      )}

      {!loading && !activeInvoice && (
        /* Estado Vazio - Upload de Fatura */
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center text-center transition-all duration-300 ${
            dragActive
              ? "border-zinc-900 bg-zinc-100/60"
              : "border-zinc-200 bg-white hover:border-zinc-350"
          }`}
          id="invoice-upload-dropzone"
        >
          <div className="p-4.5 bg-zinc-900 text-emerald-400 rounded-2xl mb-5 shadow-lg shadow-zinc-200/50">
            <Upload className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-black text-zinc-900 tracking-tight">Importar Fatura de {formatMonth(selectedMonth)}</h3>
          <p className="text-xs text-zinc-500 mt-2 max-w-md leading-relaxed">
            Faça upload do arquivo PDF ou imagem da fatura do cartão de crédito. A inteligência artificial do Gemini extrairá todas as transações automaticamente de forma nativa.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            accept=".pdf, image/*"
            className="hidden"
          />

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs transition-all duration-200"
            >
              Escolher Arquivo
            </button>
          </div>

          <div className="text-[10px] text-zinc-400 mt-4 flex items-center gap-1.5 font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            Suporta PDF, PNG, JPG (leitura por IA)
          </div>
        </div>
      )}

      {!loading && activeInvoice && (
        /* Fatura Carregada */
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-zinc-900 text-emerald-400 rounded-2xl shadow-xs">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-zinc-900">
                    Fatura de {formatMonth(activeInvoice.referenceMonth)}
                  </h3>
                  {activeInvoice.needsReview && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Revisão Necessária
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Arquivo: <span className="font-semibold text-zinc-800">{activeInvoice.fileName}</span> • Lido por IA em {new Date(activeInvoice.parsedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <div className="text-right">
                <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-black">Valor Total</span>
                <div className="text-2xl font-black text-zinc-900">{formatCurrency(activeInvoice.totalValue)}</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-all"
                  title="Sobrescrever / Re-enviar fatura"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                  accept=".pdf, image/*"
                  className="hidden"
                />
                <button
                  onClick={handleDeleteInvoice}
                  className="p-2.5 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-xl transition-all"
                  title="Excluir dados da fatura"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Formulário Manual / Edição de Compras */}
          <AnimatePresence>
            {(isAddingPurchase || editingPurchaseId) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-zinc-100/60 border border-zinc-200 rounded-3xl p-6 overflow-hidden"
              >
                <form onSubmit={handleSavePurchase} className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">
                    {editingPurchaseId ? "Editar Lançamento do Cartão" : "Manualmente Adicionar Gasto ao Cartão"}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-zinc-500 mb-1">Descrição / Estabelecimento</label>
                      <input
                        type="text"
                        placeholder="Ex: Supermercado Assaí, Posto BR"
                        value={purDesc}
                        onChange={(e) => setPurDesc(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">Valor do Lançamento (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={purValue}
                        onChange={(e) => setPurValue(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">Data da Compra</label>
                      <input
                        type="date"
                        value={purDate}
                        onChange={(e) => setPurDate(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-hidden focus:border-zinc-900"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={purIsInstallment}
                          onChange={(e) => setPurIsInstallment(e.target.checked)}
                          className="w-4 h-4 text-zinc-900 border-zinc-300 rounded focus:ring-zinc-900"
                        />
                        <span className="text-xs font-bold text-zinc-700">Gasto Parcelado?</span>
                      </label>

                      {purIsInstallment && (
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-zinc-200 rounded-xl">
                          <span className="text-xs font-medium text-zinc-500">Parcela</span>
                          <input
                            type="number"
                            min="1"
                            max={purInstallmentTotal}
                            value={purInstallmentCurrent}
                            onChange={(e) => setPurInstallmentCurrent(e.target.value)}
                            className="w-12 py-0.5 border-b border-zinc-200 font-bold text-xs text-center focus:outline-hidden focus:border-zinc-900"
                            required
                          />
                          <span className="text-xs font-medium text-zinc-400">de</span>
                          <input
                            type="number"
                            min="1"
                            value={purInstallmentTotal}
                            onChange={(e) => setPurInstallmentTotal(e.target.value)}
                            className="w-12 py-0.5 border-b border-zinc-200 font-bold text-xs text-center focus:outline-hidden focus:border-zinc-900"
                            required
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingPurchase(false);
                          resetPurchaseForm();
                        }}
                        className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
                      >
                        Salvar Lançamento
                      </button>
                    </div>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Listagem de compras extraídas */}
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4.5 border-b border-zinc-150 flex justify-between items-center bg-zinc-50/50">
              <h4 className="font-black text-zinc-800 text-xs uppercase tracking-widest">Gastos Lançados na Fatura</h4>
              {!isAddingPurchase && !editingPurchaseId && (
                <button
                  onClick={() => setIsAddingPurchase(true)}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /> Adicionar Compra
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-150 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50/20">
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Descrição</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3 text-right">Valor Pago</th>
                    <th className="px-6 py-3 text-right">Valor Total</th>
                    <th className="px-6 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700 font-medium">
                  {activeInvoice.purchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-zinc-400 font-bold">
                        Nenhuma compra lançada na fatura. Clique em "Adicionar Compra" ou re-envie o arquivo.
                      </td>
                    </tr>
                  ) : (
                    activeInvoice.purchases.map((pur) => {
                      // Parcela atual / total
                      const current = pur.installmentCurrent;
                      const total = pur.installmentTotal;
                      const isInstallment = pur.isInstallment;
                      
                      // Progress percentage
                      const progressPct = isInstallment && current && total ? (current / total) * 100 : 100;
                      const remaining = isInstallment && total && current ? total - current : 0;

                      return (
                        <tr key={pur.id} className="hover:bg-zinc-50/60 group transition-colors duration-200">
                          <td className="px-6 py-4 whitespace-nowrap text-[10px] text-zinc-400 font-bold">
                            {pur.purchaseDate ? new Date(pur.purchaseDate).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-zinc-800">{pur.description}</div>
                            {isInstallment && (
                              <div className="flex items-center gap-2 mt-2 max-w-[160px]">
                                <div className="w-full bg-zinc-100 h-1 rounded-full overflow-hidden">
                                  <div
                                    className="bg-indigo-600 h-1 rounded-full"
                                    style={{ width: `${progressPct}%` }}
                                  ></div>
                                </div>
                                <span className="text-[9px] font-black text-indigo-600 whitespace-nowrap shrink-0 font-mono">
                                  {current}/{total}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isInstallment ? (
                              <div className="space-y-0.5">
                                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                  Parcelado
                                </span>
                                {remaining > 0 && (
                                  <span className="text-[9px] text-zinc-400 block font-bold">
                                    Faltam {remaining} meses
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                                À Vista
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-zinc-900">
                            {isInstallment
                              ? formatCurrency(pur.installmentValue || 0)
                              : formatCurrency(pur.totalValue)}
                          </td>
                          <td className="px-6 py-4 text-right text-zinc-400 font-bold">
                            {formatCurrency(pur.totalValue)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditPurchase(pur)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-50 border border-transparent hover:border-zinc-200 rounded-lg transition-all"
                                title="Editar Lançamento"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePurchase(pur.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-zinc-200 rounded-lg transition-all"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
