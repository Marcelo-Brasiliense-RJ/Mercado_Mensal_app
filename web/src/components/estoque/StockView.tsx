"use client";

import { useState } from "react";
import type { StockItem } from "@/lib/types";
import { stockRatio } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { SearchIcon, ChevronRight } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { ItemDetailModal } from "./ItemDetailModal";

export function StockView() {
  const { stock } = useStore();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<StockItem | null>(null);

  const filtered = stock.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const repor = filtered.filter((i) => stockRatio(i.current, i.normal) < 0.5);
  const ok = filtered.filter((i) => stockRatio(i.current, i.normal) >= 0.5);

  const search = (
    <div className="relative w-full lg:w-[280px]">
      <SearchIcon
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar item..."
        className="h-[44px] w-full rounded-[12px] border border-border bg-card pl-[42px] pr-4 text-[14px] lg:h-[44px]"
      />
    </div>
  );

  return (
    <>
      <ScreenHeader
        title="Estoque"
        subtitle={`${stock.length} itens na dispensa`}
        action={search}
      />

      <div className="space-y-6">
        <div className="lg:hidden">{search}</div>

        {stock.length === 0 && (
          <p className="pt-12 text-center text-[15px] leading-relaxed text-text-3">
            Sua dispensa está vazia. Registre suas compras por áudio no bot do
            Telegram e o estoque aparece aqui.
          </p>
        )}

        {repor.length > 0 && (
          <Section label="Repor" count={repor.length} warn>
            {repor.map((i) => (
              <Item key={i.id} item={i} onOpen={() => setDetail(i)} />
            ))}
          </Section>
        )}
        {ok.length > 0 && (
          <Section label="Tudo em casa" count={ok.length}>
            {ok.map((i) => (
              <Item key={i.id} item={i} onOpen={() => setDetail(i)} />
            ))}
          </Section>
        )}
        {stock.length > 0 && filtered.length === 0 && (
          <p className="pt-10 text-center text-text-3">Nenhum item encontrado.</p>
        )}
      </div>

      <ItemDetailModal item={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function Section({
  label,
  count,
  warn = false,
  children,
}: {
  label: string;
  count: number;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span
          className={`text-[13px] font-extrabold uppercase tracking-wide ${
            warn ? "text-warn" : "text-text-3"
          }`}
        >
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            warn ? "bg-warn-soft text-warn" : "bg-card-2 text-text-3"
          }`}
        >
          {count}
        </span>
      </div>
      {/* Mobile: linhas empilhadas. Desktop: grade de 3 colunas. */}
      <div className="space-y-2.5 lg:grid lg:grid-cols-3 lg:gap-3.5 lg:space-y-0">
        {children}
      </div>
    </section>
  );
}

function Item({ item, onOpen }: { item: StockItem; onOpen: () => void }) {
  const ratio = stockRatio(item.current, item.normal);
  const repor = ratio < 0.5;
  return (
    <>
      {/* Mobile: linha compacta */}
      <button
        onClick={onOpen}
        className={`flex w-full items-center gap-3 rounded-[16px] border border-border bg-card p-3 text-left shadow-[0_1px_3px_var(--shadow)] lg:hidden ${
          repor ? "border-l-[3px] border-l-warn" : ""
        }`}
      >
        <AvatarInitial name={item.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-bold">{item.name}</span>
            <span className="shrink-0 text-sm text-text-2">
              {item.current} {item.unit}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar ratio={ratio} />
            <span className="w-9 shrink-0 text-right text-[11px] text-text-3">
              {Math.round(ratio * 100)}%
            </span>
          </div>
        </div>
        {!repor && <ChevronRight size={18} className="shrink-0 text-text-3" />}
      </button>

      {/* Desktop: card */}
      <button
        onClick={onOpen}
        className={`hidden text-left lg:block rounded-[18px] border border-border bg-card p-4 shadow-[0_1px_3px_var(--shadow)] ${
          repor ? "border-l-[3px] border-l-warn" : ""
        }`}
      >
        <div className="mb-3.5 flex items-center gap-3">
          <AvatarInitial name={item.name} size={42} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{item.name}</div>
            <div className="text-[13px] text-text-2">
              {item.current} {item.unit}
            </div>
          </div>
          {repor ? (
            <span className="rounded-full bg-warn-soft px-2.5 py-[3px] text-[11px] font-extrabold text-warn">
              Repor
            </span>
          ) : (
            <span className="text-[12px] font-bold text-text-3">
              {Math.round(ratio * 100)}%
            </span>
          )}
        </div>
        <ProgressBar ratio={ratio} height={8} />
        <div className="mt-[7px] flex justify-between text-[11px] text-text-3">
          <span>Nível</span>
          <span>
            normal {item.normal} {item.unit}
          </span>
        </div>
      </button>
    </>
  );
}
