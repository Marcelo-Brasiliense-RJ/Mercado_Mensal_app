"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";

// Painel do modo "No mercado": aparece quando ha uma compra aberta (aberta pelo
// Telegram). Mostra o carrinho e o total subindo. A entrada de itens e no bot;
// aqui so acompanha, tira engano e finaliza.
export function CartPanel() {
  const { trip, shopping, finalizeTrip, removeTripItem, showToast } = useStore();
  const [busy, setBusy] = useState(false);

  if (!trip) return null;

  // Preco que a pessoa pesquisou/estimou na lista, por nome (compara com o do
  // carrinho pra mostrar se ta mais caro ou mais barato do que ela esperava).
  function estimado(name: string): number | null {
    const s = shopping.find(
      (x) => x.status !== "removed" && x.name.toLowerCase() === name.toLowerCase(),
    );
    return s?.estimated_price != null && s.estimated_price > 0
      ? s.estimated_price
      : null;
  }

  async function finalizar() {
    setBusy(true);
    await finalizeTrip();
    setBusy(false);
    showToast("Compra finalizada, estoque reposto");
  }

  return (
    <div className="rounded-[20px] border-2 border-brand bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-brand">
            No mercado
          </div>
          <div className="mt-0.5 text-[13px] text-text-3">
            carrinho em andamento
          </div>
        </div>
        <div className="text-right">
          <div className="text-[34px] font-extrabold leading-none lg:text-[40px]">
            {brl(trip.total)}
          </div>
          <div className="mt-1 text-[12px] text-text-3">
            {trip.items.length} {trip.items.length === 1 ? "item" : "itens"} no
            carrinho
          </div>
        </div>
      </div>

      {trip.items.length === 0 ? (
        <p className="mt-4 text-[14px] leading-relaxed text-text-3">
          Carrinho aberto. Vá falando o que for pegando no Telegram que aparece
          aqui.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {trip.items.map((it) => {
            const esp = estimado(it.name);
            const diff = esp != null ? it.unit_price - esp : null;
            return (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-card-2 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold">{it.name}</div>
                <div className="text-[13px] text-text-3">
                  {it.quantity} {it.unit} · {brl(it.unit_price)}
                </div>
                {/* Comparativo: pesquisado (lista) x pagando (carrinho) */}
                {diff !== null && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] font-bold">
                    <span className="text-text-3">
                      Pesquisado {brl(esp!)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-[2px] ${
                        diff > 0.005
                          ? "bg-neg-soft text-neg"
                          : diff < -0.005
                            ? "bg-pos-soft text-pos"
                            : "bg-card text-text-3"
                      }`}
                    >
                      {diff > 0.005
                        ? `+${brl(diff)} mais caro`
                        : diff < -0.005
                          ? `${brl(diff)} mais barato`
                          : "no preço"}
                    </span>
                  </div>
                )}
              </div>
              {it.above_par && (
                <span className="shrink-0 rounded-full bg-pos-soft px-2.5 py-[3px] text-[12px] font-bold text-pos">
                  já tinha
                </span>
              )}
              <span className="shrink-0 text-[16px] font-extrabold">
                {brl(it.quantity * it.unit_price)}
              </span>
              <button
                onClick={() => removeTripItem(it.id)}
                aria-label="Tirar do carrinho"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card"
              >
                ×
              </button>
            </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={finalizar}
        disabled={busy || trip.items.length === 0}
        className="mt-4 h-[50px] w-full rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
      >
        {busy ? "Finalizando…" : "Finalizar compra"}
      </button>
    </div>
  );
}
