"use client";

import { findByName } from "@/lib/defaults";
import type { StockItem } from "@/lib/types";

// Guardar no estoque e ja pedir na lista, no mesmo gesto: "tem 1 em casa, mas esta
// acabando". Marca so desta vez (nao fica ligado para o proximo item).
export function TambemNaLista({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!valor)}
      aria-pressed={valor}
      className={`mb-3 flex w-full items-center gap-3 rounded-[13px] border-2 px-3 py-2.5 text-left ${
        valor ? "border-brand bg-brand-soft" : "border-border bg-card"
      }`}
    >
      <span className="text-[18px]">{valor ? "✅" : "📝"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">Pôr na lista também</span>
        <span className="block text-[12px] text-text-2">Está acabando: guarda em casa e já pede para comprar</span>
      </span>
    </button>
  );
}

// Quanto pedir na lista: o que falta para o normal da casa depois de guardar (minimo 1).
export function quantoPedir(nome: string, guardado: number, stock: StockItem[]): { qtd: number; preco: number | null } {
  const s = findByName(nome, stock);
  if (!s) return { qtd: 1, preco: null };
  return { qtd: Math.max(1, Math.round(s.normal - (s.current + guardado))), preco: s.priceLast };
}
