"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { findByName } from "@/lib/defaults";
import { casaItem, COR_LIVELO, maisBarato, pontuaNaLivelo, type Oferta } from "@/lib/ofertas";
import { paridadeDe, ptsCertos, ptsMax, type Paridade } from "@/lib/livelo";
import { linha, vezes, type Linha, type ProdutoCarrefour } from "@/lib/comparar";
import { fimCampanha, linkLivelo, lojaDe, LOJAS, melhorOnline, type Loja } from "@/lib/lojasOnline";
import type { ShopItem } from "@/lib/types";
import { urlFoto } from "@/lib/fotoPorNome";
import { Foto } from "./pecas";
import { useLivelo } from "./useLivelo";
import { useListaOfertas } from "./useOfertas";

// Aba Livelo (4a versao). Pedido do dono: para quem nao le. Tres blocos com imagem:
// 1) a promocao de hoje, 2) o que comprar em cada loja online (fotos + um botao),
// 3) o que comprar no mercado. Preco e detalhe so tocando no produto.
// Pontos por real vem sozinhos da Livelo (0046); preco vem do site da loja na hora
// (/api/loja-online) ou, se o site nao responder, do coletor de 3 em 3 horas.

const PONTO_PADRAO = 0.03; // R$ por ponto Livelo

type Busca = Record<string, ProdutoCarrefour[] | "erro">; // "LOJA|item" -> produtos

function useLojas(nomes: string[]): Busca {
  const [mapa, setMapa] = useState<Busca>({});
  const chave = nomes.join("|");
  useEffect(() => {
    let vivo = true;
    const fila = (chave ? chave.split("|") : []).flatMap((n) => LOJAS.map((l) => [l.codigo, n] as const));
    const trabalhar = async () => {
      for (let t = fila.shift(); t; t = fila.shift()) {
        const [loja, nome] = t;
        let v: ProdutoCarrefour[] | "erro" = "erro";
        try {
          const r = await fetch(`/api/loja-online?loja=${loja}&q=${encodeURIComponent(nome)}`);
          const d = (await r.json()) as { ok: boolean; itens: ProdutoCarrefour[] };
          if (d.ok) v = d.itens ?? [];
        } catch {
          /* fica "erro" */
        }
        if (vivo) setMapa((m) => ({ ...m, [`${loja}|${nome}`]: v }));
      }
    };
    void Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
    return () => {
      vivo = false;
    };
  }, [chave]);
  return mapa;
}

type Item = {
  shop: ShopItem;
  l: Linha;
  loja: Loja | null; // melhor loja online
  produto: ProdutoCarrefour | null;
  oferta: Oferta | null; // para a foto: encarte ou o que o coletor trouxe
  carregando: boolean;
};

