/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * syncService — Sincronização Compartilhada por Código
 *
 * Permite que dois ou mais usuários compartilhem o mesmo painel financeiro
 * através de um código simples. Os dados são salvos no servidor como um
 * arquivo JSON (sync_data/data_<code>.json).
 */

const SYNC_CODE_KEY = "fin_sync_code";

// ──────────────────────────────────────────────────────────────────────────────
// Gerenciamento do Código de Sincronização
// ──────────────────────────────────────────────────────────────────────────────

/** Retorna o código de sincronização ativo (ou null se não houver). */
export function getSyncCode(): string | null {
  return localStorage.getItem(SYNC_CODE_KEY);
}

/** Ativa um código de sincronização, salvando no localStorage. */
export function setSyncCode(code: string): void {
  localStorage.setItem(SYNC_CODE_KEY, code);
}

/** Desativa a sincronização removendo o código do localStorage. */
export function clearSyncCode(): void {
  localStorage.removeItem(SYNC_CODE_KEY);
}

/** Gera um código aleatório e legível de 6 caracteres (ex: "kf9x2m"). */
export function gerarCodigoAleatorio(): string {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────────────
// Comunicação com a API do Servidor
// ──────────────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "no_code";

/**
 * Envia os dados atuais do app para o servidor.
 * Retorna true em caso de sucesso, false em caso de falha.
 */
export async function pushToServer(data: object): Promise<boolean> {
  const code = getSyncCode();
  if (!code) return false;

  try {
    const res = await fetch(`/api/sync/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch (err) {
    console.error("[syncService] Falha ao enviar dados para o servidor:", err);
    return false;
  }
}

/**
 * Busca os dados do servidor para o código ativo.
 * Retorna o objeto de dados em caso de sucesso, ou null se não houver dados
 * ou se ocorrer um erro.
 */
export async function pullFromServer(): Promise<object | null> {
  const code = getSyncCode();
  if (!code) return null;

  try {
    const res = await fetch(`/api/sync/${encodeURIComponent(code)}`);
    if (res.status === 404) return null; // Código sem dados ainda
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.success && json.data) return json.data;
    return null;
  } catch (err) {
    console.error("[syncService] Falha ao buscar dados do servidor:", err);
    return null;
  }
}
