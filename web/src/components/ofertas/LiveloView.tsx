"use client";

import { useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { findByName } from "@/lib/defaults";
import { casaItem, COR_LIVELO, maisBarato, nomeMercado, pontuaNaLivelo, type Oferta } from "@/lib/ofertas";
import { LINK_LIVELO, parceiroCarrefour, ptsCertos } from "@/lib/livelo";
import { linha, MARGEM_PADRAO, resumo, veredito, vezes, type Linha, type ProdutoCarrefour } from "@/lib/comparar";
import type { ShopItem } from "@/lib/types";
import { ConfigLivelo } from "./Livelo";
import { useLivelo } from "./useLivelo";
import { useListaOfertas } from "./useOfertas";

// Aba Livelo refeita (pedido do dono: a anterior "nada intuitiva"). Uma pergunta so:
// a minha lista sai mais barata no mercado ou no Carrefour online com os pontos?
// O preco do Carrefour vem do site na hora (/api/carrefour), sem entrar no site e
// sem fazer conta na mao. O que ja tem em casa sai da conta e aparece separado.

const PONTO_PADRAO = 0.03; // R$ por ponto, quando a casa ainda nao configurou
const PTS_PADRAO = 1; // pt/R$ do Carrefour sem campanha

type Busca = { fase: "carregando" | "ok" | "erro"; itens: ProdutoCarrefour[] };

// Busca o Carrefour de cada item, quatro de cada vez (o site e a borda agradecem).
function useCarrefour(nomes: string[]): Record<string, Busca> {
  const [mapa, setMapa] = useState<Record<string, Busca>>({});
  const chave = nomes.join("|");
  useEffect(() => {
    let vivo = true;
    const fila = chave ? chave.split("|") : [];
    const trabalhar = async () => {
      for (let n = fila.shift(); n !== undefined; n = fila.shift()) {
        const nome = n;
        try {
          const r = await fetch(`/api/carrefour?q=${encodeURIComponent(nome)}`);
          const d = (await r.json()) as { ok: boolean; itens: ProdutoCarrefour[] };
          if (vivo) setMapa((m) => ({ ...m, [nome]: { fase: d.ok ? "ok" : "erro", itens: d.itens ?? [] } }));
        } catch {
          if (vivo) setMapa((m) => ({ ...m, [nome]: { fase: "erro", itens: [] } }));
        }
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
  fonteMercado: string | null; // "Encarte Guanabara" / "último que você pagou"
  produto: ProdutoCarrefour | null; // o do site, quando veio de la
  carregando: boolean;
};

export function LiveloView() {
  const { shopping, stock, removeItems, showToast } = useStore();
  const lv = useLivelo();
  const ofertas = useListaOfertas();
  const [filtro, setFiltro] = useState<"todos" | "carrefour" | "mercado">("todos");
  const [config, setConfig] = useState(false);
  // Margem e preferencia deste aparelho: quanto a mais vale pagar para pontuar.
  const [margem, setMargemEstado] = useState(() => {
    try {
      const v = Number(localStorage.getItem("livelo_margem"));
      return Number.isFinite(v) && localStorage.getItem("livelo_margem") !== null ? v : MARGEM_PADRAO;
    } catch {
      return MARGEM_PADRAO;
    }
  });
  function setMargem(v: number) {
    setMargemEstado(v);
    try {
      localStorage.setItem("livelo_margem", String(v));
    } catch {
      /* so nesta visita */
    }
  }

  const pendentes = useMemo(() => shopping.filter((i) => i.status === "pending"), [shopping]);
  // "Ja tem em casa": marcado na lista ou com saldo no estoque. Fica fora da conta.
  const temEmCasa = (i: ShopItem) => i.em_estoque || (findByName(i.name, stock)?.current ?? 0) > 0;
  const precisa = pendentes.filter((i) => !temEmCasa(i));
  const jaTem = pendentes.filter(temEmCasa);

  const busca = useCarrefour(useMemo(() => precisa.map((i) => i.name.trim()), [precisa]));

  const pc = lv ? parceiroCarrefour(lv) : null;
  const ptsPorReal = pc && lv ? ptsCertos(pc, lv.clube) : PTS_PADRAO;
  const valorPonto = lv?.valor_ponto || PONTO_PADRAO;

  const itens: Item[] = precisa.map((shop) => {
    const nome = shop.name.trim();
    const casam = ofertas.filter((o) => casaItem(o, nome));
    const encarte = casam.filter((o) => !pontuaNaLivelo(o.mercado)).sort(maisBarato)[0] ?? null;
    const ultimo = findByName(nome, stock)?.priceLast ?? null;
    const precoMercado = encarte?.preco_por ?? shop.estimated_price ?? ultimo;
    const fonteMercado = encarte
      ? `Encarte ${nomeMercado(encarte.mercado)}`
      : shop.estimated_price
        ? "preço da sua lista"
        : ultimo
          ? "último que você pagou"
          : null;
    const b = busca[nome];
    const doSite = b?.itens[0] ?? null;
    // Plano B: o preco que o coletor semanal trouxe do site
    const coletado: Oferta | null = casam.filter((o) => o.mercado === "carrefour").sort(maisBarato)[0] ?? null;
    const precoCarrefour = doSite?.preco ?? coletado?.preco_por ?? null;
    return {
      shop,
      fonteMercado,
      produto: doSite ?? (coletado ? { nome: coletado.produto, preco: coletado.preco_por, de: coletado.preco_de, url: null, foto: null } : null),
      carregando: !b,
      l: linha({ nome, vezes: vezes(shop.desired_quantity, shop.unit), precoMercado, precoCarrefour, ptsPorReal, valorPonto }),
    };
  });

  const r = resumo(itens.map((i) => i.l));
  const buscando = itens.some((i) => i.carregando);
  const v = veredito(r, margem);
  const valorPts = +(r.tudoCarrefour - r.tudoLiquido).toFixed(2);
  const visiveis = itens.filter((i) => filtro === "todos" || i.l.vence === filtro);

  async function naoPreciso(i: ShopItem) {
    const res = await removeItems([i.id]);
    showToast(res.ok ? `Tirei da lista: ${i.name}` : res.erro);
  }

  if (!pendentes.length) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Livelo" subtitle="Mercado x Carrefour online" />
        <div className="rounded-[18px] border border-border bg-card p-5 text-center">
          <div className="text-[32px]">📝</div>
          <div className="mt-1 text-[17px] font-extrabold">Sua lista está vazia</div>
          <p className="mt-1 text-[14px] text-text-2">
            Fale no 🎤 lá em cima o que precisa comprar. Aqui eu comparo cada item: mercado ou Carrefour online
            com os pontos da Livelo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Livelo" subtitle="Mercado x Carrefour online" />

      {/* O VEREDITO: a resposta em um olhar */}
      <section className="rounded-[20px] border-2 bg-card p-4" style={{ borderColor: COR_LIVELO }}>
        <div className="text-[13px] font-bold text-text-2">
          Sua lista · {precisa.length} {precisa.length === 1 ? "item" : "itens"} para comprar
          {buscando ? " · buscando preços no Carrefour…" : ""}
        </div>
        {r.comparados === 0 ? (
          <p className="mt-2 text-[15px] font-bold">
            {buscando ? "Buscando os preços…" : "Ainda não achei preço para comparar. Veja item a item abaixo."}
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Caixa titulo="🏪 No mercado" valor={r.tudoMercado} destaque={r.tudoMercado <= r.tudoLiquido} />
              <Caixa
                titulo="🛒 Carrefour online"
                valor={r.tudoLiquido}
                destaque={r.tudoLiquido < r.tudoMercado}
                sub={`${brl(r.tudoCarrefour)} no caixa − ${brl(r.tudoCarrefour - r.tudoLiquido)} em pontos`}
              />
            </div>
            <div className="mt-3 rounded-[14px] bg-card-2 p-3">
              {v.tipo === "online" ? (
                <p className="text-[15px] font-extrabold text-pos">
                  ✓ Compre tudo online pela Livelo
                  <span className="block text-[13px] font-bold">
                    {v.aMais > 0.01
                      ? `Paga ${brl(v.aMais)} a mais no caixa (dentro da sua margem de ${brl(margem)}) e ganha ${r.pontos} pts ≈ ${brl(valorPts)}`
                      : `Sai mais barato e ainda ganha ${r.pontos} pts ≈ ${brl(valorPts)}`}
                  </span>
                </p>
              ) : v.tipo === "misto" ? (
                <p className="text-[15px] font-extrabold text-pos">
                  ✓ Melhor: {r.ganhaCarrefour} {r.ganhaCarrefour === 1 ? "item" : "itens"} online e o resto no mercado ={" "}
                  {brl(r.melhorDeCada)}
                  <span className="block text-[13px] font-bold">
                    economiza {brl(v.economia)} · tudo online passaria {brl(r.tudoCarrefour - r.tudoMercado)} da conta do mercado
                  </span>
                </p>
              ) : (
                <p className="text-[15px] font-extrabold text-pos">
                  ✓ Compre no mercado: online passa {brl(r.tudoCarrefour - r.tudoMercado)} da sua margem de {brl(margem)}.
                </p>
              )}
            </div>
            {r.comparados < precisa.length && !buscando && (
              <p className="mt-2 text-[12px] text-text-3">
                Conta feita com {r.comparados} de {precisa.length} itens (os outros não têm preço nos dois lados).
              </p>
            )}
          </>
        )}
        <a
          href={LINK_LIVELO}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex h-12 items-center justify-center rounded-[14px] text-[15px] font-bold text-white"
          style={{ background: COR_LIVELO }}
        >
          Comprar no Carrefour pela Livelo ↗
        </a>
        <p className="mt-1.5 text-center text-[12px] text-text-3">Entre pela Livelo, senão a compra não pontua.</p>
      </section>

      {/* Filtro */}
      <div className="flex gap-2">
        {(
          [
            ["todos", `Todos (${itens.length})`],
            ["carrefour", `Online (${itens.filter((i) => i.l.vence === "carrefour").length})`],
            ["mercado", `Mercado (${itens.filter((i) => i.l.vence === "mercado").length})`],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={`h-10 flex-1 rounded-xl text-[14px] font-bold ${
              filtro === k ? "bg-brand text-brand-ink" : "border border-border bg-card text-text-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Item a item */}
      <div className="flex flex-col gap-2.5">
        {visiveis.map((i) => (
          <ItemCard key={i.shop.id} i={i} onNaoPreciso={() => naoPreciso(i.shop)} />
        ))}
      </div>

      {jaTem.length > 0 && (
        <section className="rounded-[18px] border border-border bg-card p-4">
          <div className="text-[15px] font-extrabold">🏠 Já tem em casa · fora da conta</div>
          <p className="mt-0.5 text-[13px] text-text-2">Precisa mesmo comprar?</p>
          <div className="mt-2 flex flex-col divide-y divide-border">
            {jaTem.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{s.name}</span>
                <span className="text-[13px] text-text-3">
                  tem {findByName(s.name, stock)?.current ?? "?"} {findByName(s.name, stock)?.unit ?? ""}
                </span>
                <button
                  onClick={() => naoPreciso(s)}
                  className="h-9 rounded-lg border border-border px-3 text-[13px] font-bold"
                >
                  Não preciso
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <label className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-3.5 py-3">
        <span className="min-w-0 flex-1 text-[13px] text-text-2">
          <span className="block text-[14px] font-bold text-text">Pago a mais pra pontuar</span>
          Até quanto o online pode custar a mais que o mercado e ainda valer
        </span>
        <span className="text-[14px] font-bold">R$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={margem}
          onChange={(e) => setMargem(Math.max(0, Number(e.target.value) || 0))}
          className="h-10 w-16 rounded-lg border border-border bg-card-2 text-center text-[16px] font-bold"
        />
      </label>

      <button
        onClick={() => lv && setConfig(true)}
        className="rounded-[14px] border border-border bg-card px-3.5 py-3 text-left text-[13px] text-text-2"
      >
        💗 Carrefour {ptsPorReal} pt/R$ · ponto vale R$ {valorPonto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
        {pc?.promocao ? " · 🔥 campanha" : ""}
        {lv ? <span className="ml-1 font-bold text-brand underline">Ajustar</span> : null}
      </button>
      {config && lv && <ConfigLivelo l={lv} onClose={() => setConfig(false)} />}
    </div>
  );
}

function Caixa({ titulo, valor, destaque, sub }: { titulo: string; valor: number; destaque: boolean; sub?: string }) {
  return (
    <div className={`rounded-[14px] border-2 p-3 ${destaque ? "border-pos" : "border-border"}`}>
      <div className="text-[12px] font-bold text-text-2">{titulo}</div>
      <div className={`text-[22px] font-extrabold leading-tight ${destaque ? "text-pos" : ""}`}>{brl(valor)}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-text-3">{sub}</div>}
    </div>
  );
}

function ItemCard({ i, onNaoPreciso }: { i: Item; onNaoPreciso: () => void }) {
  const { l } = i;
  const ganhaOnline = l.vence === "carrefour";
  return (
    <div className="rounded-[18px] border border-border bg-card p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-extrabold">{i.shop.name}</div>
          <div className="text-[12px] text-text-3">
            {i.shop.desired_quantity} {i.shop.unit}
          </div>
        </div>
        {l.vence && l.economia > 0.01 && (
          <span className="rounded-full bg-pos-soft px-2.5 py-1 text-[12px] font-extrabold text-pos">
            {ganhaOnline ? "🛒 Online" : "🏪 Mercado"} −{brl(l.economia)}
          </span>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className={`rounded-[12px] p-2.5 ${l.vence === "mercado" ? "bg-pos-soft" : "bg-card-2"}`}>
          <div className="text-[11px] font-bold text-text-2">🏪 Mercado</div>
          <div className="text-[18px] font-extrabold">{l.mercado != null ? brl(l.mercado) : "—"}</div>
          <div className="truncate text-[11px] text-text-3">{i.fonteMercado ?? "sem preço"}</div>
        </div>
        <div className={`rounded-[12px] p-2.5 ${ganhaOnline ? "bg-pos-soft" : "bg-card-2"}`}>
          <div className="text-[11px] font-bold text-text-2">🛒 Carrefour − pontos</div>
          <div className="text-[18px] font-extrabold">
            {i.carregando && l.liquido == null ? "…" : l.liquido != null ? brl(l.liquido) : "—"}
          </div>
          <div className="text-[11px] leading-snug text-text-3">
            {l.carrefour != null ? (
              <>
                {brl(l.carrefour)} no caixa
                <span className="block font-bold" style={{ color: COR_LIVELO }}>
                  +{l.pontos} pts Livelo
                </span>
              </>
            ) : i.carregando ? (
              "buscando…"
            ) : (
              "não achei no site"
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
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
