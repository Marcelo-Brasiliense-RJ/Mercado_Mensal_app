"use client";

import { useState } from "react";
import { brl, listTotal, pendingCount } from "@/lib/format";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { AddItemModal } from "./AddItemModal";

export function ListView() {
  const { shopping, toggleBought } = useStore();
  const [addOpen, setAddOpen] = useState(false);

  const total = listTotal(shopping);
  const missing = pendingCount(shopping);
  const visible = shopping
    .filter((i) => i.status !== "removed")
    .sort(
      (a, b) =>
        (a.status === "bought" ? 1 : 0) - (b.status === "bought" ? 1 : 0),
    );

  const addBtn = (
    <button
      onClick={() => setAddOpen(true)}
      className="flex h-[44px] items-center gap-2 rounded-[12px] bg-brand px-[18px] text-[14px] font-bold text-brand-ink"
    >
      <PlusIcon size={18} />
      Adicionar item
    </button>
  );

  return (
    <>
      <ScreenHeader title="Lista de compras" action={addBtn} />

      <div className="space-y-4 lg:space-y-6">
        {/* Resumo mobile (cartao unico) */}
        <div className="flex items-stretch rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)] lg:hidden">
          <div className="flex-1">
            <div className="text-[13px] text-text-2">Total a pagar</div>
            <div className="text-[34px] font-extrabold leading-none">{brl(total)}</div>
            <div className="mt-1 text-[12px] text-text-3">estimado</div>
          </div>
          <div className="mx-4 w-px bg-border" />
          <div className="flex flex-col justify-center text-center">
            <div className="text-[34px] font-extrabold leading-none text-brand">
              {missing}
            </div>
            <div className="text-[12px] text-text-3">faltando</div>
          </div>
        </div>

        {/* Resumo desktop (2 cartoes) */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-2">
          <div className="rounded-[20px] border border-border bg-card p-[22px] shadow-[0_2px_12px_var(--shadow)]">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-wide text-text-3">
              Total a pagar
            </div>
            <div className="text-[44px] font-extrabold leading-none tracking-[-0.03em]">
              {brl(total)}
            </div>
            <div className="mt-2 text-[13px] text-text-3">estimado</div>
          </div>
          <div className="rounded-[20px] border border-border bg-card p-[22px] shadow-[0_2px_12px_var(--shadow)]">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-wide text-text-3">
              Itens faltando
            </div>
            <div className="text-[44px] font-extrabold leading-none tracking-[-0.03em] text-brand">
              {missing}
            </div>
            <div className="mt-2 text-[13px] text-text-3">para comprar</div>
          </div>
        </div>

        {visible.length === 0 && (
          <p className="pt-8 text-center text-[15px] leading-relaxed text-text-3">
            Sua lista está vazia. Adicione itens aqui ou peça pelo bot no Telegram
            (&quot;vou comprar arroz&quot;).
          </p>
        )}

        {/* Linhas: cartao no mobile, linha com divisoria no desktop */}
        <ul className="space-y-2.5 lg:space-y-0 lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-border lg:bg-card lg:shadow-[0_2px_12px_var(--shadow)] empty:hidden">
          {visible.map((i) => {
            const bought = i.status === "bought";
            const price = i.estimated_price ?? 0;
            return (
              <li
                key={i.id}
                className={`flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-3 shadow-[0_1px_3px_var(--shadow)] lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:px-5 lg:py-[15px] lg:shadow-none ${
                  bought ? "opacity-60" : ""
                }`}
              >
                <button
                  onClick={() => toggleBought(i.id)}
                  aria-label={bought ? "Desmarcar" : "Marcar como comprado"}
                  className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border-2 ${
                    bought
                      ? "border-brand bg-brand text-brand-ink"
                      : "border-border text-transparent"
                  }`}
                >
                  <CheckIcon size={14} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-bold ${bought ? "text-text-3 line-through" : ""}`}>
                    {i.name}
                  </div>
                  <div className="text-[13px] text-text-3">
                    {i.desired_quantity} {i.unit} · {brl(price)}
                  </div>
                </div>
                <span className="shrink-0 text-[16px] font-extrabold">
                  {brl(i.desired_quantity * price)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => setAddOpen(true)}
        aria-label="Adicionar item"
        className="fixed bottom-[92px] right-4 z-30 grid h-14 w-14 place-items-center rounded-[18px] bg-brand text-brand-ink shadow-[0_10px_24px_var(--shadow-lg)] lg:hidden"
      >
        <PlusIcon />
      </button>

      <AddItemModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
