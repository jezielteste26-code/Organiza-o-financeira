/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Conta fixa mensal
export interface FixedBill {
  id: string;
  name: string;
  value: number;
  dueDay: number; // dia do mês (1 a 31)
  category?: string;
  active: boolean;
}

// Renda mensal
export interface IncomeSource {
  id: string;
  label: string; // ex: "Freela A"
  value: number;
  month: string; // formato "AAAA-MM" (ex: "2026-07")
}

// Compra individual do cartão (incluída em uma fatura)
export interface CardPurchase {
  id: string;
  description: string;
  category?: string;
  purchaseDate?: string; // "AAAA-MM-DD" ou null
  totalValue: number; // valor total da compra (se parcelada, valor total cheio)
  isInstallment: boolean;
  installmentCurrent?: number; // ex: 7 (da parcela 7/10)
  installmentTotal?: number;   // ex: 10
  installmentValue?: number;   // valor de cada parcela
  installmentsRemaining?: number; // calculado: installmentTotal - installmentCurrent (contando a partir do mês da fatura)
}

// Fatura do cartão (1 documento "vivo" por mês, sobrescrito a cada upload do mesmo mês)
export interface CardInvoice {
  id: string;
  referenceMonth: string; // "AAAA-MM" (ex: "2026-07")
  uploadedAt: string; // ISO string
  fileName?: string; // Nome do arquivo carregado
  totalValue: number;
  purchases: CardPurchase[];
  parsedAt: string; // ISO string
  needsReview: boolean; // true se a IA teve baixa confiança ou dados incompletos
}

// Parcela simulada/antecipada (cadastrada manualmente antes de entrar na fatura)
export interface PlannedInstallment {
  id: string;
  description: string;
  totalValue: number;
  installmentTotal: number;
  installmentValue: number;
  firstChargeMonth: string; // "AAAA-MM" -- mês em que a 1ª parcela cai
  status: "simulated" | "confirmed_in_invoice" | "archived";
}

// Relatório Financeiro Mensal
export interface MonthlyReportSummary {
  month: string; // "AAAA-MM"
  income: number;
  fixedBills: number;
  cardInvoice: number;
  simulatedInstallments: number;
  balance: number;
}
