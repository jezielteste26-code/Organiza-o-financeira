/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Motor de Cálculo Financeiro — calcularProjecao()
 *
 * Função pura que recebe dados iniciais de rendas e contas fixas
 * e retorna uma projeção de 12 meses com saldo acumulado.
 *
 * NENHUM valor mockado ou fictício é utilizado.
 * Todos os valores derivam exclusivamente dos dados fornecidos como entrada.
 */

import { FixedBill, IncomeSource } from "../types";
import { addMonths } from "../utils";

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de entrada e saída do motor de cálculo
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Dados iniciais fornecidos pelo usuário (ex: coletados no Onboarding).
 */
export interface ProjecaoInput {
  /** Mês de referência do primeiro mês da projeção no formato "AAAA-MM" */
  mesInicial: string;
  /** Fontes de renda cadastradas pelo usuário */
  rendas: IncomeSource[];
  /** Contas fixas cadastradas pelo usuário */
  contasFixas: FixedBill[];
}

/**
 * Resultado calculado para um único mês da projeção.
 */
export interface MesProjetado {
  /** Mês no formato "AAAA-MM" */
  mes: string;
  /** Total de rendas para o mês (Number, sem arredondamento implícito) */
  totalRendas: number;
  /** Total de contas fixas ativas para o mês */
  totalContasFixas: number;
  /**
   * Fatura de cartão: 0 para meses futuros (placeholder),
   * pronto para ser atualizado externamente com dados reais.
   */
  faturaCartao: number;
  /** Saldo líquido do mês = totalRendas - totalContasFixas - faturaCartao */
  saldoMensal: number;
  /**
   * Saldo acumulado: soma do saldo do mês com o saldo acumulado do mês anterior.
   * Representa o patrimônio/sobra real ao longo do tempo.
   */
  saldoAcumulado: number;
}

/**
 * Resultado completo da projeção.
 */
