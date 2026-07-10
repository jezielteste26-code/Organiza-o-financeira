/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedBill, IncomeSource } from "../types";

export interface FinancialHealthStatus {
  comprometimentoNecessidades: number; // % comprometida com contas essenciais
  totalNecessidades: number;
  totalGeralContas: number;
  rendaTotal: number;
  statusNecessidades: "ideal" | "limite" | "critico";
  statusMensal: "positivo" | "déficit";
  alerta: string | null;
}

/**
 * analisaSaudeFinanceira — Avalia a distribuição de gastos do usuário baseando-se na Regra 50-30-20.
 * Considera custos essenciais as categorias: Moradia, Saúde, Educação, Transporte, Alimentação.
 */
export function analisarSaudeFinanceira(
  rendas: IncomeSource[],
  contas: FixedBill[]
): FinancialHealthStatus {
  const rendaTotal = Number(rendas.reduce((acc, r) => acc + Number(r.value), 0).toFixed(2));
  
  // Categorias essenciais para o cálculo do limite dos 50%
  const categoriasNecessidades = ["Moradia", "Saúde", "Educação", "Transporte", "Alimentação"];
  
  const totalNecessidades = Number(
    contas
      .filter(c => c.active && c.category && categoriasNecessidades.includes(c.category))
      .reduce((acc, c) => acc + Number(c.value), 0)
      .toFixed(2)
  );

  const totalGeralContas = Number(
    contas
      .filter(c => c.active)
      .reduce((acc, c) => acc + Number(c.value), 0)
      .toFixed(2)
  );

  const comprometimentoNecessidades = rendaTotal > 0 ? Number(((totalNecessidades / rendaTotal) * 100).toFixed(1)) : 0;
  
  let statusNecessidades: "ideal" | "limite" | "critico" = "ideal";
  if (comprometimentoNecessidades > 65) statusNecessidades = "critico";
  else if (comprometimentoNecessidades > 50) statusNecessidades = "limite";

  const statusMensal = rendaTotal >= totalGeralContas ? "positivo" : "déficit";

  let alerta: string | null = null;
  if (statusMensal === "déficit") {
    alerta = "Atenção: Suas despesas fixas superam sua renda. Você está operando em déficit mensal!";
  } else if (statusNecessidades === "critico") {
    alerta = "Alerta: Seus custos essenciais superam os 50% ideais da sua renda. Evite novos compromissos fixos.";
  }

  return {
    comprometimentoNecessidades,
    totalNecessidades,
    totalGeralContas,
    rendaTotal,
    statusNecessidades,
    statusMensal,
    alerta
  };
}
