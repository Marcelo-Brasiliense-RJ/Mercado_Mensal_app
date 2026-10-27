"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { Selo } from "@/components/ofertas/pecas";
import { ICONE } from "@/lib/categorias";
import { corMercado, nomeCompleto, nomeMercado } from "@/lib/ofertas";
import {
  agrupar,
  deCostume,
  emOutroMercado,
  nomeMes,
  porCategoria,
  ritmo,
  somarMes,
  type MesEconomia,
} from "@/lib/economia";
import { BudgetModal } from "./BudgetModal";
import { ComprasDoMes } from "./ComprasDoMes";

// Economia: o fechamento do mes, em frases curtas. A compra da casa e mensal, entao a
// tela e um mes por vez (setas para voltar), e cada bloco responde uma pergunta so:
// 1. quanto gastei e se passei do combinado, 2. dava para pagar menos em outro mercado?,
// 3. paguei mais ou menos que de costume?, 4. onde foi o dinheiro, 5. e nos outros meses?
const card = "rounded-[20px] border border-border bg-card p-4 shadow-[0_2px_12px_var(--shadow)] lg:p-5";
const rotulo = "text-[12px] font-bold uppercase tracking-[0.06em] text-text-3";

type Estado = { fase: "carregando" } | { fase: "desligado" } | { fase: "erro" } | { fase: "ok"; d: MesEconomia };

async function buscarMes(m: string | null): Promise<Estado> {
  const { data, error } = await createClient().rpc("mercado_economia_mes_web", { p_mes: m });
  if (error) return { fase: error.code === "PGRST202" ? "desligado" : "erro" };
  const r = data as (MesEconomia & { ok: boolean }) | null;
  return r?.ok ? { fase: "ok", d: r } : { fase: "erro" };
}

