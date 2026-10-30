"use client";

import { useStore } from "@/lib/store";
import { parecidos } from "@/lib/parecidos";

// Antes de criar um item novo: "Já tem parecido". Um toque usa o nome do que já existe,
// e o produto nao vira dois itens no estoque com nomes diferentes.
export function AvisoParecido({ nome, onUsar }: { nome: string; onUsar: (nome: string, unidade: string) => void }) {
  const { stock } = useStore();
  if (nome.trim().length < 3 || stock.some((s) => s.name.trim().toLowerCase() === nome.trim().toLowerCase())) return null;
  const achados = parecidos(nome, stock);
  if (!achados.length) return null;
  return (
    <div className="mb-3 rounded-[13px] border-2 border-warn/50 bg-warn-soft p-2.5">
      <div className="mb-1.5 text-[12px] font-bold text-warn">Parece com o que você já tem. É o mesmo?</div>
      <div className="flex flex-col gap-1.5">
        {achados.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onUsar(s.name, s.unit)}
            className="flex items-center gap-2 rounded-[10px] bg-card px-2.5 py-2 text-left text-[13px]"
          >
            <span className="min-w-0 flex-1 font-bold">{s.name}</span>
            <span className="shrink-0 font-bold text-brand">Usar este</span>
          </button>
        ))}
      </div>
    </div>
  );
}
