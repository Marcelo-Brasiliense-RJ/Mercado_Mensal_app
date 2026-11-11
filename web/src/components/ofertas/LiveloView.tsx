"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { COR_LIVELO } from "@/lib/ofertas";
import { precoNoMercado, veredito, type PrecoMercado, type Veredito } from "@/lib/veredito";
import { useListaOfertas } from "./useOfertas";
import { paridadeDe, ptsCertos, ptsMax } from "@/lib/livelo";
import {
  chaveProduto,
  ehDoItem,
  CHIPS,
  fimCampanha,
  linkLivelo,
  lojaDe,
  LOJAS,
  marcaDe,
  type Chip,
  type Loja,
  type Marca,
  type Produto,
} from "@/lib/lojasOnline";
import { useLivelo } from "./useLivelo";
import { useBuscaLojas, useVitrine } from "./useVitrine";

// Aba Livelo (5a versao). Pedido do dono: "que nem Ofertas": uma vitrine de ofertas de
// coisas de casa nas lojas que pontuam na Livelo, com destaque para o que esta na lista
// e no estoque. Serve tambem para montar a lista ("+ Lista"). Comprar = entrar pela
// Livelo, senao nao pontua. Lojas e categorias: src/lib/lojasOnline.ts.

type Filtro = "lista" | Chip;
type Card = Produto & { pts: number; marca: Marca; mercado: PrecoMercado | null; ver: Veredito };
const PRIMEIROS = 12; // so o cerne; o resto num toque
const PONTO_PADRAO = 0.03; // R$ por ponto Livelo

