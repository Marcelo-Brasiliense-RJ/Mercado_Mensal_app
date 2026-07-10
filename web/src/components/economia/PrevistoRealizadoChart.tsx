"use client";

import { brl } from "@/lib/format";
import type { MonthPoint } from "@/lib/types";

// Combo previsto x realizado: barras = gasto real (realizado), linha = orcamento
// (previsto, meta mensal). Grade leve no eixo Y, marcadores na linha, tooltips.

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function curto(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (Number.isInteger(k) ? String(k) : k.toFixed(1).replace(".", ",")) + "k";
  }
  return String(Math.round(n));
}

export function PrevistoRealizadoChart({
  months,
  orcado,
}: {
  months: MonthPoint[];
  orcado: number;
}) {
  const vals = months.map((m) => m.value);
  const max = niceCeil(Math.max(orcado, ...vals, 1));
  const temPrevisto = orcado > 0;
  const orcPct = (orcado / max) * 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const gap = "gap-2 lg:gap-3.5";

  return (
    <div className="rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-text-3">
          Previsto x realizado
        </span>
        <span className="text-xs text-text-3">últimos 6 meses</span>
      </div>

      {/* Legenda */}
      <div className="mb-4 flex items-center gap-4 text-[11px] font-bold text-text-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] bg-[#3E6AD0]" />
          Realizado
        </span>
        {temPrevisto && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-4 items-center">
              <span className="h-[2.5px] w-full rounded bg-brand" />
              <span className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-brand ring-2 ring-card" />
            </span>
            Previsto {brl(orcado)}
          </span>
        )}
      </div>

      <div className="relative pl-9 pr-1">
        <div className="relative h-[210px] lg:h-[240px]">
          {/* Grade + rótulos do eixo Y */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0"
              style={{ bottom: `${(t / max) * 100}%` }}
            >
              <span className="absolute -left-9 w-8 -translate-y-1/2 text-right text-[10px] text-text-3">
                {curto(t)}
              </span>
              <div className="h-px w-full bg-border" />
            </div>
          ))}

          {/* Barras (realizado) */}
          <div className={`absolute inset-0 flex items-end ${gap}`}>
            {months.map((m) => {
              const h = (m.value / max) * 100;
              const over = temPrevisto && m.value > orcado;
              return (
                <div key={m.label} className="flex h-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-[34px] rounded-t-[6px]"
                    title={`${m.label}: ${brl(m.value)}`}
                    style={{
                      height: `${m.value > 0 ? Math.max(2, h) : 0}%`,
                      background: over
                        ? "linear-gradient(180deg, var(--neg), color-mix(in srgb, var(--neg) 80%, black))"
                        : "linear-gradient(180deg, #5A86E8, #3E6AD0)",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Linha do previsto (meta) + marcadores */}
          {temPrevisto && (
            <>
              <div
                className="absolute inset-x-0 h-[2.5px] rounded bg-brand"
                style={{ bottom: `${orcPct}%` }}
              />
              <div className={`pointer-events-none absolute inset-0 flex ${gap}`}>
                {months.map((m) => (
                  <div key={m.label} className="relative h-full flex-1">
                    <span
                      title={`Previsto: ${brl(orcado)}`}
                      className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-brand ring-2 ring-card"
                      style={{ bottom: `${orcPct}%` }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Rótulos do eixo X */}
        <div className={`mt-2 flex ${gap}`}>
          {months.map((m) => (
            <div
              key={m.label}
              className={`flex-1 text-center text-[12px] font-bold ${
                m.current ? "text-text" : "text-text-2"
              }`}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
