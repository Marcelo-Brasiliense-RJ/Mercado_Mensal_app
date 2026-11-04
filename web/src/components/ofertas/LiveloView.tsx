"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { COR_LIVELO } from "@/lib/ofertas";
import { paridadeDe, ptsCertos, ptsMax } from "@/lib/livelo";
import { CHIPS, fimCampanha, linkLivelo, lojaDe, LOJAS, marcaDe, type Chip, type Loja, type Produto } from "@/lib/lojasOnline";
import { useLivelo } from "./useLivelo";
import { useVitrine } from "./useVitrine";

// Aba Livelo (5a versao). Pedido do dono: "que nem Ofertas": uma vitrine de ofertas de
// coisas de casa nas lojas que pontuam na Livelo, com destaque para o que esta na lista
// e no estoque. Serve tambem para montar a lista ("+ Lista"). Comprar = entrar pela
// Livelo, senao nao pontua. Lojas e categorias: src/lib/lojasOnline.ts.

type Filtro = "tudo" | "lista" | Chip;

export function LiveloView() {
  const { shopping, stock, addShopItem, showToast } = useStore();
  const lv = useLivelo();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [postos, setPostos] = useState<Set<string>>(new Set());

  const lista = useMemo(
    () => shopping.filter((i) => i.status === "pending").map((i) => i.name.trim().toLowerCase()),
    [shopping],
  );
  const estoque = useMemo(() => stock.map((s) => s.name.trim().toLowerCase()), [stock]);
  const v = useVitrine(lista);

  const ptsDe = (l: Loja) => {
    const p = lv ? paridadeDe(lv, l.codigo) : undefined;
    return p ? ptsCertos(p, lv!.clube) : l.ptsPadrao;
  };
  const promos = LOJAS.flatMap((l) => {
    const p = lv ? paridadeDe(lv, l.codigo) : undefined;
    return p?.promocao ? [{ loja: l, pts: ptsMax(p, lv!.clube), normal: p.pontos_normal, ate: fimCampanha(p.regra) }] : [];
  });

  type Card = Produto & { pts: number; marca: "lista" | "estoque" | null };
  const cards: Card[] = useMemo(() => {
    const ptsLoja = Object.fromEntries(LOJAS.map((l) => [l.codigo, ptsDe(l)]));
    return v.produtos
      .map((p) => ({
        ...p,
        pts: Math.round(p.preco * (ptsLoja[p.loja] ?? 1)),
        marca: v.daLista[p.id] ? ("lista" as const) : marcaDe(p.nome, lista, estoque),
      }))
      .sort((a, b) => peso(b) - peso(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ptsDe so muda com lv
  }, [v, lista, estoque, lv]);

  const visiveis = cards.filter((c) =>
    filtro === "tudo" ? true : filtro === "lista" ? c.marca !== null : c.chip === filtro,
  );
  const naLista = cards.filter((c) => c.marca !== null).length;

  async function porNaLista(c: Card) {
    const nome = (v.daLista[c.id] ?? c.nome).toLowerCase();
    const r = await addShopItem({ name: nome, desired_quantity: 1, unit: "un", estimated_price: c.preco });
    if (!r.ok) return showToast(r.erro);
    setPostos((s) => new Set(s).add(c.id));
    showToast(`Na lista: ${nome}`);
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Promocao de pontos de hoje */}
      {promos.map((p) => (
        <a
          key={p.loja.codigo}
          href={linkLivelo(p.loja)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[20px] p-4 text-white"
          style={{ background: `linear-gradient(135deg, ${COR_LIVELO}, #ff5a3c)` }}
        >
          <span className="text-[40px] leading-none">🔥</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[20px] font-extrabold leading-tight">
              {p.loja.nome}: {p.pts}x pontos
            </span>
            <span className="block text-[13px] font-semibold opacity-90">
              cada R$ 1 vira {p.pts} pontos{p.ate ? ` · até ${p.ate}` : ""}
              {p.normal && p.normal < p.pts ? ` (normal é ${p.normal})` : ""}
            </span>
          </span>
        </a>
      ))}

      {/* Filtros */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Pilula ativo={filtro === "tudo"} onClick={() => setFiltro("tudo")}>
          🔥 Tudo
        </Pilula>
        {naLista > 0 && (
          <Pilula ativo={filtro === "lista"} onClick={() => setFiltro("lista")}>
            📝 Da sua casa ({naLista})
          </Pilula>
        )}
        {CHIPS.map((c) => (
          <Pilula key={c.id} ativo={filtro === c.id} onClick={() => setFiltro(c.id)}>
            {c.emoji} {c.nome}
          </Pilula>
        ))}
      </div>

      {v.carregando && (
        <div className="flex items-center gap-2 rounded-[14px] bg-card-2 px-3 py-2 text-[14px] font-bold text-text-2">
          <span className="animate-pulse">🔎</span> Buscando ofertas nas lojas…
        </div>
      )}

      {!v.carregando && !cards.length && (
        <div className="rounded-[18px] border border-border bg-card p-5 text-center">
          <div className="text-[32px]">😕</div>
          <div className="text-[16px] font-extrabold">As lojas não responderam agora</div>
          <p className="text-[14px] text-text-2">Toque em ↻ lá em cima daqui a pouco.</p>
        </div>
      )}

      {/* Vitrine */}
      <div className="grid grid-cols-2 gap-2.5">
        {visiveis.map((c) => (
          <Cartao key={c.id} c={c} posto={postos.has(c.id)} onLista={() => porNaLista(c)} />
        ))}
      </div>

      {!v.carregando && cards.length > 0 && (
        <p className="px-1 text-center text-[12px] text-text-3">
          Lojas: {LOJAS.filter((l) => v.lojasOk.includes(l.codigo)).map((l) => l.nome).join(", ")}
          {LOJAS.some((l) => !v.lojasOk.includes(l.codigo))
            ? ` · sem resposta: ${LOJAS.filter((l) => !v.lojasOk.includes(l.codigo)).map((l) => l.nome).join(", ")}`
            : ""}
        </p>
      )}
    </div>
  );
}

// Ordem da vitrine: o que e da casa primeiro, depois desconto e pontos.
function peso(c: { marca: string | null; desconto: number; pts: number; preco: number }) {
  const casa = c.marca === "lista" ? 100 : c.marca === "estoque" ? 50 : 0;
  return casa + c.desconto * 40 + Math.min(10, (c.pts / Math.max(c.preco, 1)) * 3);
}

function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-[14px] font-bold ${
        ativo ? "bg-brand text-brand-ink" : "border border-border bg-card text-text-2"
      }`}
    >
      {children}
    </button>
  );
}

function Cartao({
  c,
  posto,
  onLista,
}: {
  c: Produto & { pts: number; marca: "lista" | "estoque" | null };
  posto: boolean;
  onLista: () => void;
}) {
  const loja = lojaDe(c.loja)!;
  const [semFoto, setSemFoto] = useState(false);
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[18px] border bg-card ${c.marca ? "border-2" : "border-border"}`}
      style={c.marca ? { borderColor: COR_LIVELO } : undefined}
    >
      <a href={c.url ?? linkLivelo(loja)} target="_blank" rel="noopener noreferrer" className="relative block bg-white">
        {c.foto && !semFoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto do proprio site da loja
          <img
            src={c.foto}
            alt=""
            loading="lazy"
            onError={() => setSemFoto(true)}
            className="aspect-square w-full object-contain p-2"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center text-[44px]">{loja.emoji}</div>
        )}
        {c.desconto >= 0.05 && (
          <span className="absolute left-2 top-2 rounded-lg bg-[#16a34a] px-1.5 py-0.5 text-[13px] font-extrabold text-white">
            -{Math.round(c.desconto * 100)}%
          </span>
        )}
        {c.marca && (
          <span
            className="absolute bottom-2 left-2 rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold text-white"
            style={{ background: COR_LIVELO }}
          >
            {c.marca === "lista" ? "📝 Na sua lista" : "🏠 Você usa"}
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="text-[11px] font-bold text-text-3">
          {loja.emoji} {loja.nome}
        </div>
        <div className="line-clamp-2 text-[13px] font-bold leading-tight">{c.nome}</div>
        <div className="mt-auto">
          {c.de && <div className="text-[12px] text-text-3 line-through">{brl(c.de)}</div>}
          <div className="text-[19px] font-extrabold leading-tight">{brl(c.preco)}</div>
          <div className="text-[13px] font-extrabold" style={{ color: COR_LIVELO }}>
            💗 +{c.pts.toLocaleString("pt-BR")} pontos
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={onLista}
            disabled={posto || c.marca === "lista"}
            className="h-9 rounded-[10px] border border-border text-[13px] font-bold disabled:opacity-60"
          >
            {posto || c.marca === "lista" ? "✓ Lista" : "+ Lista"}
          </button>
          <a
            href={linkLivelo(loja)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center justify-center rounded-[10px] text-[13px] font-bold text-white"
            style={{ background: COR_LIVELO }}
          >
            Comprar
          </a>
        </div>
      </div>
    </div>
  );
}
