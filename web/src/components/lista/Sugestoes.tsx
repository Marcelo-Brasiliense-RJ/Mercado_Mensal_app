"use client";

import { useEffect, useState } from "react";
import { brl } from "@/lib/format";
import { casaBusca, maisBarato, padrao, type Oferta } from "@/lib/ofertas";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { FotoItem } from "@/components/ui/FotoItem";
import { Foto, Selo } from "@/components/ofertas/pecas";
import type { Achado } from "@/app/api/busca/route";

// Autocompletar da lista: digita "iogurte" e aparece, nesta ordem,
//   1. o generico ("iogurte", qualquer um), com foto de iogurte;
//   2. o que esta em oferta nos mercados da casa, com o preco;
//   3. os produtos como estao escritos no mercado ("Iogurte Integral Danone 1L"), com foto.
// Escolher o nome do mercado ja deixa a lista no formato que o encarte usa (casa melhor).
export type Escolha = { nome: string; preco: number | null };

export function Sugestoes({ termo, onEscolher }: { termo: string; onEscolher: (e: Escolha) => void }) {
  const ofertas = useListaOfertas();
  const t = termo.trim();
  const [catalogo, setCatalogo] = useState<{ q: string; itens: Achado[] }>({ q: "", itens: [] });

  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/busca?q=${encodeURIComponent(t)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { itens: Achado[] }) => setCatalogo({ q: t, itens: d.itens ?? [] }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [t]);

  if (t.length < 2) return null;
  const emOferta: Oferta[] = ofertas.filter((o) => casaBusca(o, t)).sort(maisBarato).slice(0, 5);
  const vistos = new Set(emOferta.map((o) => padrao(o.produto)));
  const doMercado = catalogo.q === t ? catalogo.itens.filter((c) => !vistos.has(padrao(c.nome))).slice(0, 6) : [];

  const linha = "flex w-full items-center gap-3 px-3 py-2 text-left active:bg-card-2";
  return (
    <div className="mb-3 max-h-[46vh] overflow-y-auto rounded-[14px] border border-border bg-card shadow-[0_6px_20px_var(--shadow)]">
      <button type="button" onClick={() => onEscolher({ nome: t.toLowerCase(), preco: null })} className={linha}>
        <FotoItem nome={t} className="h-11 w-11 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold capitalize">{t}</span>
          <span className="block text-[12px] text-text-3">qualquer marca</span>
        </span>
      </button>
      {emOferta.map((o) => (
        <button key={o.id} type="button" onClick={() => onEscolher({ nome: o.produto, preco: o.preco_por })} className={`${linha} border-t border-border`}>
          <Foto o={o} className="h-11 w-11 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-[14px] font-bold leading-tight">{o.produto}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-3">
              <Selo mercado={o.mercado} />
              {o.marca}
            </span>
          </span>
          <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-pos">{brl(o.preco_por)}</span>
        </button>
      ))}
      {doMercado.map((c) => (
        <button key={c.nome} type="button" onClick={() => onEscolher({ nome: c.nome, preco: null })} className={`${linha} border-t border-border`}>
          {c.foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura da loja
            <img src={c.foto} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain" />
          ) : (
            <FotoItem nome={c.nome} className="h-11 w-11 rounded-lg" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-tight">{c.nome}</span>
            {c.marca && <span className="block text-[12px] text-text-3">{c.marca}</span>}
          </span>
        </button>
      ))}
      {catalogo.q !== t && <div className="border-t border-border px-3 py-2 text-[12px] text-text-3">Procurando no mercado…</div>}
    </div>
  );
}
