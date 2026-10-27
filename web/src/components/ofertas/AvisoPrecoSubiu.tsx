"use client";

import { brl } from "@/lib/format";
import { findByName } from "@/lib/defaults";
import { precoSubiu } from "@/lib/ofertas";
import { useStore } from "@/lib/store";

// Linha de alerta no carrinho: o preco digitado esta bem acima do que a casa pagou da
// ultima vez. Etiqueta errada e preco que subiu na prateleira sao comuns; a pessoa so confere.
export function AvisoPrecoSubiu({ nome, preco }: { nome: string; preco: number | null }) {
  const { stock } = useStore();
  const ultimo = findByName(nome, stock)?.priceLast ?? null;
  const alta = precoSubiu(preco, ultimo);
  if (alta == null || ultimo == null) return null;
  return (
    <div role="status" className="mb-3 rounded-[12px] bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">
      Subiu {Math.round(alta * 100)}%: da última vez você pagou {brl(ultimo)}. Confira a etiqueta.
    </div>
  );
}
