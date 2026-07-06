import { AppShell } from "@/components/layout/AppShell";
import { TopBar } from "@/components/layout/TopBar";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { brl, budgetStatus, pct } from "@/lib/format";
import { savings, savingsTotal, budget, months } from "@/lib/seed";

export default function EconomiaPage() {
  const b = budgetStatus(budget.spent, budget.total);
  const chartMax = Math.max(budget.total, ...months.map((m) => m.value)) * 1.1;
  const linePos = (budget.total / chartMax) * 100;

  return (
    <AppShell
      top={<TopBar title="Economia" subtitle="do mes" right={<ThemeToggle />} />}
    >
      <div className="space-y-4">
        <Card>
          <div className="text-[13px] text-text-2">Economia vs historico</div>
          <div className="text-[30px] font-extrabold text-pos">
            {brl(savingsTotal)}
          </div>
          <div className="mt-3 space-y-2">
            {savings.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between text-[14px]"
              >
                <span className="font-semibold">{s.name}</span>
                <span className="flex items-center gap-2 text-text-3">
                  <span className="line-through">{brl(s.oldPrice)}</span>
                  <span className="text-text-2">{brl(s.newPrice)}</span>
                  <span className="min-w-[64px] text-right font-bold text-pos">
                    -{brl(s.saved)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[13px] text-text-2">Orcamento do mes</div>
              <div className="text-[26px] font-extrabold">
                {brl(budget.spent)}{" "}
                <span className="text-[15px] font-semibold text-text-3">
                  / {brl(budget.total)}
                </span>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-[5px] text-xs font-bold ${
                b.over ? "bg-neg-soft text-neg" : "bg-pos-soft text-pos"
              }`}
            >
              {b.over ? `Acima em ${brl(-b.saldo)}` : `Restam ${brl(b.saldo)}`}
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar ratio={b.pct / 100} tone={b.tone} height={10} />
            <div className="mt-1 text-[12px] text-text-3">{pct(b.pct)} usado</div>
          </div>
        </Card>

        <Card>
          <div className="text-[13px] text-text-2">Gasto por mes</div>
          <div className="relative mt-4 flex h-40 items-end justify-between gap-2">
            <div
              className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-text-3"
              style={{ bottom: `${linePos}%` }}
            >
              <span className="absolute -top-4 right-0 text-[10px] text-text-3">
                orcamento
              </span>
            </div>
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
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-text-3">{m.value}</span>
                  <div
                    className="w-full rounded-t-md"
                    style={{ height: `${h}%`, background: color }}
                  />
                  <span className="text-[11px] font-semibold text-text-2">
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
