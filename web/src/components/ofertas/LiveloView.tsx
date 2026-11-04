"use client";

import { useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { findByName } from "@/lib/defaults";
import { casaItem, COR_LIVELO, maisBarato, nomeMercado, pontuaNaLivelo } from "@/lib/ofertas";
import { paridadeDe, ptsCertos } from "@/lib/livelo";
import { linha, resumo, vezes, type Linha, type ProdutoCarrefour } from "@/lib/comparar";
import { linkLivelo, lojaDe, LOJAS, melhorOnline, type Loja } from "@/lib/lojasOnline";
import type { ShopItem } from "@/lib/types";
import { useLivelo } from "./useLivelo";
import { useListaOfertas } from "./useOfertas";

// Aba Livelo (3a versao, pedido do dono: "nada de ficar escolhendo ponto"). Uma resposta
// so: cada item da lista, onde comprar e quantos pontos ganha. Nada para configurar:
// os pontos por real de cada loja vem sozinhos da Livelo (0046) e o preco vem do site
// da loja na hora (/api/loja-online). Varias lojas online (src/lib/lojasOnline.ts).

const PONTO_PADRAO = 0.03; // R$ por ponto Livelo (media de troca por passagem)

type Busca = Record<string, ProdutoCarrefour[] | "erro">; // "LOJA|item" -> produtos

// Busca cada item em cada loja, quatro de cada vez.
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
  fonteMercado: string | null;
  carregando: boolean;
};

