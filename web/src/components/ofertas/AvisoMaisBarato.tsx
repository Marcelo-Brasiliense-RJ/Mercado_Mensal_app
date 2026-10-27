"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { corMercado, melhorQue, nomeCompleto, nomeMercado, prazo } from "@/lib/ofertas";
import { useListaOfertas } from "./useOfertas";

// Card dentro do popup do carrinho: aparece so quando outro mercado esta vendendo
// o mesmo item mais barato. Um toque deixa para comprar la (vai para a lista do mes).
// `noCarrinho`: o item ja esta no carrinho, entao o botao tambem tira ele de la.
export function AvisoMaisBarato({
  nome,
  preco,
  unidade,
  qtd,
  noCarrinho,
  onFeito,
}: {
  nome: string;
  preco: number | null;
  unidade: string;
  qtd: number;
  noCarrinho?: () => Promise<{ ok: boolean; erro?: string }>;
  onFeito: () => void;
}) {
  const ofertas = useListaOfertas();
  const { addShopItem, showToast } = useStore();
  const [busy, setBusy] = useState(false);
  const achado = melhorQue(ofertas, nome, preco, unidade);
  if (!achado) return null;
  const { oferta, economia } = achado;
  const mercado = nomeMercado(oferta.mercado);
  const p = prazo(oferta);

  async function deixarPraLa() {
    setBusy(true);
    if (noCarrinho) {
      const r = await noCarrinho();
      if (!r.ok) {
        setBusy(false);
        return showToast(r.erro ?? "Não deu para tirar do carrinho.");
      }
    }
    const r = await addShopItem({
      name: nome.trim().toLowerCase(),
      desired_quantity: qtd > 0 ? qtd : 1,
      unit: unidade,
      estimated_price: oferta.preco_por,
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro ?? "Não deu para pôr na lista.");
    showToast(`${nome.trim()} na lista: ${brl(oferta.preco_por)} no ${mercado}`);
    onFeito();
  }

  return (
    <div
      className="mb-4 overflow-hidden rounded-[14px] border-2"
      style={{ borderColor: corMercado(oferta.mercado) }}
      role="status"
    >
      <div className="px-3.5 py-2 text-[13px] font-extrabold text-white" style={{ background: corMercado(oferta.mercado) }}>
        Mais barato no {mercado}: {brl(economia)} a menos
      </div>
      <div className="flex flex-col gap-2 bg-card px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-[14px] font-semibold leading-snug">{nomeCompleto(oferta)}</span>
          <span className="shrink-0 text-[19px] font-extrabold text-pos tabular-nums">{brl(oferta.preco_por)}</span>
        </div>
        <div className="text-[12px] text-text-2">
          {[p?.texto ?? "Preço de hoje", oferta.condicao].filter(Boolean).join(" · ")}
        </div>
        <button
          type="button"
          onClick={deixarPraLa}
          disabled={busy}
          className="h-11 w-full rounded-xl bg-brand-soft text-[14px] font-bold text-brand disabled:opacity-50"
        >
          {busy ? "Guardando…" : noCarrinho ? `Tirar e comprar no ${mercado}` : `Pôr na lista do mês (${mercado})`}
        </button>
      </div>
    </div>
  );
}
