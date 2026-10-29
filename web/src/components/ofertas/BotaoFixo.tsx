"use client";

import { useStore } from "@/lib/store";
import { marcarFixo, useLivelo } from "./useLivelo";

// "Fixo do mes" (0046) num toque, onde o item aparece: detalhe do estoque, item da lista.
// Fixo e o que a casa compra todo mes; a secao Livelo das Ofertas compara esses.
export function BotaoFixo({ nome }: { nome: string }) {
  const livelo = useLivelo();
  const { showToast } = useStore();
  if (!livelo) return null;
  const fixo = livelo.fixos.includes(nome.trim().toLowerCase());
  return (
    <button
      type="button"
      onClick={async () => {
        const r = await marcarFixo(nome, !fixo);
        showToast(!r.ok ? r.erro! : fixo ? `${nome} saiu dos fixos` : `⭐ ${nome} é fixo do mês`);
      }}
      aria-pressed={fixo}
      className={`rounded-full border px-2.5 py-[3px] text-[12px] font-bold ${
        fixo ? "border-warn bg-warn-soft text-warn" : "border-border text-text-2"
      }`}
    >
      {fixo ? "⭐ Fixo do mês" : "☆ Fixo do mês?"}
    </button>
  );
}
