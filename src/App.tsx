/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "./types";
import { formatMonth, addMonths } from "./utils";
import Dashboard from "./components/Dashboard";
import FixedBills from "./components/FixedBills";
import CardInvoices from "./components/CardInvoices";
import PlannedInstallments from "./components/PlannedInstallments";
import Reports from "./components/Reports";
import { Landmark, LayoutDashboard, Wallet, CreditCard, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Menu, X, Coins } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Dados Iniciais de Demonstração (Caso o localStorage esteja vazio) ---
const INITIAL_BILLS: FixedBill[] = [
  { id: "bill-1", name: "Aluguel & Condomínio", value: 1650, dueDay: 5, category: "Moradia", active: true },
  { id: "bill-2", name: "Internet Fibra", value: 120, dueDay: 10, category: "Serviços", active: true },
  { id: "bill-3", name: "Netflix Premium", value: 55.9, dueDay: 15, category: "Assinaturas", active: true },
  { id: "bill-4", name: "Academia Convênio", value: 110, dueDay: 20, category: "Saúde", active: true },
];

const INITIAL_INCOMES: IncomeSource[] = [
  { id: "inc-1", label: "Salário Principal", value: 5800, month: "2026-07" },
  { id: "inc-2", label: "Projeto Freelance Website", value: 1500, month: "2026-07" },
  // Pré-cadastrado para os próximos meses para dar vida à projeção
  { id: "inc-3", label: "Salário Principal", value: 5800, month: "2026-08" },
  { id: "inc-4", label: "Salário Principal", value: 5800, month: "2026-09" },
];

const INITIAL_INVOICES: CardInvoice[] = [
  {
    id: "inv-demo-july",
    referenceMonth: "2026-07",
    uploadedAt: new Date().toISOString(),
    fileName: "fatura_nubank_julho.pdf",
    totalValue: 980,
    parsedAt: new Date().toISOString(),
    needsReview: false,
    purchases: [
      {
        id: "pur-1",
        description: "Supermercado Pão de Açúcar",
        category: "Alimentação",
        purchaseDate: "2026-07-02",
        totalValue: 350,
        isInstallment: false,
      },
      {
        id: "pur-2",
        description: "Posto Shell Combustível",
        category: "Transporte",
        purchaseDate: "2026-07-05",
        totalValue: 180,
        isInstallment: false,
      },
      {
        id: "pur-3",
        description: "Smartphone Xiaomi 10x",
        category: "Tecnologia",
        purchaseDate: "2026-04-10",
        totalValue: 1200,
        isInstallment: true,
        installmentCurrent: 4,
        installmentTotal: 10,
        installmentValue: 120,
        installmentsRemaining: 6,
      },
      {
        id: "pur-4",
        description: "Curso de UI/UX Designer 12x",
        category: "Educação",
        purchaseDate: "2026-05-15",
        totalValue: 1800,
        isInstallment: true,
        installmentCurrent: 3,
        installmentTotal: 12,
        installmentValue: 150,
        installmentsRemaining: 9,
      },
      {
        id: "pur-5",
        description: "Restaurante Outback",
        category: "Alimentação",
        purchaseDate: "2026-07-08",
        totalValue: 180,
        isInstallment: false,
      },
    ],
  },
];

const INITIAL_PLANNED: PlannedInstallment[] = [
  {
    id: "plan-1",
    description: "Ar Condicionado Split 12000 BTUs",
    totalValue: 1800,
    installmentTotal: 6,
    installmentValue: 300,
    firstChargeMonth: "2026-08",
    status: "simulated",
  },
  {
    id: "plan-2",
    description: "Passagem Aérea Férias",
    totalValue: 1200,
    installmentTotal: 4,
    installmentValue: 300,
    firstChargeMonth: "2026-07",
    status: "simulated",
  },
];

