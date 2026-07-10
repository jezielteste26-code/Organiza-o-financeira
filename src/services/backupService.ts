/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppStorageSchema } from "../types";
import { saveAppState } from "./storageService";

/**
 * Valida rigorosamente se o objeto JSON importado corresponde ao schema esperado.
 * Evita injeção de dados corrompidos ou tipos inválidos na aplicação.
 */
export function validarBackupSchema(data: any): data is AppStorageSchema {
  if (!data || typeof data !== "object") return false;

  // 1. Validar configuracoes_usuario
  const config = data.configuracoes_usuario;
  if (!config || typeof config !== "object") return false;
  if (typeof config.schemaVersion !== "number") return false;
  if (typeof config.mesOnboarding !== "string" || !/^\d{4}-\d{2}$/.test(config.mesOnboarding)) return false;
  if (typeof config.onboardingCompleto !== "boolean") return false;

  // 2. Validar transacoes_fixas
  const tx = data.transacoes_fixas;
  if (!tx || typeof tx !== "object") return false;
  if (!Array.isArray(tx.rendas) || !Array.isArray(tx.contasFixas)) return false;

  // Validar itens de rendas
  for (const r of tx.rendas) {
    if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.value !== "number" || isNaN(r.value)) return false;
  }

  // Validar itens de contas fixas
  for (const c of tx.contasFixas) {
    if (typeof c.id !== "string" || typeof c.name !== "string" || typeof c.value !== "number" || isNaN(c.value)) return false;
    if (typeof c.dueDay !== "number" || c.dueDay < 1 || c.dueDay > 31) return false;
    if (typeof c.active !== "boolean") return false;
  }

  // 3. Validar meses_calculados
  const meses = data.meses_calculados;
  if (!Array.isArray(meses)) return false;
  for (const m of meses) {
    if (typeof m.mes !== "string" || !/^\d{4}-\d{2}$/.test(m.mes)) return false;
    if (typeof m.totalRendas !== "number" || typeof m.totalContasFixas !== "number") return false;
    if (typeof m.faturaCartao !== "number" || typeof m.saldoMensal !== "number" || typeof m.saldoAcumulado !== "number") return false;
  }

  return true;
}

/**
 * Aciona o download nativo de um arquivo JSON contendo o estado completo do app.
 */
export function exportarBackupDoApp(schema: AppStorageSchema): void {
  try {
    const dataStr = JSON.stringify(schema, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    
    const dateStr = new Date().toISOString().substring(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_financeiro_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Falha ao exportar backup:", error);
    alert("Erro ao exportar arquivo de backup.");
  }
}

/**
 * Lê o arquivo JSON importado, valida seu schema e aplica-o ao localStorage de forma definitiva.
 */
export function importarBackupDoApp(file: File): Promise<AppStorageSchema> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        if (validarBackupSchema(json)) {
          // Gravação atômica na persistência definitiva
          saveAppState(
            json.configuracoes_usuario.mesOnboarding,
            json.transacoes_fixas.rendas,
            json.transacoes_fixas.contasFixas,
            json.meses_calculados
          );
          resolve(json);
        } else {
          reject(new Error("SCHEMA_INVALIDO"));
        }
      } catch (err) {
        reject(new Error("JSON_CORROMPIDO"));
      }
    };

    reader.onerror = () => reject(new Error("ERRO_LEITURA"));
    reader.readAsText(file);
  });
}
