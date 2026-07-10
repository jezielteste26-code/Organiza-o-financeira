/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment, MonthlyReportSummary, CardPurchase } from "./types";

// Formata valores em Reais (BRL)
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Formata strings "AAAA-MM" para exibição (ex: "2026-07" -> "Julho / 2026")
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

// Retorna a diferença em meses entre duas datas "AAAA-MM" (fim - início)
export function getMonthDiff(startStr: string, endStr: string): number {
  const [startYear, startMonth] = startStr.split("-").map(Number);
  const [endYear, endMonth] = endStr.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

// Adiciona N meses a uma data "AAAA-MM"
export function addMonths(yearMonth: string, offset: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Gera uma lista consecutiva de meses "AAAA-MM" a partir de uma data inicial
export function getMonthsRange(startYearMonth: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(addMonths(startYearMonth, i));
  }
  return list;
}

// Calcula as parcelas ativas de uma fatura para um determinado mês de destino (projeção)
export function getProjectedInvoicePurchases(
  targetMonth: string,
  invoices: CardInvoice[]
): { purchases: CardPurchase[]; sourceInvoiceMonth: string | null } {
  // 1. Procuramos se há uma fatura real para o mês alvo
  const realInvoice = invoices.find((inv) => inv.referenceMonth === targetMonth);
  if (realInvoice) {
    return { purchases: realInvoice.purchases, sourceInvoiceMonth: targetMonth };
  }

  // 2. Se não houver fatura real, procuramos a fatura real mais recente ANTES do mês alvo
  const sortedPastInvoices = invoices
    .filter((inv) => inv.referenceMonth < targetMonth)
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));

  if (sortedPastInvoices.length === 0) {
    return { purchases: [], sourceInvoiceMonth: null };
  }

  const latestInvoice = sortedPastInvoices[0];
  const diffMonths = getMonthDiff(latestInvoice.referenceMonth, targetMonth);

  // Filtramos apenas as compras parceladas que continuam ativas no mês alvo
  const projectedPurchases: CardPurchase[] = latestInvoice.purchases
    .filter((purchase) => {
      if (!purchase.isInstallment) return false;
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const finalInstallmentAtTarget = current + diffMonths;
      return finalInstallmentAtTarget <= total;
    })
    .map((purchase) => {
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const projectedCurrent = current + diffMonths;
      const remaining = total - projectedCurrent;

      return {
        ...purchase,
        id: `${purchase.id}-proj-${targetMonth}`,
        installmentCurrent: projectedCurrent,
        installmentsRemaining: remaining,
      };
    });

  return {
    purchases: projectedPurchases,
    sourceInvoiceMonth: latestInvoice.referenceMonth,
  };
}

// Calcula o resumo financeiro completo para um determinado mês
export function calculateReport(
  month: string,
  incomes: IncomeSource[],
  fixedBills: FixedBill[],
  invoices: CardInvoice[],
  plannedInstallments: PlannedInstallment[]
): MonthlyReportSummary {
  // 1. Renda total para este mês
  const monthlyIncomes = incomes.filter((inc) => inc.month === month);
  const totalIncome = monthlyIncomes.reduce((acc, curr) => acc + curr.value, 0);

  // 2. Contas fixas ativas
  // Contas fixas são recorrentes e ativas
  const activeBills = fixedBills.filter((bill) => bill.active);
  const totalFixedBills = activeBills.reduce((acc, curr) => acc + curr.value, 0);

  // 3. Fatura de cartão (real ou projetada)
  const { purchases: invoicePurchases } = getProjectedInvoicePurchases(month, invoices);
  const realInvoice = invoices.find((inv) => inv.referenceMonth === month);
  
  // Se houver fatura real, usamos seu total real. 
  // Senão, calculamos a soma das parcelas projetadas para este mês.
  const totalCardInvoice = realInvoice 
    ? realInvoice.totalValue 
    : invoicePurchases.reduce((acc, curr) => acc + (curr.installmentValue || 0), 0);

  // 4. Parcelas simuladas/antecipadas que caem neste mês
  // O status deve ser "simulated" (simulações ativas)
  // Uma simulação é ativa se o mês alvo estiver entre o primeiro mês de cobrança e a última parcela
  const activeSimulatedInstallments = plannedInstallments.filter((plan) => {
    if (plan.status !== "simulated") return false;
    const diff = getMonthDiff(plan.firstChargeMonth, month);
    // Deve começar em ou após o primeiro mês, e não ter esgotado as parcelas
    return diff >= 0 && diff < plan.installmentTotal;
  });

  const totalSimulated = activeSimulatedInstallments.reduce((acc, curr) => acc + curr.installmentValue, 0);

  // 5. Saldo final
  const balance = totalIncome - (totalFixedBills + totalCardInvoice + totalSimulated);

  return {
    month,
    income: totalIncome,
    fixedBills: totalFixedBills,
    cardInvoice: totalCardInvoice,
    simulatedInstallments: totalSimulated,
    balance,
  };
}

