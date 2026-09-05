"use client";

import { useState } from "react";
import { brl, budgetStatus, pct } from "@/lib/format";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { BudgetModal } from "./BudgetModal";
import { PrevistoRealizadoChart } from "./PrevistoRealizadoChart";
import { ComprasDoMes } from "./ComprasDoMes";

const cardCls =
  "rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]";
const labelCls =
  "mb-2.5 text-xs font-bold uppercase tracking-wide text-text-3";

export function EconomiaView() {
  const { savings, savingsTotal, budget, months } = useStore();
  const [budgetOpen, setBudgetOpen] = useState(false);

  const vazio = savings.length === 0 && months.length === 0 && budget.total === 0;
  const b = budgetStatus(budget.spent, budget.total);
  // Orcado x custo: o orcamento e uma meta mensal recorrente, entao usamos o
  // orcamento atual como referencia (orcado) em todos os meses, comparado ao
  // gasto real (custo) de cada mes.
  const orcado = budget.total;

  if (vazio) {
    return (
      <>
        <ScreenHeader title="Economia" subtitle="do mês" />
        <p className="pt-12 text-center text-[15px] leading-relaxed text-text-3">
          Ainda não há gastos registrados. Assim que você fechar a primeira
          compra na aba Lista, o gasto do mês e a economia aparecem aqui.
        </p>
        <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} />
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Economia" subtitle="do mês" />

      <div className="space-y-4 lg:space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          {/* Gasto do mes: o numero que se procura primeiro nesta tela */}
          <div className={cardCls}>
            <div className={labelCls}>Gasto do mês</div>
            <div className="mb-3.5 flex items-baseline gap-2">
              <span className="text-[36px] font-extrabold leading-none tracking-[-0.02em]">
                {brl(budget.spent)}
              </span>
              <span className="text-[14px] text-text-2">
                {budget.total > 0 ? `de ${brl(budget.total)} do orçamento` : "sem orçamento definido"}
              </span>
            </div>
            <div className="mb-3.5 h-3.5 overflow-hidden rounded-lg bg-card-2">
              <div
                className="h-full rounded-lg"
                style={{
                  width: `${Math.min(100, b.pct)}%`,
                  background: `var(--${b.tone})`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-[7px] text-[13px] font-bold ${
                  b.over ? "bg-neg-soft text-neg" : "bg-pos-soft text-pos"
                }`}
              >
                <span className="h-[7px] w-[7px] rounded-full bg-current" />
                {b.over ? `Acima em ${brl(-b.saldo)}` : `Restam ${brl(b.saldo)}`}
              </span>
              <button
                onClick={() => setBudgetOpen(true)}
                className="text-[13px] font-bold text-brand"
              >
                Ajustar
              </button>
            </div>
            <div className="mt-2.5 text-[12px] text-text-3">{pct(b.pct)} usado</div>
          </div>
          {/* Economia vs historico */}
          <div className={cardCls}>
            <div className={labelCls}>Economia vs histórico</div>
            <div className="mb-4 flex items-baseline gap-2.5">
              <span className="text-[40px] font-extrabold leading-none tracking-[-0.03em] text-pos">
                {brl(savingsTotal)}
              </span>
              <span className="text-[14px] text-text-2">neste mês</span>
            </div>
            <div className="flex flex-col">
              {savings.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
                >
                  <span className="text-[14px] font-bold">{s.name}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] text-text-3 line-through">
                      {brl(s.oldPrice)}
                    </span>
                    <span className="text-[13px] text-text-2">{brl(s.newPrice)}</span>
                    <span className="min-w-[64px] rounded-full bg-pos-soft px-2.5 py-[3px] text-center text-[13px] font-extrabold text-pos">
                      -{brl(s.saved)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Previsto (orcamento) x realizado (gasto) por mes */}
        <PrevistoRealizadoChart months={months} orcado={orcado} />

        <ComprasDoMes />
      </div>

      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </>
  );
}