export function LiveloView() {
  const { shopping, stock, addShopItem, showToast } = useStore();
  const lv = useLivelo();
  const [filtro, setFiltro] = useState<Filtro>("mercado"); // foco do dono: compra do mes
  const params = useSearchParams(); // ?q=arroz: vindo da aba Ofertas
  const [termo, setTermo] = useState(() => params.get("q") ?? "");
  const [quantos, setQuantos] = useState(PRIMEIROS);
  const [postos, setPostos] = useState<Set<string>>(new Set());
  const [lojaSel, setLojaSel] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Card | null>(null);
  const valorPonto = lv?.valor_ponto || PONTO_PADRAO;

  const lista = useMemo(
    () => shopping.filter((i) => i.status === "pending").map((i) => i.name.trim().toLowerCase()),
    [shopping],
  );
  const estoque = useMemo(() => stock.map((s) => s.name.trim().toLowerCase()), [stock]);
  const v = useVitrine(lista);
  const ofertas = useListaOfertas();
  const busca = useBuscaLojas(termo);
  const buscando = termo.trim().length >= 2;

  const ptsDe = (l: Loja) => {
    const p = lv ? paridadeDe(lv, l.codigo) : undefined;
    return p ? ptsCertos(p, lv!.clube) : l.ptsPadrao;
  };
  const promos = LOJAS.flatMap((l) => {
    const p = lv ? paridadeDe(lv, l.codigo) : undefined;
    return p?.promocao ? [{ loja: l, pts: ptsMax(p, lv!.clube), normal: p.pontos_normal, ate: fimCampanha(p.regra) }] : [];
  });

  // Cada produto ja com a resposta: pontos, preco do mercado e quem ganha.
  const enriquecer = (p: Produto): Card => {
    const loja = lojaDe(p.loja)!;
    const pts = Math.round(p.preco * ptsDe(loja));
    const item = v.daLista[p.id] ?? lista.find((i) => ehDoItem(p.nome, i)) ?? estoque.find((i) => ehDoItem(p.nome, i)) ?? null;
    const mercado = precoNoMercado(p.nome, item, ofertas, stock, shopping);
    return {
      ...p,
      pts,
      marca: v.daLista[p.id] ? "lista" : marcaDe(p.nome, lista, estoque),
      mercado,
      ver: veredito(p.preco, pts, valorPonto, mercado?.preco ?? null),
    };
  };
  const cards: Card[] = useMemo(
    () => v.produtos.map(enriquecer).sort((a, b) => peso(b) - peso(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enriquecer depende so destes
    [v, lista, estoque, lv, ofertas, stock, shopping],
  );
  const comPontos = (ps: Produto[]): Card[] => ps.map(enriquecer);
  const visiveis = (
    buscando ? comPontos(busca.produtos) : cards.filter((c) => (filtro === "lista" ? c.marca !== null : c.chip === filtro))
  ).filter((c) => !lojaSel || c.loja === lojaSel);
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

      {/* Busca: o resultado aparece embaixo, em fotos */}
      <label className="flex h-12 items-center gap-2 rounded-[14px] border border-border bg-card px-3.5">
        <span className="text-[18px]">🔎</span>
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar produto (ex.: iogurte)"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
        {termo && (
          <button onClick={() => setTermo("")} aria-label="Limpar busca" className="text-[18px] text-text-3">
            ✕
          </button>
        )}
      </label>

      {/* Filtros */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHIPS.slice(0, 1).map((c) => (
          <Pilula key={c.id} ativo={!buscando && filtro === c.id} onClick={() => (setFiltro(c.id), setTermo(""), setQuantos(PRIMEIROS))}>
            {c.emoji} {c.nome}
          </Pilula>
        ))}
        {naLista > 0 && (
          <Pilula ativo={!buscando && filtro === "lista"} onClick={() => (setFiltro("lista"), setTermo(""), setQuantos(PRIMEIROS))}>
            📝 Da sua casa ({naLista})
          </Pilula>
        )}
        {CHIPS.slice(1).map((c) => (
          <Pilula key={c.id} ativo={!buscando && filtro === c.id} onClick={() => (setFiltro(c.id), setTermo(""), setQuantos(PRIMEIROS))}>
            {c.emoji} {c.nome}
          </Pilula>
        ))}
      </div>

      {/* Por loja: cada uma na sua cor */}
      <div className="-mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          onClick={() => setLojaSel(null)}
          className={`h-8 shrink-0 rounded-full px-3 text-[13px] font-bold ${
            lojaSel ? "border border-border bg-card text-text-2" : "bg-text text-card"
          }`}
        >
          Todas as lojas
        </button>
        {LOJAS.map((l) => (
          <button
            key={l.codigo}
            onClick={() => setLojaSel(lojaSel === l.codigo ? null : l.codigo)}
            className="h-8 shrink-0 rounded-full border-2 px-3 text-[13px] font-extrabold"
            style={
              lojaSel === l.codigo
                ? { background: l.cor, borderColor: l.cor, color: "#fff" }
                : { borderColor: l.cor, color: l.cor }
            }
          >
            {l.nome}
            {!v.carregando && !v.lojasOk.includes(l.codigo) ? " ⚠️" : ""}
          </button>
        ))}
      </div>

      {buscando && (
        <div className="px-1 text-[15px] font-extrabold">
          {busca.carregando
            ? `🔎 Procurando "${termo.trim()}"…`
            : busca.produtos.length
              ? `${busca.produtos.length} ${busca.produtos.length === 1 ? "achado" : "achados"} para "${termo.trim()}"`
              : `Não achei "${termo.trim()}" nas lojas 😕`}
        </div>
      )}

      {v.carregando && !buscando && (
        <div className="rounded-[14px] bg-card-2 px-4 py-3">
          <div className="text-[14px] font-bold text-text-2">🔎 Buscando ofertas e comparando com o mercado…</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(v.progresso * 100)}%`, background: COR_LIVELO }} />
          </div>
        </div>
      )}

      {!v.carregando && !cards.length && !buscando && (
        <div className="rounded-[24px] bg-card p-5 text-center">
          <div className="text-[32px]">😕</div>
          <div className="text-[16px] font-extrabold">As lojas não responderam agora</div>
          <p className="text-[14px] text-text-2">Toque em ↻ lá em cima daqui a pouco.</p>
        </div>
      )}

      {/* Vitrine: so aparece pronta (nada pulando de lugar) e so o cerne primeiro */}
      <div className="grid grid-cols-2 gap-2.5">
        {visiveis.slice(0, buscando ? 40 : quantos).map((c) => (
          <Cartao key={c.id} c={c} posto={postos.has(c.id)} onLista={() => porNaLista(c)} onAbrir={() => setDetalhe(c)} />
        ))}
      </div>

      {!buscando && visiveis.length > quantos && (
        <button
          onClick={() => setQuantos((n) => n + PRIMEIROS)}
          className="h-12 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Ver mais ofertas ({visiveis.length - quantos})
        </button>
      )}

      {!v.carregando && cards.length > 0 && (
        <p className="px-1 text-center text-[12px] text-text-3">
          Lojas: {LOJAS.filter((l) => v.lojasOk.includes(l.codigo)).map((l) => l.nome).join(", ")}
          {LOJAS.some((l) => !v.lojasOk.includes(l.codigo))
            ? ` · sem resposta: ${LOJAS.filter((l) => !v.lojasOk.includes(l.codigo)).map((l) => l.nome).join(", ")}`
            : ""}
        </p>
      )}

      {detalhe && (
        <Comparar
          c={detalhe}
          valorPonto={valorPonto}
          ptsDe={ptsDe}
          posto={postos.has(detalhe.id)}
          onLista={() => porNaLista(detalhe)}
          onFechar={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

const ROTULO = { lista: "📝 Na sua lista", estoque: "🏠 Você usa", basico: "⭐ Básico da casa" } as const;

// Ordem da vitrine: o que e da casa primeiro, depois desconto e pontos.
function peso(c: { marca: string | null; desconto: number; pts: number; preco: number }) {
  const casa = c.marca === "lista" ? 100 : c.marca === "estoque" ? 80 : c.marca === "basico" ? 50 : 0;
  return casa + c.desconto * 40 + Math.min(10, (c.pts / Math.max(c.preco, 1)) * 3);
}

// A resposta no cartao, em uma linha: ganha pela Livelo ou o mercado sai melhor.
function Selinho({ ver, mercado }: { ver: Veredito; mercado: PrecoMercado | null }) {
  if (ver.tipo === "sem") return null;
  return ver.tipo === "livelo" ? (
    <div className="mt-1 rounded-lg bg-[#dcfce7] px-1.5 py-1 text-[12px] font-extrabold leading-tight text-[#166534]">
      ✅ Vale a pena{ver.economia >= 0.1 ? ` · −${brl(ver.economia)}` : ""}
      <span className="block font-semibold">mercado {brl(mercado!.preco)}</span>
    </div>
  ) : (
    <div className="mt-1 rounded-lg bg-card-2 px-1.5 py-1 text-[12px] font-extrabold leading-tight text-text-2">
      🏪 Mercado {brl(mercado!.preco)}
      <span className="block font-semibold">sai {brl(ver.diferenca)} mais barato</span>
    </div>
  );
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
  onAbrir,
}: {
  c: Card;
  posto: boolean;
  onLista: () => void;
  onAbrir: () => void;
}) {
  const loja = lojaDe(c.loja)!;
  const [semFoto, setSemFoto] = useState(false);
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[18px] border bg-card ${c.marca ? "border-2" : "border-border"}`}
      style={c.marca ? { borderColor: COR_LIVELO } : undefined}
    >
      <button onClick={onAbrir} className="relative block bg-white text-left">
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
            {ROTULO[c.marca]}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span
          className="self-start rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
          style={{ background: loja.cor }}
        >
          {loja.nome}
        </span>
        <button onClick={onAbrir} className="line-clamp-2 text-left text-[13px] font-bold leading-tight">
          {c.nome}
        </button>
        <div className="mt-auto">
          {c.de && <div className="text-[12px] text-text-3 line-through">{brl(c.de)}</div>}
          <div className="text-[19px] font-extrabold leading-tight">{brl(c.preco)}</div>
          <div className="text-[13px] font-extrabold" style={{ color: COR_LIVELO }}>
            💗 +{c.pts.toLocaleString("pt-BR")} pontos
          </div>
          <Selinho ver={c.ver} mercado={c.mercado} />
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

// Tocar no produto: primeiro a resposta (Livelo ou mercado, quanto ganha), depois, so se
// a pessoa quiser, outras marcas e lojas.
function Comparar({
  c,
  valorPonto,
  ptsDe,
  posto,
  onLista,
  onFechar,
}: {
  c: Card;
  valorPonto: number;
  ptsDe: (l: Loja) => number;
  posto: boolean;
  onLista: () => void;
  onFechar: () => void;
}) {
  const loja = lojaDe(c.loja)!;
  const [verMais, setVerMais] = useState(false);
  const { ver, mercado } = c;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div
        className="max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-[24px] bg-card p-5 pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {c.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- foto do proprio site da loja
            <img src={c.foto} alt="" className="h-16 w-16 shrink-0 rounded-[14px] border border-border bg-white object-contain" />
          )}
          <div className="min-w-0 flex-1 text-[16px] font-extrabold leading-tight">{c.nome}</div>
          <button onClick={onFechar} aria-label="Fechar" className="text-[22px] text-text-3">
            ✕
          </button>
        </div>

        {/* A RESPOSTA */}
        <div
          className="mt-4 rounded-[18px] p-4"
          style={{ background: ver.tipo === "livelo" ? "#dcfce7" : ver.tipo === "mercado" ? "var(--color-card-2, #f3f0ec)" : `${COR_LIVELO}14` }}
        >
          <div className="text-[22px] font-extrabold leading-tight">
            {ver.tipo === "livelo"
              ? "✅ Vale comprar pela Livelo"
              : ver.tipo === "mercado"
                ? "🏪 Melhor comprar no mercado"
                : `💗 Você ganha ${c.pts} pontos`}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-text-2">
            {ver.tipo === "livelo"
              ? ver.economia >= 0.1
                ? `Você economiza ${brl(ver.economia)} contando os pontos.`
                : "Mesmo preço do mercado, e ainda ganha os pontos."
              : ver.tipo === "mercado"
                ? `Lá sai ${brl(ver.diferenca)} mais barato, mesmo contando os pontos.`
                : `Valem uns ${brl(ver.valorPts)}. Ainda não tenho o preço do mercado para comparar.`}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className={`rounded-[16px] border-2 p-3 ${ver.tipo === "livelo" ? "" : "border-border"}`} style={ver.tipo === "livelo" ? { borderColor: "#16a34a" } : undefined}>
            <span className="rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white" style={{ background: loja.cor }}>
              {loja.nome}
            </span>
            <div className="mt-1 text-[22px] font-extrabold">{brl(c.preco)}</div>
            <div className="text-[13px] font-extrabold" style={{ color: COR_LIVELO }}>
              💗 +{c.pts} pts ≈ {brl(ver.valorPts)}
            </div>
          </div>
          <div className={`rounded-[16px] border-2 p-3 ${ver.tipo === "mercado" ? "" : "border-border"}`} style={ver.tipo === "mercado" ? { borderColor: "#16a34a" } : undefined}>
            <span className="rounded-md bg-text px-2 py-0.5 text-[11px] font-extrabold text-card">🏪 Mercado</span>
            <div className="mt-1 text-[22px] font-extrabold">{mercado ? brl(mercado.preco) : "?"}</div>
            <div className="truncate text-[12px] text-text-3">{mercado ? `${mercado.fonte}` : "sem preço ainda"}</div>
          </div>
        </div>
        {mercado?.oferta && (
          <div className="mt-1.5 truncate text-[12px] text-text-3">No mercado: {mercado.oferta.produto}</div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            onClick={onLista}
            disabled={posto || c.marca === "lista"}
            className="h-12 rounded-[14px] border border-border text-[15px] font-bold disabled:opacity-60"
          >
            {posto || c.marca === "lista" ? "✓ Na lista" : "+ Lista"}
          </button>
          <a
            href={linkLivelo(loja)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center rounded-[14px] text-[15px] font-bold text-white"
            style={{ background: COR_LIVELO }}
          >
            Comprar pela Livelo
          </a>
        </div>

        {/* Mais, so se quiser */}
        <div className="mt-3 flex flex-col gap-2">
          {mercado && (
            <Link
              href={`/app/ofertas?q=${encodeURIComponent(mercado.item)}`}
              className="flex h-11 items-center justify-center rounded-[14px] border border-border text-[14px] font-bold"
            >
              🏷️ Ver ofertas de “{mercado.item}” nos mercados
            </Link>
          )}
          {!verMais ? (
            <button onClick={() => setVerMais(true)} className="h-11 rounded-[14px] border border-border text-[14px] font-bold">
              🔁 Ver outras marcas e lojas
            </button>
          ) : (
            <OutrasOpcoes c={c} valorPonto={valorPonto} ptsDe={ptsDe} />
          )}
        </div>
      </div>
    </div>
  );
}

function OutrasOpcoes({ c, valorPonto, ptsDe }: { c: Card; valorPonto: number; ptsDe: (l: Loja) => number }) {
  const b = useBuscaLojas(chaveProduto(c.nome).split(" ").slice(0, 2).join(" "));
  const linhas = b.produtos
    .filter((p) => p.id !== c.id)
    .map((p) => {
      const loja = lojaDe(p.loja)!;
      const pts = Math.round(p.preco * ptsDe(loja));
      return { p, loja, pts, liquido: p.preco - pts * valorPonto };
    })
    .sort((x, y) => x.liquido - y.liquido)
    .slice(0, 8);
  if (b.carregando) return <div className="py-2 text-center text-[14px] text-text-2">🔎 Procurando…</div>;
  if (!linhas.length) return <div className="py-2 text-center text-[14px] text-text-2">Não achei outras opções.</div>;
  return (
    <>
      {linhas.map(({ p, loja, pts }) => (
        <a
          key={p.id}
          href={p.url ?? linkLivelo(loja)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[14px] border border-border p-2.5"
        >
          {p.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- foto do proprio site da loja
            <img src={p.foto} alt="" className="h-12 w-12 shrink-0 rounded-[10px] bg-white object-contain" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{p.nome}</span>
            <span className="text-[16px] font-extrabold">{brl(p.preco)}</span>{" "}
            <span className="text-[12px] font-extrabold" style={{ color: COR_LIVELO }}>
              +{pts} pts
            </span>
          </span>
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: loja.cor }}>
            {loja.nome}
          </span>
        </a>
      ))}
    </>
  );
}