// --- Funções de Leitura Local de Faturas Carrefour ---

export interface ParsedLine {
  date: string;           // "DD/MM"
  description: string;
  totalValue: number;
  isInstallment: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentValue?: number;
  isCredit: boolean;      // true = pagamento/estorno/desconto, não é gasto
}

export function parseValorBR(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", "."));
}

// Regexes fornecidas na especificação técnica do Carrefour:
// Linha com parcela: "09/10 037 - JDI - JUNDIAI - 5/10 259,70"
const INSTALLMENT_REGEX =
  /^(\d{2}\/\d{2})\s+(.+?)\s*-?\s*(\d{1,2})\/(\d{1,2})\s+([\d.]+,\d{2})(-?)\s*$/;

// Linha sem parcela: "16/01 Pagamento Banco CSF 1.679,39-"
const SIMPLE_REGEX =
  /^(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2})(-?)\s*$/;

export function parseInvoiceLine(line: string): ParsedLine | null {
  const clean = line.trim();
  if (!clean) return null;

  const installmentMatch = clean.match(INSTALLMENT_REGEX);
  if (installmentMatch) {
    const [, date, desc, curr, total, valueStr, sign] = installmentMatch;
    const installmentValue = parseValorBR(valueStr);
    const currNum = parseInt(curr, 10);
    const totalNum = parseInt(total, 10);
    return {
      date,
      description: desc.trim().replace(/-+$/, "").trim(),
      isInstallment: true,
      installmentCurrent: currNum,
      installmentTotal: totalNum,
      installmentValue,
      totalValue: installmentValue * totalNum,
      isCredit: sign === "-",
    };
  }

  const simpleMatch = clean.match(SIMPLE_REGEX);
  if (simpleMatch) {
    const [, date, desc, valueStr, sign] = simpleMatch;
    return {
      date,
      description: desc.trim(),
      isInstallment: false,
      totalValue: parseValorBR(valueStr),
      isCredit: sign === "-",
    };
  }

  return null;
}

export function getPurchaseFullDate(purchaseDateDM: string, referenceMonth: string): string {
  // purchaseDateDM é algo como "15/05"
  // referenceMonth é algo como "2026-07"
  const [refYear, refMonth] = referenceMonth.split("-").map(Number);
  const [day, month] = purchaseDateDM.split("/").map(Number);
  
  let year = refYear;
  // Se o mês da compra for maior que o mês de referência e o mês de referência for começo do ano (ex: Jan/Fev), assumimos ano anterior
  if (month > refMonth && refMonth <= 2) {
    year = refYear - 1;
  } else if (month > refMonth + 2) {
    // Se o mês for muito distante no futuro em relação ao mês da fatura, provavelmente é do ano anterior
    year = refYear - 1;
  }
  
  const yStr = year;
  const mStr = String(month).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");
  return `${yStr}-${mStr}-${dStr}`;
}

export function extractTotalValueFromText(text: string): number | null {
  const lines = text.split("\n");
  
  const patterns = [
    /(?:total\s+da\s+fatura\s+atual|total\s+desta\s+fatura|valor\s+total\s+da\s+fatura|total\s+a\s+pagar|pagamento\s+mínimo|fatura\s+atual)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
    /(?:fatura\s+atual|total\s+fatura)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
    /total\s*(?:r\$)?\s*([\d.]+,\d{2})/i
  ];

  for (const pattern of patterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return parseValorBR(match[1]);
      }
    }
  }
  return null;
}

