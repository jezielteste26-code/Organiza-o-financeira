/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "../types";

// Chaves utilizadas para a persistência local
const KEYS = {
  FIXED_BILLS: "fin_fixed_bills",
  INCOMES: "fin_incomes",
  INVOICES: "fin_invoices",
  PLANNED: "fin_planned",
};

/**
 * Função utilitária para salvar dados de forma segura no LocalStorage.
 * Detecta e trata o erro de cota excedida (QuotaExceededError).
 */
export function safeSetItem(key: string, data: any): void {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
  } catch (error: any) {
    // Detecta se o LocalStorage está cheio (QuotaExceededError)
    const isQuotaExceeded =
      error instanceof DOMException &&
      (error.code === 22 ||
        error.code === 1014 ||
        error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED");

    if (isQuotaExceeded) {
      throw new Error("STORAGE_FULL");
    }
    throw error;
  }
}

/**
 * Recupera um item do LocalStorage de forma segura.
 */
export function safeGetItem<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Erro ao ler chave ${key} do LocalStorage:`, error);
    return defaultValue;
  }
}

// ==========================================
// CRUD: Contas Fixas (Fixed Bills)
// ==========================================
export const fixedBillsStorage = {
  getAll: (initial: FixedBill[] = []): FixedBill[] => {
    return safeGetItem<FixedBill[]>(KEYS.FIXED_BILLS, initial);
  },
  saveAll: (bills: FixedBill[]): void => {
    safeSetItem(KEYS.FIXED_BILLS, bills);
  },
};

// ==========================================
// CRUD: Receitas (Incomes)
// ==========================================
export const incomesStorage = {
  getAll: (initial: IncomeSource[] = []): IncomeSource[] => {
    return safeGetItem<IncomeSource[]>(KEYS.INCOMES, initial);
  },
  saveAll: (incomes: IncomeSource[]): void => {
    safeSetItem(KEYS.INCOMES, incomes);
  },
};

// ==========================================
// CRUD: Faturas do Cartão (Card Invoices)
// ==========================================
export const invoicesStorage = {
  getAll: (initial: CardInvoice[] = []): CardInvoice[] => {
    return safeGetItem<CardInvoice[]>(KEYS.INVOICES, initial);
  },
  saveAll: (invoices: CardInvoice[]): void => {
    safeSetItem(KEYS.INVOICES, invoices);
  },
};

// ==========================================
// CRUD: Parcelas Simuladas (Planned Installments)
// ==========================================
export const plannedInstallmentsStorage = {
  getAll: (initial: PlannedInstallment[] = []): PlannedInstallment[] => {
    return safeGetItem<PlannedInstallment[]>(KEYS.PLANNED, initial);
  },
  saveAll: (planned: PlannedInstallment[]): void => {
    safeSetItem(KEYS.PLANNED, planned);
  },
};