export function LiveloView() {
  const { shopping, stock, removeItems, showToast, dataReady } = useStore();
  const lv = useLivelo();
  const ofertas = useListaOfertas();
  const [aberto, setAberto] = useState<string | null>(null);

  const pendentes = useMemo(() => shopping.filter((i) => i.status === "pending"), [shopping]);
  const temEmCasa = (i: ShopItem) => i.em_estoque || (findByName(i.name, stock)?.current ?? 0) > 0;
  const precisa = pendentes.filter((i) => !temEmCasa(i));
  const jaTem = pendentes.filter(temEmCasa);

  const busca = useLojas(useMemo(() => precisa.map((i) => i.name.trim()), [precisa]));
  const valorPonto = lv?.valor_ponto || PONTO_PADRAO;
  const par = (l: Loja): Paridade | undefined => (lv ? paridadeDe(lv, l.codigo) : undefined);
  const ptsDe = (l: Loja) => {
    const p = par(l);
    return p ? ptsCertos(p, lv!.clube) : l.ptsPadrao;
  };

  const itens: Item[] = precisa.map((shop) => {
    const nome = shop.name.trim();
    const casam = ofertas.filter((o) => casaItem(o, nome));
    const encarte = casam.filter((o) => !pontuaNaLivelo(o.mercado)).sort(maisBarato)[0] ?? null;
    const coletado = casam.filter((o) => o.mercado === "carrefour").sort(maisBarato)[0] ?? null;
    const precoMercado = encarte?.preco_por ?? shop.estimated_price ?? findByName(nome, stock)?.priceLast ?? null;
    const achados = LOJAS.flatMap((l) => {
      const r = busca[`${l.codigo}|${nome}`];
      if (Array.isArray(r) && r[0]) return [{ loja: l.codigo, preco: r[0].preco, pts: ptsDe(l), produto: r[0] }];
      // Site nao respondeu: o preco que o coletor trouxe do Carrefour
      if (l.codigo === "CRM" && coletado && r !== undefined)
        return [
          {
            loja: l.codigo,
            preco: coletado.preco_por,
            pts: ptsDe(l),
            produto: { nome: coletado.produto, preco: coletado.preco_por, de: coletado.preco_de, url: null, foto: null },
          },
        ];
      return [];
    });
    const m = melhorOnline(achados, valorPonto);
    const melhor = m ? achados.find((a) => a.loja === m.loja)! : null;
    return {
      shop,
      loja: melhor ? lojaDe(melhor.loja)! : null,
      produto: melhor?.produto ?? null,
      oferta: encarte ?? coletado,
      carregando: LOJAS.some((l) => busca[`${l.codigo}|${nome}`] === undefined),
      l: linha({
        nome,
        vezes: vezes(shop.desired_quantity, shop.unit),
        precoMercado,
        precoCarrefour: melhor?.preco ?? null,
        ptsPorReal: melhor?.pts ?? 0,
        valorPonto,
      }),
    };
  });

  const buscando = itens.filter((i) => i.carregando).length;
  const online = itens.filter((i) => i.l.vence === "carrefour" && i.loja);
  const noMercado = itens.filter((i) => i.l.vence === "mercado");
  const semPreco = itens.filter((i) => !i.l.vence && !i.carregando);
  const porLoja = LOJAS.map((loja) => ({ loja, itens: online.filter((i) => i.loja?.codigo === loja.codigo) })).filter(
    (x) => x.itens.length,
  );
  const promos = LOJAS.flatMap((l) => {
    const p = par(l);
    return p?.promocao ? [{ loja: l, pts: ptsMax(p, lv!.clube), normal: p.pontos_normal, ate: fimCampanha(p.regra) }] : [];
  });

  async function naoPreciso(i: ShopItem) {
    const res = await removeItems([i.id]);
    setAberto(null);
    showToast(res.ok ? `Tirei da lista: ${i.name}` : res.erro);
  }

  const detalhe = itens.find((i) => i.shop.id === aberto) ?? null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* 1. PROMOCAO DE HOJE */}
      {promos.map((p) => (
        <a
          key={p.loja.codigo}
          href={linkLivelo(p.loja)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[20px] p-4 text-white"
          style={{ background: `linear-gradient(135deg, ${COR_LIVELO}, #ff5a3c)` }}
        >
          <span className="text-[44px] leading-none">🔥</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold uppercase tracking-wide opacity-90">Promoção hoje</span>
            <span className="block text-[22px] font-extrabold leading-tight">
              {p.loja.nome}: {p.pts}x pontos
            </span>
            <span className="block text-[13px] font-semibold opacity-90">
              {p.normal && p.normal < p.pts ? `normal é ${p.normal}x · ` : ""}
              {p.ate ? `até ${p.ate}` : "por pouco tempo"}
            </span>
          </span>
        </a>
      ))}

      {!dataReady && (
        <div className="flex items-center gap-3 rounded-[16px] bg-card-2 px-4 py-3">
          <span className="animate-pulse text-[26px]">⏳</span>
          <span className="text-[15px] font-bold">Carregando sua lista…</span>
        </div>
      )}

      {dataReady && !pendentes.length && (
        <Bloco emoji="📝" titulo="Sua lista está vazia">
          <p className="text-[15px] text-text-2">Toque no 🎤 e fale o que precisa comprar.</p>
        </Bloco>
      )}

      {buscando > 0 && (
        <div className="flex items-center gap-3 rounded-[16px] bg-card-2 px-4 py-3">
          <span className="animate-pulse text-[26px]">🔎</span>
          <span className="text-[15px] font-bold">Procurando os preços nas lojas…</span>
        </div>
      )}

      {/* 2. COMPRE ONLINE: uma caixa por loja */}
      {porLoja.map(({ loja, itens: its }) => {
        const pts = its.reduce((s, i) => s + i.l.pontos, 0);
        const comparados = its.filter((i) => i.l.mercado != null);
        const dif = comparados.reduce((s, i) => s + (i.l.mercado! - i.l.carrefour!), 0);
        return (
          <section key={loja.codigo} className="rounded-[22px] border-[3px] bg-card p-4" style={{ borderColor: COR_LIVELO }}>
            <div className="flex items-center gap-2">
              <span className="text-[30px]">{loja.emoji}</span>
              <span className="text-[22px] font-extrabold leading-tight">Compre no {loja.nome}</span>
            </div>
            <Grade itens={its} onToque={setAberto} />
            <div className="mt-3 flex items-center gap-3 rounded-[16px] p-3" style={{ background: `${COR_LIVELO}14` }}>
              <span className="text-[38px] leading-none">🎁</span>
              <span>
                <span className="block text-[26px] font-extrabold leading-tight" style={{ color: COR_LIVELO }}>
                  +{pts.toLocaleString("pt-BR")} pontos
                </span>
                <span className="block text-[14px] font-bold text-text-2">
                  {comparados.length === 0
                    ? `vale uns ${brl(pts * valorPonto)}`
                    : dif >= -0.005
                      ? dif > 0.5
                        ? `e ainda paga ${brl(dif)} menos que no mercado 🎉`
                        : "pagando o mesmo que no mercado 👍"
                      : `paga ${brl(-dif)} a mais, os pontos valem ${brl(pts * valorPonto)}`}
                </span>
              </span>
            </div>
            <a
              href={linkLivelo(loja)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex h-14 items-center justify-center gap-2 rounded-[16px] text-[18px] font-extrabold text-white"
              style={{ background: COR_LIVELO }}
            >
              Comprar no {loja.nome} 👉
            </a>
            <p className="mt-1.5 text-center text-[12px] text-text-3">
              Abre pela Livelo, assim os pontos caem.{loja.obs ? ` ${loja.obs[0].toUpperCase()}${loja.obs.slice(1)}.` : ""}
            </p>
          </section>
        );
      })}

      {/* 3. COMPRE NO MERCADO */}
      {noMercado.length > 0 && (
        <Bloco emoji="🏪" titulo={porLoja.length ? "O resto, compre no mercado" : "Compre no mercado"}>
          <Grade itens={noMercado} onToque={setAberto} />
        </Bloco>
      )}

      {semPreco.length > 0 && (
        <Bloco emoji="❔" titulo="Sem preço para comparar" pequeno>
          <Grade itens={semPreco} onToque={setAberto} />
        </Bloco>
      )}

      {jaTem.length > 0 && (
        <Bloco emoji="🏠" titulo="Você já tem em casa" pequeno>
          <div className="flex flex-wrap gap-2">
            {jaTem.map((s) => (
              <button
                key={s.id}
                onClick={() => naoPreciso(s)}
                className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-card-2 px-3 text-[14px] font-bold"
              >
                {s.name} <span className="text-text-3">✕</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-text-3">Toque para tirar da lista.</p>
        </Bloco>
      )}

      {detalhe && (
        <Detalhe i={detalhe} valorPonto={valorPonto} onFechar={() => setAberto(null)} onNaoPreciso={() => naoPreciso(detalhe.shop)} />
      )}
    </div>
  );
}

// Foto: a do site da loja, senao a do encarte, senao pelo nome (catalogo do estoque).
const fotoDe = (i: Item) => i.produto?.foto ?? (i.oferta ? undefined : (urlFoto(i.shop.name) ?? undefined));

function Bloco({ emoji, titulo, pequeno, children }: { emoji: string; titulo: string; pequeno?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className={pequeno ? "text-[22px]" : "text-[30px]"}>{emoji}</span>
        <span className={`font-extrabold leading-tight ${pequeno ? "text-[17px]" : "text-[22px]"}`}>{titulo}</span>
      </div>
      {children}
    </section>
  );
}

// Fotos grandes com o nome embaixo. Tocar abre o detalhe.
function Grade({ itens, onToque }: { itens: Item[]; onToque: (id: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2.5">
      {itens.map((i) => (
        <button key={i.shop.id} onClick={() => onToque(i.shop.id)} className="flex flex-col items-center gap-1 text-center">
          <span className="relative">
            <Foto
              o={i.oferta}
              src={fotoDe(i)}
              className="h-[88px] w-[88px] rounded-[16px] border border-border"
            />
            {i.l.vence === "carrefour" && i.l.pontos > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-extrabold text-white"
                style={{ background: COR_LIVELO }}
              >
                +{i.l.pontos}
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-[13px] font-bold leading-tight">{i.shop.name}</span>
        </button>
      ))}
    </div>
  );
}

function Detalhe({
  i,
  valorPonto,
  onFechar,
  onNaoPreciso,
}: {
  i: Item;
  valorPonto: number;
  onFechar: () => void;
  onNaoPreciso: () => void;
}) {
  const { l, loja } = i;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div className="w-full rounded-t-[24px] bg-card p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Foto o={i.oferta} src={fotoDe(i)} className="h-20 w-20 rounded-[16px] border border-border" />
          <div className="min-w-0 flex-1">
            <div className="text-[20px] font-extrabold leading-tight">{i.shop.name}</div>
            {i.produto && <div className="line-clamp-2 text-[13px] text-text-3">{i.produto.nome}</div>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className={`rounded-[16px] p-3 ${l.vence === "mercado" ? "bg-pos-soft" : "bg-card-2"}`}>
            <div className="text-[13px] font-bold text-text-2">🏪 Mercado</div>
            <div className="text-[24px] font-extrabold">{l.mercado != null ? brl(l.mercado) : "?"}</div>
          </div>
          <div className={`rounded-[16px] p-3 ${l.vence === "carrefour" ? "bg-pos-soft" : "bg-card-2"}`}>
            <div className="text-[13px] font-bold text-text-2">
              {loja ? `${loja.emoji} ${loja.nome}` : "🛒 Online"}
            </div>
            <div className="text-[24px] font-extrabold">{l.carrefour != null ? brl(l.carrefour) : "?"}</div>
            {l.pontos > 0 && (
              <div className="text-[13px] font-extrabold" style={{ color: COR_LIVELO }}>
                +{l.pontos} pts ≈ {brl(l.pontos * valorPonto)}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2.5">
          {i.produto?.url && (
            <a
              href={i.produto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 flex-1 items-center justify-center rounded-[14px] border border-border text-[15px] font-bold"
            >
              Ver no site
            </a>
          )}
          <button onClick={onNaoPreciso} className="h-12 flex-1 rounded-[14px] border border-border text-[15px] font-bold">
            Não preciso ✕
          </button>
        </div>
      </div>
    </div>
  );
}