export function LiveloView() {
  const { shopping, stock, removeItems, showToast } = useStore();
  const lv = useLivelo();
  const ofertas = useListaOfertas();

  const pendentes = useMemo(() => shopping.filter((i) => i.status === "pending"), [shopping]);
  const temEmCasa = (i: ShopItem) => i.em_estoque || (findByName(i.name, stock)?.current ?? 0) > 0;
  const precisa = pendentes.filter((i) => !temEmCasa(i));
  const jaTem = pendentes.filter(temEmCasa);

  const busca = useLojas(useMemo(() => precisa.map((i) => i.name.trim()), [precisa]));
  const valorPonto = lv?.valor_ponto || PONTO_PADRAO;
  const ptsDe = (l: Loja) => {
    const p = lv ? paridadeDe(lv, l.codigo) : undefined;
    return p ? ptsCertos(p, lv!.clube) : l.ptsPadrao;
  };

  const itens: Item[] = precisa.map((shop) => {
    const nome = shop.name.trim();
    const encarte = ofertas.filter((o) => casaItem(o, nome) && !pontuaNaLivelo(o.mercado)).sort(maisBarato)[0] ?? null;
    const ultimo = findByName(nome, stock)?.priceLast ?? null;
    const precoMercado = encarte?.preco_por ?? shop.estimated_price ?? ultimo;
    const fonteMercado = encarte
      ? `encarte ${nomeMercado(encarte.mercado)}`
      : shop.estimated_price
        ? "preço da lista"
        : ultimo
          ? "último que você pagou"
          : null;
    const achados = LOJAS.flatMap((l) => {
      const r = busca[`${l.codigo}|${nome}`];
      return Array.isArray(r) && r[0] ? [{ loja: l.codigo, preco: r[0].preco, pts: ptsDe(l), produto: r[0] }] : [];
    });
    const m = melhorOnline(achados, valorPonto);
    const melhor = m ? achados.find((a) => a.loja === m.loja)! : null;
    return {
      shop,
      fonteMercado,
      loja: melhor ? lojaDe(melhor.loja)! : null,
      produto: melhor?.produto ?? null,
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

  const buscando = itens.some((i) => i.carregando);
  const online = itens.filter((i) => i.l.vence === "carrefour" && i.loja);
  const r = resumo(online.map((i) => i.l));
  const pontosOnline = online.reduce((s, i) => s + i.l.pontos, 0);
  const caixaOnline = online.reduce((s, i) => s + (i.l.carrefour ?? 0), 0);
  // Onde comprar: as lojas que ganharam algum item, com o que comprar em cada uma
  const porLoja = LOJAS.map((loja) => ({ loja, itens: online.filter((i) => i.loja?.codigo === loja.codigo) })).filter(
    (x) => x.itens.length,
  );

  async function naoPreciso(i: ShopItem) {
    const res = await removeItems([i.id]);
    showToast(res.ok ? `Tirei da lista: ${i.name}` : res.erro);
  }

  if (!pendentes.length) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Livelo" subtitle="Onde comprar e ganhar pontos" />
        <div className="rounded-[18px] border border-border bg-card p-5 text-center">
          <div className="text-[32px]">📝</div>
          <div className="mt-1 text-[17px] font-extrabold">Sua lista está vazia</div>
          <p className="mt-1 text-[14px] text-text-2">
            Fale no 🎤 o que precisa comprar. Aqui eu mostro, item a item, se vale comprar online e ganhar pontos
            Livelo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Livelo" subtitle="Onde comprar e ganhar pontos" />

      {/* A resposta: quantos pontos e onde */}
      <section className="rounded-[20px] border-2 bg-card p-4" style={{ borderColor: COR_LIVELO }}>
        <div className="text-[13px] font-bold text-text-2">
          {precisa.length} {precisa.length === 1 ? "item" : "itens"} para comprar
          {buscando ? " · buscando preços nas lojas…" : ""}
        </div>
        {online.length ? (
          <>
            <div className="mt-1 text-[30px] font-extrabold leading-tight" style={{ color: COR_LIVELO }}>
              +{pontosOnline.toLocaleString("pt-BR")} pontos
            </div>
            <p className="text-[14px] font-bold">
              comprando {online.length} {online.length === 1 ? "item" : "itens"} online ({brl(caixaOnline)})
              {r.comparados > 0 && (
                <span className="block text-[13px] font-semibold text-text-2">
                  {r.tudoCarrefour <= r.tudoMercado + 0.005
                    ? `Esses itens no mercado: ${brl(r.tudoMercado)}. Online é igual ou mais barato e ainda pontua.`
                    : `Paga ${brl(r.tudoCarrefour - r.tudoMercado)} a mais que no mercado, mas ganha ≈ ${brl(r.pontos * valorPonto)} em pontos.`}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {porLoja.map(({ loja, itens: its }) => (
                <a
                  key={loja.codigo}
                  href={linkLivelo(loja)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-white"
                  style={{ background: COR_LIVELO }}
                >
                  <span className="text-[22px]">{loja.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-extrabold">
                      {loja.nome} · {its.length} {its.length === 1 ? "item" : "itens"} ↗
                    </span>
                    <span className="block truncate text-[12px] opacity-90">
                      {its.map((i) => i.shop.name).join(", ")}
                    </span>
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-2 text-center text-[12px] text-text-3">
              Entre na loja por esse botão (site da Livelo), senão a compra não pontua.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] font-bold">
            {buscando
              ? "Buscando os preços…"
              : "Nada da lista vale a pena online agora. Compre no mercado."}
          </p>
        )}
      </section>

      {/* Item a item */}
      <div className="flex flex-col gap-2">
        {itens.map((i) => (
          <ItemLinha key={i.shop.id} i={i} valorPonto={valorPonto} onNaoPreciso={() => naoPreciso(i.shop)} />
        ))}
      </div>

      {jaTem.length > 0 && (
        <section className="rounded-[18px] border border-border bg-card p-4">
          <div className="text-[15px] font-extrabold">🏠 Já tem em casa · fora da conta</div>
          <div className="mt-2 flex flex-col divide-y divide-border">
            {jaTem.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{s.name}</span>
                <button onClick={() => naoPreciso(s)} className="h-9 rounded-lg border border-border px-3 text-[13px] font-bold">
                  Não preciso
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="px-1 text-[12px] leading-snug text-text-3">
        Lojas: {LOJAS.map((l) => `${l.nome} ${ptsDe(l)} pt/R$${l.obs ? ` (${l.obs})` : ""}`).join(" · ")}. Os pontos
        por real vêm da Livelo e se atualizam sozinhos. 1 ponto ≈ {brl(valorPonto)}. Confira o frete mínimo de cada
        loja.
      </p>
    </div>
  );
}

function ItemLinha({ i, valorPonto, onNaoPreciso }: { i: Item; valorPonto: number; onNaoPreciso: () => void }) {
  const { l, loja } = i;
  const online = l.vence === "carrefour" && loja;
  return (
    <div className="rounded-[16px] border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[16px] font-extrabold">{i.shop.name}</span>
        {online ? (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold text-white" style={{ background: COR_LIVELO }}>
            {loja.emoji} {loja.nome} +{l.pontos} pts
          </span>
        ) : l.vence === "mercado" ? (
          <span className="shrink-0 rounded-full bg-card-2 px-2.5 py-1 text-[12px] font-extrabold text-text-2">🏪 Mercado</span>
        ) : (
          <span className="shrink-0 text-[12px] text-text-3">{i.carregando ? "buscando…" : "sem preço"}</span>
        )}
      </div>
      <div className="mt-1 text-[13px] text-text-2">
        {l.mercado != null ? `Mercado ${brl(l.mercado)}` : "Mercado sem preço"}
        {i.fonteMercado ? <span className="text-text-3"> ({i.fonteMercado})</span> : null}
        {" · "}
        {l.carrefour != null && loja ? (
          <>
            {loja.nome} {brl(l.carrefour)}{" "}
            <span className="font-bold" style={{ color: COR_LIVELO }}>
              +{l.pontos} pts ≈ {brl(l.pontos * valorPonto)}
            </span>
          </>
        ) : i.carregando ? (
          "online buscando…"
        ) : (
          "não achei online"
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        {i.produto && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-text-3" title={i.produto.nome}>
            {i.produto.url ? (
              <a href={i.produto.url} target="_blank" rel="noopener noreferrer" className="underline">
                {i.produto.nome}
              </a>
            ) : (
              i.produto.nome
            )}
          </span>
        )}
        <button onClick={onNaoPreciso} className="ml-auto shrink-0 text-[12px] font-bold text-text-3 underline">
          Não preciso
        </button>
      </div>
    </div>
  );
}