export interface ResultadoProjecao {
  /** Mês de início da projeção */
  mesInicial: string;
  /** Renda mensal base utilizada nos cálculos (fixada pelas rendas do mês inicial) */
  rendaMensalBase: number;
  /** Custo fixo mensal total (somente contas ativas) */
  custoFixoMensal: number;
  /** Saldo base mensal sem fatura de cartão */
  saldoBasesMensal: number;
  /** Array de 12 meses projetados */
  meses: MesProjetado[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Motor de Cálculo Principal
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `calcularProjecao` — Função pura que calcula a projeção financeira de 12 meses.
 *
 * Regras:
 * 1. Renda mensal = soma de todas as `rendas` com `month === mesInicial`
 *    (representa a renda recorrente mensal do usuário).
 * 2. Custo fixo = soma de todas as `contasFixas` com `active === true`.
 * 3. Saldo Mensal = Renda - Custo Fixo - Fatura Cartão.
 * 4. Fatura Cartão = 0 para todos os meses (placeholder para atualização futura).
 * 5. Saldo Acumulado = Saldo do mês atual + Saldo Acumulado do mês anterior.
 *
 * @param input - Dados iniciais: mês de referência, rendas e contas fixas.
 * @returns Objeto `ResultadoProjecao` com os 12 meses calculados.
 */
export function calcularProjecao(input: ProjecaoInput): ResultadoProjecao {
  const { mesInicial, rendas, contasFixas } = input;

  // 1. Calcula a renda base a partir do mês inicial
  //    Se a renda não for por mês específico, usa todas (renda recorrente)
  const rendasDoMesInicial = rendas.filter((r) => r.month === mesInicial);
  const rendasValidas = rendasDoMesInicial.length > 0 ? rendasDoMesInicial : rendas;

  const rendaMensalBase: number = Number(
    rendasValidas
      .reduce((acc, renda) => acc + Number(renda.value), 0)
      .toFixed(2)
  );

  // 2. Calcula o custo fixo total (somente contas ativas)
  const contasAtivas = contasFixas.filter((c) => c.active);
  const custoFixoMensal: number = Number(
    contasAtivas
      .reduce((acc, conta) => acc + Number(conta.value), 0)
      .toFixed(2)
  );

  // 3. Saldo mensal base (sem fatura de cartão)
  const saldoBasesMensal: number = Number(
    (rendaMensalBase - custoFixoMensal).toFixed(2)
  );

  // 4. Gera os 12 meses projetados
  let saldoAcumuladoAnterior: number = 0;

  const meses: MesProjetado[] = Array.from({ length: 12 }, (_, i) => {
    const mes = addMonths(mesInicial, i);

    // Fatura de cartão = 0 (placeholder para atualização manual posterior)
    const faturaCartao: number = 0;

    // Saldo líquido do mês
    const saldoMensal: number = Number(
      (rendaMensalBase - custoFixoMensal - faturaCartao).toFixed(2)
    );

    // Saldo acumulado: parte do mês anterior
    const saldoAcumulado: number = Number(
      (saldoAcumuladoAnterior + saldoMensal).toFixed(2)
    );

    // Atualiza o acumulador para o próximo mês
    saldoAcumuladoAnterior = saldoAcumulado;

    return {
      mes,
      totalRendas: rendaMensalBase,
      totalContasFixas: custoFixoMensal,
      faturaCartao,
      saldoMensal,
      saldoAcumulado,
    };
  });

  return {
    mesInicial,
    rendaMensalBase,
    custoFixoMensal,
    saldoBasesMensal,
    meses,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilitários auxiliares para consumo do resultado e Competência Temporal
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Ajusta o dia de vencimento cadastrado pelo usuário para o dia máximo real do mês corrente.
 * Por exemplo: vencimento dia 31 vira 28 ou 29 em fevereiro, e 30 em abril.
 *
 * @param anoMes - String no formato "AAAA-MM"
 * @param diaDesejado - Dia de vencimento desejado (1 a 31)
 * @returns O dia normalizado que cabe dentro do mês
 */
export function normalizarDiaVencimento(anoMes: string, diaDesejado: number): number {
  const [ano, mes] = anoMes.split("-").map(Number);
  // O construtor Date com dia 0 retorna o último dia do mês anterior.
  // Passando o próximo mês (mes) e dia 0, descobrimos quantos dias o mês corrente tem.
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  return Math.min(diaDesejado, ultimoDiaDoMes);
}

/**
 * Rotaciona a janela temporal (Rolling Window) da projeção financeira de 12 meses.
 * Se o mês atual for posterior ao primeiro mês da projeção salva, descarta os meses passados
 * e anexa novos meses vazios ao final da projeção, herdando corretamente o saldo acumulado
 * como ponto de partida (saldo inicial).
 *
 * @param mesesSalvos - Lista de meses salvos anteriormente
 * @param mesAtual - Mês de referência atual no formato "AAAA-MM"
 * @param rendaMensal - Renda mensal base para geração dos novos meses
 * @param custoFixo - Custo fixo mensal base para os novos meses
 * @returns Array rotacionado de exatamente 12 meses
 */
export function rotacionarJanelaTemporal(
  mesesSalvos: MesProjetado[],
  mesAtual: string,
  rendaMensal: number,
  custoFixo: number
): MesProjetado[] {
  if (mesesSalvos.length === 0) {
    return [];
  }

  // Ordena por ordem cronológica garantida
  const mesesOrdenados = [...mesesSalvos].sort((a, b) => a.mes.localeCompare(b.mes));
  const primeiroMesSalvo = mesesOrdenados[0].mes;

  // Se o mês atual for menor ou igual ao primeiro mês salvo, não precisa rotacionar
  if (mesAtual <= primeiroMesSalvo) {
    return mesesOrdenados;
  }

  // Filtra apenas os meses correspondentes ao mês atual em diante
  const mesesFuturosRestantes = mesesOrdenados.filter((m) => m.mes >= mesAtual);
  
  // Quantos meses precisamos adicionar ao final para manter 12 meses?
  const mesesEmFalta = 12 - mesesFuturosRestantes.length;

  if (mesesEmFalta <= 0) {
    return mesesFuturosRestantes.slice(0, 12);
  }

  // O último mês que restou no array servirá como base para obter o saldo acumulado anterior
  let saldoAcumuladoAnterior = 0;
  let ultimoMesDisponivel = mesAtual;

  if (mesesFuturosRestantes.length > 0) {
    const ultimo = mesesFuturosRestantes[mesesFuturosRestantes.length - 1];
    saldoAcumuladoAnterior = ultimo.saldoAcumulado;
    ultimoMesDisponivel = ultimo.mes;
  } else {
    // Se todos os meses salvos são do passado, pegamos o acumulado do último mês do passado
    const ultimoPassado = mesesOrdenados[mesesOrdenados.length - 1];
    saldoAcumuladoAnterior = ultimoPassado.saldoAcumulado;
    ultimoMesDisponivel = addMonths(ultimoPassado.mes, 1);
  }

  // Gera os novos meses necessários para completar a janela de 12 meses
  const novosMeses: MesProjetado[] = Array.from({ length: mesesEmFalta }, (_, i) => {
    // A referência de início para adicionar meses é a partir do último mês disponível
    const proximoMes = addMonths(ultimoMesDisponivel, mesesFuturosRestantes.length > 0 ? i + 1 : i);
    const faturaCartao = 0;
    const saldoMensal = Number((rendaMensal - custoFixo - faturaCartao).toFixed(2));
    
    // Tratamento de Déficit: O saldo do mês anterior (positivo ou negativo) é herdado
    const saldoAcumulado = Number((saldoAcumuladoAnterior + saldoMensal).toFixed(2));
    saldoAcumuladoAnterior = saldoAcumulado;

    return {
      mes: proximoMes,
      totalRendas: rendaMensal,
      totalContasFixas: custoFixo,
      faturaCartao,
      saldoMensal,
      saldoAcumulado,
    };
  });

  return [...mesesFuturosRestantes, ...novosMeses];
}

/**
 * Atualiza a fatura de cartão de um mês específico dentro de um resultado já calculado.
 * Recalcula o `saldoMensal` e propaga a alteração nos `saldoAcumulado` dos meses seguintes.
 *
 * @param resultado - Resultado da projeção gerado por `calcularProjecao`.
 * @param mes - Mês alvo no formato "AAAA-MM".
 * @param novaFatura - Valor real da fatura de cartão para o mês.
 * @returns Novo `ResultadoProjecao` com os dados recalculados de forma imutável.
 */
export function atualizarFaturaCartao(
  resultado: ResultadoProjecao,
  mes: string,
  novaFatura: number
): ResultadoProjecao {
  const faturaValidada: number = Number(Math.max(0, novaFatura).toFixed(2));
  let acumulado: number = 0;

  const mesesAtualizados: MesProjetado[] = resultado.meses.map((m) => {
    const fatura = m.mes === mes ? faturaValidada : m.faturaCartao;
    const saldoMensal = Number((m.totalRendas - m.totalContasFixas - fatura).toFixed(2));
    acumulado = Number((acumulado + saldoMensal).toFixed(2));

    return {
      ...m,
      faturaCartao: fatura,
      saldoMensal,
      saldoAcumulado: acumulado,
    };
  });

  return { ...resultado, meses: mesesAtualizados };
}