export default function App() {
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-07");
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // --- Inicialização dos Estados com LocalStorage ---
  const [fixedBills, setFixedBills] = useState<FixedBill[]>(() => {
    const saved = localStorage.getItem("fin_fixed_bills");
    return saved ? JSON.parse(saved) : INITIAL_BILLS;
  });

  const [incomes, setIncomes] = useState<IncomeSource[]>(() => {
    const saved = localStorage.getItem("fin_incomes");
    return saved ? JSON.parse(saved) : INITIAL_INCOMES;
  });

  const [invoices, setInvoices] = useState<CardInvoice[]>(() => {
    const saved = localStorage.getItem("fin_invoices");
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [plannedInstallments, setPlannedInstallments] = useState<PlannedInstallment[]>(() => {
    const saved = localStorage.getItem("fin_planned");
    return saved ? JSON.parse(saved) : INITIAL_PLANNED;
  });

  // --- Sincronização automática com LocalStorage ---
  useEffect(() => {
    localStorage.setItem("fin_fixed_bills", JSON.stringify(fixedBills));
  }, [fixedBills]);

  useEffect(() => {
    localStorage.setItem("fin_incomes", JSON.stringify(incomes));
  }, [incomes]);

  useEffect(() => {
    localStorage.setItem("fin_invoices", JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem("fin_planned", JSON.stringify(plannedInstallments));
  }, [plannedInstallments]);

  // Navegação rápida de meses
  const handlePrevMonth = () => {
    setSelectedMonth((prev) => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => addMonths(prev, 1));
  };

  // Conciliação de Simulação Manual (Regra de Negócio 4.3)
  const handleConfirmReconciliation = (plannedId: string, status: "confirmed_in_invoice" | "archived") => {
    setPlannedInstallments((prev) =>
      prev.map((item) => (item.id === plannedId ? { ...item, status } : item))
    );
  };

  // Carregar Backup Completo
  const handleImportBackup = (backup: any) => {
    if (backup.fixedBills) setFixedBills(backup.fixedBills);
    if (backup.incomes) setIncomes(backup.incomes);
    if (backup.invoices) setInvoices(backup.invoices);
    if (backup.plannedInstallments) setPlannedInstallments(backup.plannedInstallments);
  };

  // Itens do Menu de Navegação
  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "fixas", label: "Renda & Contas Fixas", icon: Wallet },
    { id: "cartao", label: "Fatura do Cartão", icon: CreditCard },
    { id: "planejadas", label: "Parcelas Simuladas", icon: ArrowUpRight },
    { id: "relatorios", label: "Relatórios & Backup", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans antialiased" id="main-app-shell">
      
      {/* HEADER DE NAVEGAÇÃO DE MESES */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-200/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-xs">
            <Coins className="w-5 h-5 shrink-0 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-zinc-800 leading-tight tracking-tight text-sm sm:text-base">
              Controle Financeiro
            </h1>
            <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider block">
              Pessoal & IA
            </span>
          </div>
        </div>

        {/* Month Selector Widget */}
        <div className="flex items-center gap-1.5 bg-zinc-100 border border-zinc-200/60 rounded-2xl p-1 shadow-2xs">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-xl transition-all"
            title="Mês Anterior"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
          </button>
          
          <span className="text-xs sm:text-sm font-bold text-zinc-800 px-3 min-w-[130px] text-center select-none">
            {formatMonth(selectedMonth)}
          </span>

          <button
            onClick={handleNextMonth}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-xl transition-all"
            title="Próximo Mês"
          >
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Botão Hambúrguer Mobile */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-zinc-500 hover:text-zinc-950 md:hidden hover:bg-zinc-100 rounded-xl transition-all"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* CORE FRAME LAYOUT */}
      <div className="flex-1 flex flex-col md:flex-row">
        
        {/* SIDEBAR NAVEGAÇÃO DESKTOP */}
        <aside className="w-64 bg-white border-r border-zinc-200/60 p-4 hidden md:flex flex-col gap-1.5 shrink-0">
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-3 mb-4 select-none">
            Navegação Principal
          </div>

          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-md shadow-zinc-200"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-400"}`} />
                {item.label}
              </button>
            );
          })}
        </aside>

        {/* MENU MOBILE EXPANSÍVEL */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border-b border-zinc-200 flex flex-col p-4 md:hidden shadow-xs gap-1.5"
            >
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      isActive
                        ? "bg-zinc-900 text-white shadow-xs"
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-400"}`} />
                    {item.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONTAINER DO CONTEÚDO PRINCIPAL */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + selectedMonth}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "dashboard" && (
                <Dashboard
                  selectedMonth={selectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  invoices={invoices}
                  plannedInstallments={plannedInstallments}
                  setActiveTab={setActiveTab}
                  onConfirmReconciliation={handleConfirmReconciliation}
                />
              )}

              {activeTab === "fixas" && (
                <FixedBills
                  selectedMonth={selectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  setIncomes={setIncomes}
                  setFixedBills={setFixedBills}
                />
              )}

              {activeTab === "cartao" && (
                <CardInvoices
                  selectedMonth={selectedMonth}
                  invoices={invoices}
                  setInvoices={setInvoices}
                />
              )}

              {activeTab === "planejadas" && (
                <PlannedInstallments
                  selectedMonth={selectedMonth}
                  plannedInstallments={plannedInstallments}
                  setPlannedInstallments={setPlannedInstallments}
                />
              )}

              {activeTab === "relatorios" && (
                <Reports
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  invoices={invoices}
                  plannedInstallments={plannedInstallments}
                  onImportBackup={handleImportBackup}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-100 py-4 text-center text-xs text-gray-400 select-none">
        <p>© 2026 Controle Financeiro Pessoal • Processamento Inteligente de Faturas por IA</p>
      </footer>
    </div>
  );
}
