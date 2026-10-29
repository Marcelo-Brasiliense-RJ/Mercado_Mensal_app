"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Foto } from "@/components/ofertas/pecas";
import { brl } from "@/lib/format";
import { COR_LIVELO, corMercado, ehLivelo, nomeMercado, prazo, type Oferta } from "@/lib/ofertas";
import { atualizarLugar, posicaoAtual } from "@/lib/lugar";
import { localizarLoja } from "@/lib/lojas";
import { linkApple, linkGoogle, linkWaze, linksPorNome } from "@/lib/rota";
import { LINK_LIVELO } from "@/lib/livelo";

// Toque num mercado do "Onde compensa": o que da lista sai em oferta la, com foto,
// e o caminho ate a loja no app de mapa que a pessoa usa.
export type ItemMercado = { nome: string; oferta: Oferta; naLista: number | null; melhor: Oferta };

type Links = { waze: string; google: string; apple: string };

export function MercadoModal({
  mercado,
  itens,
  filtrando,
  onFiltrar,
  onClose,
}: {
  mercado: string;
  itens: ItemMercado[];
  filtrando: boolean;
  onFiltrar: () => void;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<Links | null>(null);
  const [loja, setLoja] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const total = itens.reduce((t, x) => t + x.oferta.preco_por, 0);
  const economia = itens.reduce((t, x) => t + Math.max(0, (x.naLista ?? 0) - x.oferta.preco_por), 0);
  const cor = corMercado(mercado);

  async function rota() {
    setBuscando(true);
    await atualizarLugar(true);
    const aqui = posicaoAtual();
    const l = aqui ? await localizarLoja(mercado, aqui) : null;
    setBuscando(false);
    setLoja(l?.nome ?? null);
    setLinks(
      l ? { waze: linkWaze(l), google: linkGoogle(aqui, [l]), apple: linkApple(l) } : linksPorNome(nomeMercado(mercado)),
    );
  }

  const app = "flex h-[54px] items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold text-white";

  return (
    <Modal open onClose={onClose} maxWidth={480}>
      <div className="-mx-1 mb-3 rounded-[18px] p-4 pr-14 text-white" style={{ background: cor }}>
        <div className="text-[13px] font-bold opacity-90">Comprar no</div>
        <div className="text-[24px] font-extrabold leading-tight">{nomeMercado(mercado)}</div>
        <div className="mt-1 text-[14px] font-bold">
          {itens.length} {itens.length > 1 ? "itens" : "item"} da lista · {brl(total)}
        </div>
        {economia >= 0.5 && (
          <div className="mt-0.5 text-[13px] opacity-90">{brl(economia)} a menos que o preço da sua lista</div>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {itens.map(({ nome, oferta: o, naLista, melhor }) => {
          const p = prazo(o);
          const aqui = melhor.mercado === mercado;
          return (
            <li key={o.id} className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-2.5">
              <Foto o={o} className="h-[64px] w-[64px] shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold leading-tight">{o.produto}</div>
                <div className="mt-0.5 text-[12px] text-text-3">
                  {[o.marca, o.tamanho].filter(Boolean).join(" · ")}
                  {o.marca || o.tamanho ? " · " : ""}para “{nome}”
                </div>
                {p && <div className={`text-[12px] font-bold ${p.urgente ? "text-neg" : "text-text-2"}`}>{p.texto}</div>}
                {ehLivelo(o.mercado) && o.condicao && (
                  <div className="text-[12px] font-bold" style={{ color: COR_LIVELO }}>
                    {o.condicao}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[17px] font-extrabold tabular-nums">{brl(o.preco_por)}</div>
                {ehLivelo(o.mercado) && o.preco_de ? (
                  <div className="text-[11px] text-text-3 line-through">{brl(o.preco_de)}</div>
                ) : (
                  naLista != null &&
                  naLista > o.preco_por + 0.005 && <div className="text-[11px] text-text-3 line-through">{brl(naLista)}</div>
                )}
                {aqui ? (
                  <div className="text-[11px] font-bold text-pos">mais barato</div>
                ) : (
                  <div className="text-[11px] font-bold text-text-2">
                    {nomeMercado(melhor.mercado)} {brl(melhor.preco_por)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-text-3">
        {ehLivelo(mercado) ? "Preço riscado: o que se paga. Embaixo: já descontando os pontos." : "Preço de 1 unidade no encarte."}
      </p>

      <div data-rodape className="mt-3 flex flex-col gap-2">
        {ehLivelo(mercado) ? (
          // Parceiro online: nao tem rota, tem o site da Livelo (so assim a compra pontua).
          <a
            href={LINK_LIVELO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[54px] items-center justify-center rounded-[14px] text-[16px] font-extrabold text-white"
            style={{ background: COR_LIVELO }}
          >
            💗 Comprar pela Livelo
          </a>
        ) : !links ? (
          <button
            onClick={rota}
            disabled={buscando}
            className="h-[54px] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-60"
          >
            {buscando ? "Procurando a loja…" : "🧭 Iniciar rota"}
          </button>
        ) : (
          <>
            <div className="text-[13px] font-bold text-text-2">
              {loja ? `Até ${loja}. Abrir no:` : `Procurar ${nomeMercado(mercado)} perto de você no:`}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a href={links.waze} target="_blank" rel="noopener noreferrer" className={`${app} bg-[#33CCFF]`}>
                Waze
              </a>
              <a href={links.google} target="_blank" rel="noopener noreferrer" className={`${app} bg-[#1A73E8]`}>
                Google
              </a>
              <a href={links.apple} target="_blank" rel="noopener noreferrer" className={`${app} bg-[#111]`}>
                Apple Maps
              </a>
            </div>
          </>
        )}
        <button
          onClick={() => {
            onFiltrar();
            onClose();
          }}
          className="h-12 rounded-[14px] border-2 border-border bg-card text-[14px] font-bold"
        >
          {filtrando ? "Voltar a ver a lista toda" : "Ver na lista só o que levar daqui"}
        </button>
      </div>
    </Modal>
  );
}
