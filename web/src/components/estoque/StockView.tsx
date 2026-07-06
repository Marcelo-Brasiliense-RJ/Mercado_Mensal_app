"use client";

import { useState } from "react";
import type { StockItem } from "@/lib/types";
import { stockRatio } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { SearchIcon, ChevronRight } from "@/components/ui/icons";

export function StockView({ items }: { items: StockItem[] }) {
  const [q, setQ] = useState("");
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const repor = filtered.filter((i) => stockRatio(i.current, i.normal) < 0.5);
  const ok = filtered.filter((i) => stockRatio(i.current, i.normal) >= 0.5);

  return (
    <div className="space-y-5">
      <div className="relative">
        <SearchIcon
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto"
          className="h-[46px] w-full rounded-[14px] bg-card-2 pl-[42px] pr-4 text-[15px] text-text"
        />
      </div>

      {repor.length > 0 && (
        <Section label="Repor" count={repor.length} warn>
          {repor.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </Section>
      )}
      {ok.length > 0 && (
        <Section label="No estoque" count={ok.length}>
          {ok.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </Section>
      )}
      {filtered.length === 0 && (
        <p className="pt-10 text-center text-text-3">Nenhum item encontrado.</p>
      )}
    </div>
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
    <section className="space-y-2.5">
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
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({ item }: { item: StockItem }) {
  const ratio = stockRatio(item.current, item.normal);
  const repor = ratio < 0.5;
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-[16px] border border-border bg-card p-3 text-left shadow-[0_1px_3px_var(--shadow)] ${
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
  );
}
