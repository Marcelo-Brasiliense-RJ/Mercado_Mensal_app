"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useOfertas } from "./useOfertas";
import { DeOlho, Estrela } from "./DeOlho";
import { MercadosDaCasa } from "./MeusMercados";
import { Polegar } from "./NaoCompro";
import { LiveloSecao } from "./Livelo";
import { Foto, PorUnidade, Selo } from "./pecas";
import { Grupo, useRecolhidos } from "@/components/ui/Grupo";
import { ICONE } from "@/lib/categorias";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon, TagIcon } from "@/components/ui/icons";
import {
  casaBusca,
  corMercado,
  corredor,
  faltaEmCasa,
  desconto,
  maisBarato,
  nomeCompleto,
  nomeMercado,
  prazo,
  resumir,
  type Oferta,
} from "@/lib/ofertas";

// Aba Ofertas: o que esta em promocao (De olho, Nao compro, maiores descontos, todas).
// A conta da lista (onde compensa, quanto sai em cada mercado) fica na aba Lista.
export function OfertasView() {
  const estado = useOfertas();
  const { shopping, stock, addShopItem, showToast } = useStore();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ titulo: string; opcoes: Oferta[] } | null>(null);
  const [postos, setPostos] = useState<Set<string>>(new Set());
  const naLista = (nome: string) =>
    postos.has(nome.toLowerCase()) ||
    shopping.some((i) => i.status === "pending" && i.name.toLowerCase() === nome.toLowerCase());

  // Um toque: o item vai para a lista com o preco da oferta (a pessoa ve na Lista onde comprar).
  async function porNaLista(nome: string, o: Oferta, silencioso = false) {
    const r = await addShopItem({ name: nome.toLowerCase(), desired_quantity: 1, unit: "un", estimated_price: o.preco_por });
    if (!r.ok) {
      showToast(r.erro);
      return false;
    }
    setPostos((s) => new Set(s).add(nome.toLowerCase()));
    if (!silencioso) showToast(`${nome} na lista: ${brl(o.preco_por)} no ${nomeMercado(o.mercado)}`);
    return true;
  }

  const dados = estado.fase === "ok" ? estado.dados : null;
  // O que falta vem do que o app ja tem na mao (lista + estoque), nao do cache das
  // ofertas: tirar item da lista muda a conta na hora.
  const lista = useMemo(() => faltaEmCasa(shopping, stock), [shopping, stock]);
  const resumo = useMemo(() => (dados ? resumir(dados.ofertas, lista) : null), [dados, lista]);
  const achadosBusca = useMemo(() => {
    if (!dados || busca.trim().length < 2) return null;
    return dados.ofertas.filter((o) => casaBusca(o, busca)).sort(maisBarato);
  }, [dados, busca]);

  if (estado.fase === "carregando") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-brand" />
      </div>
    );
  }
  if (estado.fase !== "ok" || !resumo || !dados) {
    return (
      <Aviso
        titulo={estado.fase === "desligado" ? "As ofertas ainda não foram ligadas" : "Não deu para carregar as ofertas"}
        texto={
          estado.fase === "desligado"
            ? "Assim que o monitor de promoções publicar, as ofertas dos mercados aparecem aqui."
            : "Confira a internet e abra esta aba de novo."
        }
      />
    );
  }
  if (!dados.ofertas.length) {
    return <Aviso titulo="Nenhuma oferta valendo agora" texto="Os encartes novos entram assim que os mercados publicarem." />;
  }


  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Ofertas" subtitle="Promoções dos seus mercados" />
      <MercadosDaCasa />

      {/* Busca: o unico campo da tela */}
      <label className="relative block">
        <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          id="busca-ofertas"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar oferta: arroz, café, Guanabara..."
          className="h-14 w-full rounded-2xl border-2 border-border bg-card pl-12 pr-4 text-[17px] outline-none focus:border-brand"
          autoComplete="off"
        />
      </label>

      {achadosBusca ? (
        <section className="flex flex-col gap-3">
          <Titulo>
            {achadosBusca.length
              ? `${achadosBusca.length} ${achadosBusca.length > 1 ? "ofertas" : "oferta"}, mais barata primeiro`
              : `Nada em oferta para “${busca.trim()}”`}
          </Titulo>
          <Grade>
            {achadosBusca.slice(0, 40).map((o) => (
              <CardOferta key={o.id} o={o} naLista={naLista(o.produto)} onLista={() => porNaLista(o.produto, o)} />
            ))}
          </Grade>
        </section>
      ) : (
        <>
          {/* 0. O que a pessoa marcou para pegar em promocao */}
          <DeOlho ofertas={dados.ofertas} onComparar={(titulo, opcoes) => setAberto({ titulo, opcoes })} />
          <LiveloSecao ofertas={dados.ofertas} />

          {/* A conta da lista (onde vale ir, quanto sai em cada mercado) mora na Lista,
              junto dos itens: aqui fica so o atalho. */}
          {resumo.comOferta > 0 && resumo.mercados[0] && (
            <Link
              href="/app/lista"
              className="flex items-center gap-3 rounded-[18px] border-2 p-4"
              style={{ borderColor: corMercado(resumo.mercados[0].mercado) }}
            >
              <span className="text-[24px]" aria-hidden>🛒</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">
                  Sua lista: {resumo.comOferta} de {lista.length} em oferta
                </span>
                <span className="block text-[13px] text-text-2">
                  Mais barato no {nomeMercado(resumo.mercados[0].mercado)}. Veja onde compensa na Lista.
                </span>
              </span>
              <span className="text-[22px] text-text-3" aria-hidden>›</span>
            </Link>
          )}

          {/* 4. Achados */}
          {resumo.achados.length > 0 && (
            <section className="flex flex-col gap-3">
              <Titulo>Maiores descontos da semana</Titulo>
              <Grade>
                {resumo.achados.map((o) => (
                  <CardOferta key={o.id} o={o} naLista={naLista(o.produto)} onLista={() => porNaLista(o.produto, o)} />
                ))}
              </Grade>
            </section>
          )}

          {/* 5. Todo o encarte, por categoria */}
          <TodasOfertas
            ofertas={dados.ofertas}
            naLista={naLista}
            onLista={(o) => porNaLista(o.produto, o)}
          />
        </>
      )}

      {dados.atualizado_em && (
        <p className="text-center text-[12px] text-text-3">
          Encartes lidos em{" "}
          {new Date(dados.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      <Modal open={!!aberto} onClose={() => setAberto(null)} maxWidth={520}>
        {aberto && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-2">Comparar</div>
              <div className="text-[22px] font-extrabold capitalize">{aberto.titulo}</div>
            </div>
            <div className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
              {aberto.opcoes.map((o, i) => (
                <div key={o.id} className="flex items-center gap-3 py-2.5">
                  <Foto o={o} className="h-14 w-14 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold leading-tight">{nomeCompleto(o)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Selo mercado={o.mercado} />
                      {i === 0 && <span className="text-[12px] font-bold text-pos">Mais barato</span>}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[17px] font-extrabold text-pos">{brl(o.preco_por)}</div>
                    <PorUnidade o={o} />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setAberto(null)}
              className="h-12 rounded-2xl bg-card-2 text-[15px] font-bold"
            >
              Fechar
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">{children}</h2>;
}

function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-border bg-card px-6 py-10 text-center">
      <TagIcon size={34} className="text-brand" />
      <div className="text-[18px] font-extrabold">{titulo}</div>
      <div className="max-w-[340px] text-[14px] text-text-2">{texto}</div>
    </div>
  );
}

function CardOferta({
  o,
  rotulo,
  origem,
  ultimo,
  mais = 0,
  onMais,
  naLista,
  onLista,
}: {
  o: Oferta;
  rotulo?: string;
  origem?: "lista" | "repor";
  ultimo?: number | null;
  mais?: number;
  onMais?: () => void;
  naLista?: boolean;
  onLista?: () => void;
}) {
  const off = desconto(o);
  const p = prazo(o);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_2px_10px_var(--shadow)]">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-[14px] font-extrabold text-white"
        style={{ background: corMercado(o.mercado) }}
      >
        <span className="truncate">{nomeMercado(o.mercado)}</span>
        {off > 0 && <span className="rounded-md bg-white px-1.5 py-0.5 text-[12px] text-[#0F6B3E]">-{off}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="relative">
          <Foto o={o} className="h-24 w-full rounded-xl" />
          <Estrela o={o} />
          <Polegar o={o} />
        </div>
        {rotulo && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-brand">
            <span>{rotulo}</span>
            {origem && (
              <span className="shrink-0 rounded bg-brand-soft px-1.5 py-px text-[10px]">
                {origem === "repor" ? "Repor" : "Lista"}
              </span>
            )}
          </div>
        )}
        <div className="line-clamp-2 text-[14px] font-bold leading-snug">{nomeCompleto(o)}</div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1 tabular-nums">
          <span className="text-[21px] font-extrabold text-pos">{brl(o.preco_por)}</span>
          {off > 0 && <s className="text-[12px] text-text-2">{brl(o.preco_de!)}</s>}
        </div>
        <PorUnidade o={o} />
        {o.condicao && <div className="text-[11px] font-semibold text-warn">{o.condicao}</div>}
        {ultimo != null && <div className="text-[11px] text-text-2">Última compra: {brl(ultimo)}</div>}
        <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2 text-[12px]">
          <span className={p?.urgente ? "font-bold text-warn" : "text-text-2"}>{p?.texto ?? "Preço de hoje"}</span>
          {/* Alvo grande: a pessoa esta com a mao ocupada no mercado */}
          <div className="flex gap-2">
            {mais > 0 && onMais && (
              <button onClick={onMais} className="h-10 flex-1 rounded-xl bg-brand-soft text-[13px] font-bold text-brand">
                Comparar +{mais}
              </button>
            )}
            {onLista &&
              (naLista ? (
                <span className="grid h-10 flex-1 place-items-center rounded-xl bg-pos-soft text-[13px] font-bold text-pos">
                  ✓ Na lista
                </span>
              ) : (
                <button
                  onClick={onLista}
                  aria-label={`Pôr ${o.produto} na lista`}
                  className="h-10 flex-1 rounded-xl border-2 border-brand text-[13px] font-bold text-brand"
                >
                  + Lista
                </button>
              ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// Encarte inteiro, por categoria, como no prototipo. Fechado por padrao: sao milhares
// de ofertas, e quem abre uma categoria ve a mais barata primeiro.
function TodasOfertas({
  ofertas,
  naLista,
  onLista,
}: {
  ofertas: Oferta[];
  naLista: (nome: string) => boolean;
  onLista: (o: Oferta) => void;
}) {
  const [mercado, setMercado] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState<Record<string, number>>({});
  const { aberto, alternar } = useRecolhidos("ofertas_abertas", "fechado");
  const mercados = useMemo(() => [...new Set(ofertas.map((o) => o.mercado))], [ofertas]);
  const grupos = useMemo(() => {
    const g: Record<string, Oferta[]> = {};
    for (const o of ofertas) if (!mercado || o.mercado === mercado) (g[o.categoria] ??= []).push(o);
    for (const k in g) g[k].sort((a, b) => desconto(b) - desconto(a) || maisBarato(a, b));
    return Object.entries(g).sort((a, b) => corredor(a[0]) - corredor(b[0]));
  }, [ofertas, mercado]);
  const n = grupos.reduce((t, [, os]) => t + os.length, 0);

  return (
    <section className="flex flex-col gap-3">
      <Titulo>Todas as ofertas dos encartes</Titulo>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[null, ...mercados].map((m) => (
          <button
            key={m ?? "todos"}
            onClick={() => setMercado(m)}
            className={`h-10 shrink-0 rounded-full border-2 px-3.5 text-[13px] font-bold ${
              mercado === m ? "border-transparent text-white" : "border-border bg-card text-text-2"
            }`}
            style={mercado === m ? { background: m ? corMercado(m) : "var(--brand)" } : undefined}
          >
            {m ? nomeMercado(m) : "Todos"}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-[13px] text-text-2">
        {n} ofertas{mercado ? ` no ${nomeMercado(mercado)}` : ""}. Toque numa categoria para abrir.
      </p>
      {grupos.map(([cat, os]) => {
        const limite = mostrar[cat] ?? 12;
        const maior = Math.max(0, ...os.map(desconto));
        return (
          <Grupo
            key={cat}
            titulo={cat}
            icone={ICONE[cat] ?? "🛒"}
            info={`${os.length} ofertas`}
            destaque={maior >= 15 ? `até -${maior}%` : undefined}
            aberto={aberto(cat)}
            onAlternar={() => alternar(cat)}
          >
            <Grade>
              {os.slice(0, limite).map((o) => (
                <CardOferta key={o.id} o={o} naLista={naLista(o.produto)} onLista={() => onLista(o)} />
              ))}
            </Grade>
            {os.length > limite && (
              <button
                onClick={() => setMostrar((s) => ({ ...s, [cat]: limite + 24 }))}
                className="h-12 rounded-2xl bg-card-2 text-[14px] font-bold"
              >
                Ver mais {Math.min(24, os.length - limite)} de {os.length - limite}
              </button>
            )}
          </Grupo>
        );
      })}
    </section>
  );
}
