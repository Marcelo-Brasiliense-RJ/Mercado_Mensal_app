"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { achaNaLista } from "@/lib/voz";
import { termoEvitar } from "@/lib/ofertas";
import { marcarNaoComprar, marcarRuim } from "@/components/ofertas/useEvitar";

// "Nao comprar" em qualquer entrada (foto do produto, codigo de barras), com a mesma
// pergunta da voz: em excesso ou produto ruim. Aqui o nome ja vem do rotulo (com a
// marca), entao ruim nao precisa perguntar a marca. Tambem tira da lista, como a voz.
export function NaoComprarBotoes({
  nome,
  marca = "",
  barcode = null,
  foto = null,
  onFeito,
}: {
  nome: string;
  marca?: string;
  barcode?: string | null;
  foto?: string | null; // so URL https da loja chega ao card
  onFeito?: () => void;
}) {
  const { shopping, removeItems, showToast } = useStore();
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = nome.trim();
  if (!n) return null;

  async function guardar(tipo: "excesso" | "ruim") {
    setBusy(true);
    const ok =
      tipo === "excesso"
        ? await marcarNaoComprar(n, "excesso")
        : await marcarRuim({ termo: termoEvitar(n, marca), nome: n, barcode, foto });
    const naLista = achaNaLista(n, shopping);
    if (ok && naLista.length) await removeItems(naLista.map((i) => i.id));
    setBusy(false);
    if (!ok) return showToast("Não deu para guardar.");
    showToast(
      `${tipo === "ruim" ? "👎" : "📦"} ${n}: Não comprar (${tipo === "ruim" ? "produto ruim" : "em excesso"})${
        naLista.length ? " · saiu da lista" : ""
      }`,
    );
    onFeito?.();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-10 text-[13px] font-bold text-text-2 underline"
      >
        🚫 Não comprar este
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => guardar("excesso")}
        className="rounded-[14px] border-2 border-warn/40 bg-warn-soft p-2.5 text-left disabled:opacity-50"
      >
        <span className="block text-[15px] font-extrabold">📦 Em excesso</span>
        <span className="block text-[12px] text-text-2">Tem demais em casa</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => guardar("ruim")}
        className="rounded-[14px] border-2 border-neg/40 bg-neg-soft p-2.5 text-left disabled:opacity-50"
      >
        <span className="block text-[15px] font-extrabold">👎 Produto ruim</span>
        <span className="block text-[12px] text-text-2">Não compra mais</span>
      </button>
    </div>
  );
}
