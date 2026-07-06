"use client";

import { useState } from "react";
import type { ShopItem } from "@/lib/types";
import { brl, listTotal, pendingCount } from "@/lib/format";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";

export function ListView({ items: initial }: { items: ShopItem[] }) {
  const [items, setItems] = useState<ShopItem[]>(initial);

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: i.status === "bought" ? "pending" : "bought" }
          : i,
      ),
    );
  }

  const total = listTotal(items);
  const missing = pendingCount(items);
  const visible = items
    .filter((i) => i.status !== "removed")
    .sort(
      (a, b) =>
        (a.status === "bought" ? 1 : 0) - (b.status === "bought" ? 1 : 0),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-stretch rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)]">
        <div className="flex-1">
          <div className="text-[13px] text-text-2">Total a pagar</div>
          <div className="text-[34px] font-extrabold leading-none">
            {brl(total)}
          </div>
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

      <ul className="space-y-2.5">
        {visible.map((i) => {
          const bought = i.status === "bought";
          return (
            <li
              key={i.id}
              className={`flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-[0_1px_3px_var(--shadow)] ${
                bought ? "opacity-65" : ""
              }`}
            >
              <button
                onClick={() => toggle(i.id)}
                aria-label={bought ? "Desmarcar" : "Marcar como comprado"}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 ${
                  bought
                    ? "border-brand bg-brand text-white"
                    : "border-border text-transparent"
                }`}
              >
                <CheckIcon size={14} />
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={`font-bold ${
                    bought ? "text-text-3 line-through" : ""
                  }`}
                >
                  {i.name}
                </div>
                <div className="text-[12px] text-text-3">
                  {i.desired_quantity} {i.unit} · {brl(i.estimated_price ?? 0)}
                </div>
              </div>
              <div className="shrink-0 font-extrabold">
                {brl(i.desired_quantity * (i.estimated_price ?? 0))}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        aria-label="Adicionar item"
        className="fixed bottom-[92px] left-1/2 z-30 grid h-14 w-14 translate-x-[148px] place-items-center rounded-[18px] bg-brand text-brand-ink shadow-[0_10px_24px_var(--shadow-lg)]"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
