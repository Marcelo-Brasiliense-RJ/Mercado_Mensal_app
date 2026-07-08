"use client";

import { useState } from "react";
import { brl, budgetStatus, pct } from "@/lib/format";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { BudgetModal } from "./BudgetModal";

const cardCls =
  "rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]";
const labelCls =
  "mb-2.5 text-xs font-bold uppercase tracking-wide text-text-3";

export function EconomiaView() {
  const { savings, savingsTotal, budget, months } = useStore();
  const [budgetOpen, setBudgetOpen] = useState(false);

  const vazio = savings.length === 0 && months.length === 0 && budget.total === 0;
  const b = budgetStatus(budget.spent, budget.total);
  const chartMax = Math.max(budget.total, ...months.map((m) => m.value), 1) * 1.1;
  const linePos = (budget.total / chartMax) * 100;

  if (vazio) {
    return (
      <>
        <ScreenHeader title="Economia" subtitle="do mês" />
        <p className="pt-12 text-center text-[15px] leading-relaxed text-text-3">
          Ainda não há gastos registrados. Conforme você registra compras pelo
          bot, a economia e o orçamento do mês aparecem aqui.
        </p>
        <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} />
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Economia" subtitle="do mês" />

      <div className="space-y-4 lg:space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
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

          {/* Orcamento do mes */}
          <div className={cardCls}>
            <div className={labelCls}>Orçamento do mês</div>
            <div className="mb-3.5 flex items-baseline gap-2">
              <span className="text-[36px] font-extrabold leading-none tracking-[-0.02em]">
                {brl(budget.spent)}
              </span>
              <span className="text-[14px] text-text-2">de {brl(budget.total)}</span>
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
        </div>

        {/* Gasto por mes */}
        <div className={cardCls}>
          <div className="mb-[18px] flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-text-3">
              Gasto por mês
            </span>
            <span className="text-xs text-text-3">últimos 6 meses</span>
          </div>
          <div className="relative h-[200px] pt-5 lg:h-[230px]">
            <div
              className="pointer-events-none absolute inset-x-0 z-[2] border-t-[1.5px] border-dashed border-text-3"
              style={{ bottom: `${linePos}%` }}
            >
              <span className="absolute -top-4 right-0 bg-card px-1.5 text-[11px] font-bold text-text-3">
                orçamento {brl(budget.total)}
              </span>
            </div>
            <div className="flex h-full items-end gap-3 lg:gap-5">
              {months.map((m) => {
                const h = (m.value / chartMax) * 100;
                const color = m.current
                  ? "var(--brand)"
                  : m.value > budget.total
                    ? "var(--neg)"
                    : "var(--pos)";
                return (
                  <div
                    key={m.label}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-[12px] font-bold text-text-2">{m.value}</span>
                    <div
                      className="w-full max-w-[56px] rounded-t-[9px]"
                      style={{ height: `${h}%`, background: color }}
                    />
                    <span
                      className={`text-[12px] font-bold ${
                        m.current ? "text-text" : "text-text-2"
                      }`}
                    >
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </>
  );
}
