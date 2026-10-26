"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { brl } from "@/lib/format";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon, TagIcon } from "@/components/ui/icons";
import {
  casaBusca,
  corMercado,
  desconto,
  maisBarato,
  nomeCompleto,
  nomeMercado,
  porUnidade,
  prazo,
  resumir,
  type ItemFalta,
  type Oferta,
} from "@/lib/ofertas";

type Dados = { ofertas: Oferta[]; lista: ItemFalta[]; atualizado_em: string | null };
type Estado = { fase: "carregando" } | { fase: "desligado" } | { fase: "erro" } | { fase: "ok"; dados: Dados };

// Aba Ofertas. Pensada para ser entendida num relance, com as maos ocupadas:
// 1. a resposta primeiro ("va no Guanabara"), 2. o que falta em casa, mais barato,
// 3. um unico campo de busca. Nada para preencher: a lista vem de Repor + lista de compras.
export function OfertasView() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ titulo: string; opcoes: Oferta[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    createClient()
      .rpc("mercado_ofertas_web")
      .then(({ data, error }) => {
        if (!vivo) return;
        // PGRST202: migration 0038 ainda nao aplicada. Nao e erro para a pessoa.
        if (error) return setEstado({ fase: error.code === "PGRST202" ? "desligado" : "erro" });
        const d = data as (Dados & { ok: boolean }) | null;
        setEstado(d?.ok ? { fase: "ok", dados: d } : { fase: "erro" });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dados = estado.fase === "ok" ? estado.dados : null;
  const resumo = useMemo(() => (dados ? resumir(dados.ofertas, dados.lista) : null), [dados]);
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

  const melhor = resumo.mercados[0];
  const semOferta = resumo.itens.filter((x) => !x.opcoes.length);
  const comOferta = resumo.itens.filter((x) => x.opcoes.length);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Ofertas" subtitle="O que falta em casa, no mercado mais barato" />

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
              <CardOferta key={o.id} o={o} />
            ))}
          </Grade>
        </section>
      ) : (
        <>
          {/* 1. A resposta */}
          {melhor && resumo.comOferta > 0 ? (
            <section
              className="rounded-[20px] p-5 text-white shadow-[0_2px_10px_var(--shadow)]"
              style={{ background: corMercado(melhor.mercado) }}
            >
              <div className="text-[13px] font-bold uppercase tracking-[0.08em] opacity-85">Esta semana, vá no</div>
              <div className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">
                {nomeMercado(melhor.mercado)}
              </div>
              <div className="mt-3 text-[16px] font-semibold">
                Tem {melhor.itens} de {resumo.comOferta} itens que faltam em casa · {brl(melhor.total)}
              </div>
              {resumo.lojasMelhor > 1 && (
                <div className="mt-1 text-[13px] opacity-85">
                  Pegando o mais barato de cada um: {brl(resumo.melhorTotal)} em {resumo.lojasMelhor} mercados.
                </div>
              )}
            </section>
          ) : (
            <Aviso
              titulo={dados.lista.length ? "O que falta em casa não está em oferta" : "Nada faltando em casa"}
              texto="Veja abaixo os maiores descontos da semana."
            />
          )}

          {/* 2. O que falta, mais barato */}
          {comOferta.length > 0 && (
            <section className="flex flex-col gap-3">
              <Titulo>O que falta em casa, mais barato</Titulo>
              <Grade>
                {comOferta.map(({ item, opcoes }) => (
                  <CardOferta
                    key={item.nome}
                    o={opcoes[0]}
                    rotulo={item.nome}
                    origem={item.origem}
                    ultimo={item.ultimo_preco}
                    mais={opcoes.length - 1}
                    onMais={() => setAberto({ titulo: item.nome, opcoes })}
                  />
                ))}
              </Grade>
              {semOferta.length > 0 && (
                <p className="text-[13px] text-text-2">
                  Sem oferta esta semana: {semOferta.map((x) => x.item.nome).join(", ")}.
                </p>
              )}
            </section>
          )}

          {/* 3. Onde comprar */}
          {resumo.comOferta > 0 && (
            <section className="flex flex-col gap-2">
              <Titulo>Quanto sai em cada mercado</Titulo>
              {resumo.mercados.map((m) => (
                <div key={m.mercado} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <Selo mercado={m.mercado} />
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-card-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(m.itens / resumo.comOferta) * 100}%`, background: corMercado(m.mercado) }}
                    />
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[15px] font-extrabold">{m.itens ? brl(m.total) : "—"}</div>
                    <div className="text-[12px] text-text-2">
                      {m.itens}/{resumo.comOferta} itens
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* 4. Achados */}
          {resumo.achados.length > 0 && (
            <section className="flex flex-col gap-3">
              <Titulo>Maiores descontos da semana</Titulo>
              <Grade>
                {resumo.achados.map((o) => (
                  <CardOferta key={o.id} o={o} />
                ))}
              </Grade>
            </section>
          )}
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

function Selo({ mercado }: { mercado: string }) {
  return (
    <span
      className="inline-block shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
      style={{ background: corMercado(mercado) }}
    >
      {nomeMercado(mercado)}
    </span>
  );
}

const ICONE: Record<string, string> = {
  Mercearia: "🥫", Bebidas: "🥤", Carnes: "🥩", "Frios e Laticínios": "🧀", Hortifruti: "🥦", Padaria: "🍞",
  Congelados: "🧊", "Doces e Biscoitos": "🍪", Limpeza: "🧽", "Perfumaria e Higiene": "🧴", Bebê: "🍼", Pet: "🐾",
};

function Foto({ o, className = "" }: { o: Oferta; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!o.tem_foto || falhou) {
    return (
      <div className={`grid shrink-0 place-items-center bg-card-2 text-[30px] ${className}`} aria-hidden>
        {ICONE[o.categoria] ?? "🛒"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 3 KB servida pela nossa rota
    <img
      src={`/api/oferta-foto?id=${o.id}`}
      alt=""
      loading="lazy"
      onError={() => setFalhou(true)}
      className={`shrink-0 bg-white object-contain ${className}`}
    />
  );
}

function PorUnidade({ o }: { o: Oferta }) {
  const u = porUnidade(o);
  return u ? <div className="text-[11px] text-text-2">{brl(u.valor)}/{u.u}</div> : null;
}

function CardOferta({
  o,
  rotulo,
  origem,
  ultimo,
  mais = 0,
  onMais,
}: {
  o: Oferta;
  rotulo?: string;
  origem?: "lista" | "repor";
  ultimo?: number | null;
  mais?: number;
  onMais?: () => void;
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
        <Foto o={o} className="h-24 w-full rounded-xl" />
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
          {mais > 0 && onMais && (
            <button onClick={onMais} className="h-10 w-full rounded-xl bg-brand-soft text-[13px] font-bold text-brand">
              Comparar +{mais}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