export function EconomiaView() {
  const ofertas = useListaOfertas();
  const [mes, setMes] = useState<string | null>(null); // null = mes corrente
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);

  const carregar = useCallback(async (m: string | null) => setEstado(await buscarMes(m)), []);

  // setState no .then: chamada sincrona no corpo do effect dispara render em cascata.
  useEffect(() => {
    let vivo = true;
    buscarMes(mes).then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, [mes]);

  const d = estado.fase === "ok" ? estado.d : null;
  const contas = useMemo(() => {
    if (!d) return null;
    const itens = agrupar(d.compras);
    return {
      itens,
      categorias: porCategoria(itens, ofertas),
      outro: emOutroMercado(itens, ofertas),
      costume: deCostume(itens, d.historico),
    };
  }, [d, ofertas]);

  if (estado.fase === "carregando") {
    return (
      <>
        <ScreenHeader title="Economia" subtitle="do mês" />
        <div className="grid min-h-[40vh] place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-brand" />
        </div>
      </>
    );
  }
  if (!d || !contas) {
    return (
      <>
        <ScreenHeader title="Economia" subtitle="do mês" />
        <p className="pt-12 text-center text-[15px] leading-relaxed text-text-2">
          {estado.fase === "desligado"
            ? "A Economia nova ainda não foi ligada (falta rodar a migration 0040)."
            : "Não deu para carregar. Confira a internet e abra de novo."}
        </p>
      </>
    );
  }

  const anterior = d.meses[d.meses.length - 2];
  const podeVoltar = !!d.primeiro_mes && d.mes > d.primeiro_mes;
  const vazio = d.compras.length === 0;

  return (
    <>
      <ScreenHeader title="Economia" subtitle={`de ${nomeMes(d.mes)}`} />

      <div className="flex flex-col gap-4 pb-10">
        {/* Mes: um de cada vez, como a compra da casa */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-1.5">
          <button
            onClick={() => setMes(somarMes(d.mes, -1))}
            disabled={!podeVoltar}
            aria-label="Mês anterior"
            className="grid h-12 w-12 place-items-center rounded-xl text-[24px] font-bold disabled:opacity-25"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-[18px] font-extrabold">
              {nomeMes(d.mes).charAt(0).toUpperCase() + nomeMes(d.mes).slice(1)} de {d.mes.slice(0, 4)}
            </div>
            {d.atual && <div className="text-[12px] font-bold text-brand">este mês</div>}
          </div>
          <button
            onClick={() => setMes(d.atual ? null : somarMes(d.mes, 1))}
            disabled={d.atual}
            aria-label="Próximo mês"
            className="grid h-12 w-12 place-items-center rounded-xl text-[24px] font-bold disabled:opacity-25"
          >
            ›
          </button>
        </div>

        <Resumo d={d} anterior={anterior} itens={contas.itens.length} onOrcamento={() => setOrcamentoAberto(true)} />

        {vazio ? (
          <p className="px-4 py-6 text-center text-[15px] leading-relaxed text-text-2">
            Nenhuma compra registrada em {nomeMes(d.mes)}. Quando você fechar uma compra na aba Lista, ela aparece aqui.
          </p>
        ) : (
          <>
            {ofertas.length > 0 && <OutroMercado outro={contas.outro} />}
            <DeCostume costume={contas.costume} />
            <OndeFoi categorias={contas.categorias} gasto={d.gasto} />
          </>
        )}

        <MesAMes meses={d.meses} atual={d.mes} onEscolher={(m) => setMes(m)} />

        <ComprasDoMes
          compras={d.compras}
          podeIncluir={d.atual}
          titulo={`Compras de ${nomeMes(d.mes)}`}
          recarregar={() => carregar(mes)}
        />
      </div>

      {orcamentoAberto && (
        <BudgetModal
          open
          onClose={() => {
            setOrcamentoAberto(false);
            carregar(mes);
          }}
        />
      )}
    </>
  );
}

// 1. Quanto gastei, e se passei do combinado. Frase pronta, sem conta para fazer.
function Resumo({
  d,
  anterior,
  itens,
  onOrcamento,
}: {
  d: MesEconomia;
  anterior?: { mes: string; gasto: number };
  itens: number;
  onOrcamento: () => void;
}) {
  const orc = d.orcamento ? Number(d.orcamento) : null;
  const pct = orc ? Math.min(100, (d.gasto / orc) * 100) : 0;
  const passou = orc != null && d.gasto > orc;
  const r = d.atual ? ritmo(d.gasto, orc) : null;
  const dif = anterior && anterior.gasto > 0 ? d.gasto - anterior.gasto : null;

  return (
    <div className={card}>
      <div className={rotulo}>{d.atual ? "Você já gastou" : "Você gastou"}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{brl(d.gasto)}</span>
        {itens > 0 && <span className="text-[14px] text-text-2">em {itens} produtos</span>}
      </div>

      {orc ? (
        <>
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-card-2">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: passou ? "var(--neg)" : pct > 85 ? "var(--warn)" : "var(--pos)" }} />
          </div>
          <div className={`mt-2.5 text-[16px] font-extrabold ${passou ? "text-neg" : "text-pos"}`}>
            {passou
              ? `🔴 Passou ${brl(d.gasto - orc)} do orçamento`
              : `✅ ${d.atual ? "Ainda sobram" : "Sobraram"} ${brl(orc - d.gasto)}`}
          </div>
          <div className="mt-0.5 text-[13px] text-text-2">
            Orçamento do mês: {brl(orc)}
            {r && !passou && r.sobra > 0 && ` · dá para gastar ${brl(r.porSemana)} por semana até o fim do mês`}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[14px] text-text-2">Sem orçamento. Diga quanto quer gastar por mês e eu aviso se passar.</p>
      )}

      {dif != null && Math.abs(dif) >= 1 && (
        <div className="mt-3 rounded-xl bg-card-2 px-3 py-2 text-[13px] font-bold">
          {dif < 0 ? "👍" : "👀"} {brl(Math.abs(dif))} {dif < 0 ? "a menos" : "a mais"} que em {nomeMes(anterior!.mes)}
        </div>
      )}

      {d.atual && (
        <button onClick={onOrcamento} className="mt-3 h-11 text-[14px] font-bold text-brand">
          {orc ? "Mudar orçamento" : "Definir orçamento"}
        </button>
      )}
    </div>
  );
}

// 2. Dava para pagar menos? Compara o que foi pago com as ofertas desta semana.
function OutroMercado({ outro }: { outro: ReturnType<typeof emOutroMercado> }) {
  const [aberto, setAberto] = useState<string | null>(null);
  if (!outro.achados.length) {
    return (
      <div className={`${card} border-pos/40`}>
        <div className="text-[16px] font-extrabold text-pos">👏 Você pagou bem</div>
        <div className="mt-1 text-[14px] text-text-2">Nada do que você comprou está mais barato nas ofertas desta semana.</div>
      </div>
    );
  }
  return (
    <div className={card}>
      <div className={rotulo}>💡 Dava para pagar menos</div>
      <div className="mt-1 text-[32px] font-extrabold leading-none text-brand tabular-nums">{brl(outro.total)}</div>
      <div className="mt-1.5 text-[13px] text-text-2">
        se {outro.achados.length} {outro.achados.length > 1 ? "produtos fossem comprados" : "produto fosse comprado"} onde
        está em oferta esta semana. Toque no mercado para ver.
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {outro.mercados.map((m) => (
          <div key={m.mercado} className="overflow-hidden rounded-2xl border border-border">
            <button
              onClick={() => setAberto(aberto === m.mercado ? null : m.mercado)}
              aria-expanded={aberto === m.mercado}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <Selo mercado={m.mercado} />
              <span className="flex-1 text-[13px] text-text-2">
                {m.itens} {m.itens > 1 ? "produtos" : "produto"}
              </span>
              <span className="text-[16px] font-extrabold text-pos tabular-nums">-{brl(m.economia)}</span>
              <span className={`text-[18px] text-text-3 ${aberto === m.mercado ? "rotate-180" : ""}`} aria-hidden>⌄</span>
            </button>
            {aberto === m.mercado && (
              <div className="divide-y divide-border border-t border-border" style={{ borderTopColor: corMercado(m.mercado) }}>
                {outro.achados
                  .filter((a) => a.oferta.mercado === m.mercado)
                  .map((a) => (
                    <div key={a.item.nome} className="px-3 py-2">
                      <div className="text-[14px] font-bold capitalize">{a.item.nome}</div>
                      <div className="text-[12px] text-text-2">
                        Você pagou {brl(a.item.preco)} · no {nomeMercado(m.mercado)}: {brl(a.oferta.preco_por)} (
                        {nomeCompleto(a.oferta)})
                      </div>
                      <div className="text-[12px] font-extrabold text-pos">{brl(a.economia)} a menos</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. Paguei mais ou menos que de costume? (media dos 6 meses anteriores)
function DeCostume({ costume }: { costume: ReturnType<typeof deCostume> }) {
  const [ver, setVer] = useState<"abaixo" | "acima" | null>(null);
  if (!costume.abaixo.length && !costume.acima.length) return null;
  const lista = ver === "abaixo" ? costume.abaixo : ver === "acima" ? costume.acima : [];
  return (
    <div className={card}>
      <div className={rotulo}>Comparado com o que você costuma pagar</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setVer(ver === "abaixo" ? null : "abaixo")}
          className={`rounded-2xl p-3 text-left ${ver === "abaixo" ? "ring-2 ring-pos" : ""} bg-pos-soft`}
        >
          <div className="text-[12px] font-bold text-pos">Economizou</div>
          <div className="text-[22px] font-extrabold text-pos tabular-nums">{brl(costume.economizou)}</div>
          <div className="text-[12px] text-text-2">{costume.abaixo.length} mais baratos</div>
        </button>
        <button
          onClick={() => setVer(ver === "acima" ? null : "acima")}
          className={`rounded-2xl p-3 text-left ${ver === "acima" ? "ring-2 ring-neg" : ""} bg-neg-soft`}
        >
          <div className="text-[12px] font-bold text-neg">Pagou a mais</div>
          <div className="text-[22px] font-extrabold text-neg tabular-nums">{brl(costume.pagouAMais)}</div>
          <div className="text-[12px] text-text-2">{costume.acima.length} mais caros</div>
        </button>
      </div>
      {lista.length > 0 && (
        <div className="mt-3 divide-y divide-border">
          {lista.map((l) => (
            <div key={l.item.nome} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold capitalize">{l.item.nome}</div>
                <div className="text-[12px] text-text-2">
                  pagou {brl(l.item.preco)} · costuma {brl(l.media)}
                </div>
              </div>
              <span className={`shrink-0 text-[14px] font-extrabold ${l.diferenca > 0 ? "text-pos" : "text-neg"}`}>
                {l.diferenca > 0 ? "-" : "+"}
                {brl(Math.abs(l.diferenca))}
              </span>
            </div>
          ))}
        </div>
      )}
      {!ver && <div className="mt-2 text-[12px] text-text-3">Toque num dos dois para ver os produtos.</div>}
    </div>
  );
}

// 4. Onde foi o dinheiro: categorias com barra e porcentagem; toque abre os produtos.
function OndeFoi({ categorias, gasto }: { categorias: ReturnType<typeof porCategoria>; gasto: number }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const maior = categorias[0]?.total || 1;
  return (
    <div className={card}>
      <div className={rotulo}>Onde foi o dinheiro</div>
      <div className="mt-3 flex flex-col gap-1">
        {categorias.map((c) => (
          <div key={c.categoria}>
            <button
              onClick={() => setAberto(aberto === c.categoria ? null : c.categoria)}
              aria-expanded={aberto === c.categoria}
              className="flex w-full items-center gap-2.5 rounded-xl py-1.5 text-left"
            >
              <span className="w-7 text-center text-[20px]" aria-hidden>{ICONE[c.categoria] ?? "🛒"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-bold">{c.categoria}</span>
                  <span className="shrink-0 text-[14px] font-extrabold tabular-nums">{brl(c.total)}</span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-card-2">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.total / maior) * 100}%` }} />
                  </span>
                  <span className="w-9 text-right text-[11px] font-bold text-text-2">
                    {gasto > 0 ? Math.round((c.total / gasto) * 100) : 0}%
                  </span>
                </span>
              </span>
            </button>
            {aberto === c.categoria && (
              <div className="mb-2 ml-9 divide-y divide-border rounded-xl bg-card-2 px-3">
                {c.itens.map((i) => (
                  <div key={i.nome} className="flex justify-between gap-3 py-1.5 text-[13px]">
                    <span className="truncate capitalize">
                      {i.nome} <span className="text-text-3">· {Number(i.qty.toFixed(2)).toLocaleString("pt-BR")} {i.unit}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{brl(i.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 5. Mes a mes: uma linha por mes; tocar abre aquele mes.
function MesAMes({
  meses,
  atual,
  onEscolher,
}: {
  meses: MesEconomia["meses"];
  atual: string;
  onEscolher: (mes: string) => void;
}) {
  const maior = Math.max(1, ...meses.map((m) => Number(m.gasto)), ...meses.map((m) => Number(m.orcamento ?? 0)));
  if (!meses.some((m) => m.gasto > 0)) return null;
  return (
    <div className={card}>
      <div className={rotulo}>Mês a mês</div>
      <div className="mt-3 flex flex-col gap-1.5">
        {meses.map((m) => {
          const passou = m.orcamento != null && m.gasto > Number(m.orcamento);
          return (
            <button
              key={m.mes}
              onClick={() => onEscolher(m.mes)}
              className={`flex items-center gap-3 rounded-xl px-2 py-1.5 text-left ${m.mes === atual ? "bg-brand-soft" : ""}`}
            >
              <span className="w-10 text-[13px] font-bold capitalize">{nomeMes(m.mes).slice(0, 3)}</span>
              <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-card-2">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(Number(m.gasto) / maior) * 100}%`, background: m.orcamento == null ? "var(--brand)" : passou ? "var(--neg)" : "var(--pos)" }}
                />
                {m.orcamento != null && (
                  <span
                    className="absolute top-0 h-full w-[2px] bg-text"
                    style={{ left: `${(Number(m.orcamento) / maior) * 100}%` }}
                    title={`Orçamento ${brl(Number(m.orcamento))}`}
                  />
                )}
              </span>
              <span className="w-[88px] text-right text-[13px] font-extrabold tabular-nums">
                {m.gasto > 0 ? brl(Number(m.gasto)) : "—"}
              </span>
              <span className="w-5 text-center text-[13px]" aria-hidden>
                {m.gasto > 0 && m.orcamento != null ? (passou ? "🔴" : "✅") : ""}
              </span>
            </button>
          );
        })}
      </div>
      {meses.some((m) => m.orcamento != null) && (
        <div className="mt-2 text-[12px] text-text-3">Verde: dentro do orçamento. Vermelho: passou. O tracinho é o orçamento.</div>
      )}
    </div>
  );
}
