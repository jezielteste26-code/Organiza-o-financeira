/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { PlannedInstallment } from "../types";
import { formatCurrency, formatMonth, getMonthDiff } from "../utils";
import { Plus, Check, Archive, AlertCircle, ArrowUpRight, HelpCircle, Calendar, Trash2 } from "lucide-react";
import { motion } from "motion/react";

interface PlannedInstallmentsProps {
  selectedMonth: string;
  plannedInstallments: PlannedInstallment[];
  setPlannedInstallments: React.Dispatch<React.SetStateAction<PlannedInstallment[]>>;
}

export default function PlannedInstallments({
  selectedMonth,
  plannedInstallments,
  setPlannedInstallments,
}: PlannedInstallmentsProps) {
  const [desc, setDesc] = useState("");
  const [totalVal, setTotalVal] = useState("");
  const [instTotal, setInstTotal] = useState("6");
  const [firstMonth, setFirstMonth] = useState("");

  // Alterna visualização entre ativas e históricas (reconciliadas/arquivadas)
  const [viewHistoric, setViewHistoric] = useState(false);

  // Calcula o valor da parcela automaticamente ao mudar total ou parcelas
  const handleCreateSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !totalVal || !instTotal) return;

    const total = parseFloat(totalVal);
    const parcels = parseInt(instTotal);
    const chargeMonth = firstMonth || selectedMonth; // Default para o mês selecionado atual se vazio

    if (isNaN(total) || total <= 0 || isNaN(parcels) || parcels <= 0) return;

    const installmentValue = parseFloat((total / parcels).toFixed(2));

    const newSim: PlannedInstallment = {
      id: `sim-${Date.now()}`,
      description: desc,
      totalValue: total,
      installmentTotal: parcels,
      installmentValue,
      firstChargeMonth: chargeMonth,
      status: "simulated",
    };

    setPlannedInstallments((prev) => [...prev, newSim]);

    // Limpa form
    setDesc("");
    setTotalVal("");
    setInstTotal("6");
    setFirstMonth("");
  };

  const handleUpdateStatus = (id: string, newStatus: "simulated" | "confirmed_in_invoice" | "archived") => {
    setPlannedInstallments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleDeleteSimulation = (id: string) => {
    setPlannedInstallments((prev) => prev.filter((item) => item.id !== id));
  };

  const activeSimulations = plannedInstallments.filter((item) => item.status === "simulated");
  const historicSimulations = plannedInstallments.filter((item) => item.status !== "simulated");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="planned-installments-container">
      
      {/* Formulário de Criação de Simulação */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpRight className="w-5 h-5 text-zinc-800 shrink-0" />
            <h3 className="text-base font-black text-zinc-900 uppercase tracking-wider">Simular Compra</h3>
          </div>

          <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
            Cadastre compras parceladas que você planeja fazer ou que comprou recentemente, mas que ainda não aparecem na fatura do cartão. Isso projetará imediatamente o impacto delas nos próximos meses.
          </p>

          <form onSubmit={handleCreateSimulation} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Descrição do Item / Serviço</label>
              <input
                type="text"
                placeholder="Ex: Notebook Trabalho, Geladeira Cozinha"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-950"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Valor Total (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={totalVal}
                  onChange={(e) => setTotalVal(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-950"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Qtd. de Parcelas</label>
                <select
                  value={instTotal}
                  onChange={(e) => setInstTotal(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-hidden focus:border-zinc-950"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Primeiro Mês de Cobrança</label>
              <input
                type="month"
                value={firstMonth}
                onChange={(e) => setFirstMonth(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-hidden focus:border-zinc-950"
              />
              <span className="text-[10px] text-zinc-400 mt-1.5 block leading-normal">
                Deixe em branco para começar no mês atual ({formatMonth(selectedMonth)})
              </span>
            </div>

            {totalVal && instTotal && (
              <div className="p-3.5 bg-zinc-50 border border-zinc-200/60 rounded-xl flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Parcelas:</span>
                <span className="font-black text-indigo-600 text-xs">
                  {instTotal}x de {formatCurrency(parseFloat(totalVal) / parseInt(instTotal))}
                </span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-sm"
            >
              Simular Compra Parcelada
            </button>
          </form>
        </div>
      </div>

      {/* Lista de Simulações */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          
          {/* Header de Abas / Seleção */}
          <div className="flex border-b border-zinc-150 pb-3 mb-4 justify-between items-center flex-wrap gap-2">
            <div className="flex gap-4">
              <button
                onClick={() => setViewHistoric(false)}
                className={`text-xs font-black uppercase tracking-wider pb-2 border-b-2 transition-all ${
                  !viewHistoric
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Ativas ({activeSimulations.length})
              </button>
              <button
                onClick={() => setViewHistoric(true)}
                className={`text-xs font-black uppercase tracking-wider pb-2 border-b-2 transition-all ${
                  viewHistoric
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Histórico ({historicSimulations.length})
              </button>
            </div>
          </div>

          {/* Listagem */}
          <div className="space-y-3 text-sm">
            {!viewHistoric ? (
              /* Simulações Ativas */
              activeSimulations.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
                  <HelpCircle className="w-8 h-8 text-zinc-300" />
                  <p className="font-bold text-zinc-500">Nenhuma simulação ativa no momento.</p>
                  <p className="text-xs text-zinc-400">Crie uma nova no formulário ao lado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSimulations.map((sim) => {
                    // Calcula a parcela correspondente no mês selecionado atual
                    const diffMonths = getMonthDiff(sim.firstChargeMonth, selectedMonth);
                    let parcelLabel = "";
                    let isChargingInSelectedMonth = false;

                    if (diffMonths < 0) {
                      parcelLabel = "Não iniciada (futura)";
                    } else if (diffMonths >= sim.installmentTotal) {
                      parcelLabel = "Finalizada";
                    } else {
                      parcelLabel = `Parcela ${diffMonths + 1} de ${sim.installmentTotal}`;
                      isChargingInSelectedMonth = true;
                    }

                    return (
                      <div
                        key={sim.id}
                        className={`p-4 rounded-2xl border transition-all duration-200 ${
                          isChargingInSelectedMonth
                            ? "bg-indigo-50/25 border-indigo-150"
                            : "bg-white border-zinc-200 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h4 className="font-bold text-zinc-900 text-sm">{sim.description}</h4>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-zinc-400">
                              <span className="flex items-center gap-1 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                                Estreia: {formatMonth(sim.firstChargeMonth)}
                              </span>
                              <span className="text-zinc-300">•</span>
                              <span className="font-bold text-indigo-600">{parcelLabel}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-black text-zinc-950 block text-sm">
                              {formatCurrency(sim.installmentValue)}
                              <span className="text-[10px] text-zinc-500 font-normal"> /mês</span>
                            </span>
                            <span className="text-[10px] text-zinc-400 block mt-0.5 font-bold">
                              Total: {formatCurrency(sim.totalValue)}
                            </span>
                          </div>
                        </div>

                        {/* Ações Rápidas */}
                        <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-between items-center text-xs">
                          <span className="text-zinc-400 font-semibold text-[10px] uppercase">
                            {isChargingInSelectedMonth 
                              ? "Compromete o orçamento" 
                              : "Sem cobrança este mês"}
                          </span>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateStatus(sim.id, "confirmed_in_invoice")}
                              className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1 transition-all shadow-2xs"
                              title="Marcar como já inclusa na fatura real para parar de duplicar despesa"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Confirmar
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(sim.id, "archived")}
                              className="px-2.5 py-1.5 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 font-bold text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1 transition-all"
                              title="Arquivar simulação"
                            >
                              <Archive className="w-3.5 h-3.5" /> Arquivar
                            </button>
                            <button
                              onClick={() => handleDeleteSimulation(sim.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Histórico (Conciliadas/Arquivadas) */
              historicSimulations.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 font-bold">
                  Nenhum registro histórico de simulações.
                </div>
              ) : (
                <div className="space-y-2">
                  {historicSimulations.map((sim) => (
                    <div
                      key={sim.id}
                      className="p-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/60 flex justify-between items-center text-xs group transition-all duration-200"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-zinc-800 text-sm">{sim.description}</h4>
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${
                              sim.status === "confirmed_in_invoice"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-150"
                                : "bg-zinc-100 text-zinc-500 border-zinc-200"
                            }`}
                          >
                            {sim.status === "confirmed_in_invoice" ? "Lançada" : "Arquivada"}
                          </span>
                        </div>
                        <p className="text-zinc-400 mt-1 font-medium">
                          {sim.installmentTotal} parcelas de {formatCurrency(sim.installmentValue)} • Total: {formatCurrency(sim.totalValue)}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateStatus(sim.id, "simulated")}
                          className="px-2.5 py-1.5 bg-white border border-zinc-200 text-zinc-700 font-bold text-[10px] uppercase tracking-wider hover:bg-zinc-50 rounded-lg transition-all"
                        >
                          Restaurar
                        </button>
                        <button
                          onClick={() => handleDeleteSimulation(sim.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          title="Excluir Definitivamente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
