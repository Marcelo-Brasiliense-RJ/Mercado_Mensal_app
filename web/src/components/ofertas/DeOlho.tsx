"use client";

import { useEffect, useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon } from "@/components/ui/icons";
import {
  desconto,
  nomeMercado,
  padrao,
  porUnidade,
  veredito,
  casaBusca,
  maisBarato,
  nomeBonito,
  nomeCompleto,
  ofertasDo,
  prazo,
  termoDe,
  type Desejo,
  type Oferta,
} from "@/lib/ofertas";
import { desligarPush, estadoPush, ligarPush, type EstadoPush } from "@/lib/push";
import { Foto, PorUnidade, Selo } from "./pecas";
import { removerDesejo, salvarDesejo, useDesejos } from "./useDesejos";

// Lista "De olho": produtos que a pessoa so compra em promocao. Cada um mostra na hora
// se esta em oferta, onde e ate quando; e o celular avisa quando entrar uma nova.
export function DeOlho({
  ofertas,
  onComparar,
}: {
  ofertas: Oferta[];
  onComparar: (titulo: string, opcoes: Oferta[]) => void;
}) {
  const desejos = useDesejos();
  const [vigiar, setVigiar] = useState(false);
  const pronto = !!desejos;
  // Tocar no aviso do celular abre /app/ofertas#de-olho: rola ate aqui quando carregar.
  useEffect(() => {
    if (pronto && location.hash === "#de-olho") document.getElementById("de-olho")?.scrollIntoView();
  }, [pronto]);
  if (!desejos) return null; // carregando, ou 0039 ainda nao aplicada

  const linhas = desejos
    .map((d) => ({ d, opcoes: ofertasDo(d, ofertas) }))
    .sort((a, b) => Number(!a.opcoes.length) - Number(!b.opcoes.length)); // em promocao primeiro
  const emPromo = linhas.filter((x) => x.opcoes.length).length;

  return (
    <section id="de-olho" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">
          ⭐ De olho
          {desejos.length > 0 && (
            <span className="ml-2 text-[14px] font-bold text-text-2">
              {emPromo ? `${emPromo} em promoção` : "nada em promoção agora"}
            </span>
          )}
        </h2>
        {desejos.length > 0 && (
          <button
            onClick={() => setVigiar(true)}
            className="h-10 shrink-0 rounded-xl border-2 border-brand px-3 text-[13px] font-bold text-brand"
          >
            + Produto
          </button>
        )}
      </div>

      {desejos.length === 0 ? (
        <button
          onClick={() => setVigiar(true)}
          className="flex flex-col items-center gap-1 rounded-[18px] border-2 border-dashed border-border bg-card px-5 py-5 text-center"
        >
          <span className="text-[16px] font-extrabold">Quer algo só quando estiver em promoção?</span>
          <span className="text-[13px] text-text-2">
            Toque aqui ou na ⭐ de uma oferta. Mostro onde está e até quando, e aviso no celular.
          </span>
          <span className="mt-2 rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-white">⭐ Ficar de olho</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {linhas.map(({ d, opcoes }) => (
            <LinhaDesejo key={d.id} d={d} opcoes={opcoes} onComparar={() => onComparar(d.nome, opcoes)} />
          ))}
        </div>
      )}

      {desejos.length > 0 && <AvisoCelular />}

      {/* Monta so aberto: o campo comeca vazio toda vez */}
      {vigiar && <VigiarModal open onClose={() => setVigiar(false)} ofertas={ofertas} />}
    </section>
  );
}

// Quanto a casa pagou da ultima vez por esse produto (estoque guarda o ultimo preco).
function ultimoPago(d: Desejo, stock: { name: string; priceLast: number | null }[]): number | null {
  const t = padrao(d.termo).replace(/[^a-z0-9 ]/g, " ").trim();
  const primeira = t.split(/\s+/)[0];
  const s =
    stock.find((x) => padrao(x.name) === t) ?? stock.find((x) => padrao(x.name).split(/\s+/)[0] === primeira);
  return s?.priceLast ?? null;
}

const dia = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";

const TOM = {
  bom: "bg-pos-soft text-pos",
  normal: "bg-card-2 text-text-2",
  caro: "bg-neg-soft text-neg",
} as const;
const ICONE_TOM = { bom: "🟢", normal: "🟡", caro: "🔴" } as const;

function LinhaDesejo({ d, opcoes, onComparar }: { d: Desejo; opcoes: Oferta[]; onComparar: () => void }) {
  const { showToast, stock } = useStore();
  const o = opcoes[0];
  const p = o && prazo(o);
  const off = o ? desconto(o) : 0;
  const pago = ultimoPago(d, stock);
  const v = veredito(o, d, pago);
  // Outros mercados com o mesmo produto: o mais barato de cada um, depois do primeiro.
  const outros = [...new Map(opcoes.slice(1).filter((x) => x.mercado !== o?.mercado).map((x) => [x.mercado, x])).values()];
  const menor = d.menor_preco != null ? Number(d.menor_preco) : null;

  return (
    <div className={`rounded-2xl border bg-card p-3 ${o ? "border-pos/40" : "border-border"}`}>
      <div className="flex gap-3">
        <Foto o={o} src={d.tem_foto ? `/api/oferta-foto?desejo=${d.id}` : undefined} className="h-16 w-16 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] font-extrabold leading-tight">{d.nome}</div>
          {v ? (
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${TOM[v.tom]}`}>
              {ICONE_TOM[v.tom]} {v.texto}
            </span>
          ) : (
            <span className="mt-1 inline-block rounded-full bg-card-2 px-2.5 py-0.5 text-[12px] font-bold text-text-2">
              Sem promoção agora · aviso quando entrar
            </span>
          )}
        </div>
        <button
          onClick={async () => {
            if (await removerDesejo(d.id)) showToast(`${d.nome} saiu do De olho`);
            else showToast("Não deu para tirar. Tente de novo.");
          }}
          aria-label={`Parar de vigiar ${d.nome}`}
          className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[20px] text-text-3 active:bg-card-2"
        >
          ×
        </button>
      </div>

      {o && (
        <button onClick={onComparar} className="mt-2.5 block w-full rounded-xl bg-card-2 px-3 py-2.5 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Selo mercado={o.mercado} />
            <span className="text-[22px] font-extrabold leading-none text-pos tabular-nums">{brl(o.preco_por)}</span>
            {off > 0 && (
              <>
                <s className="text-[13px] text-text-3">{brl(o.preco_de!)}</s>
                <span className="rounded bg-pos px-1.5 py-px text-[11px] font-extrabold text-white">-{off}%</span>
              </>
            )}
            <PorUnidade o={o} />
          </div>
          <div className={`mt-1 text-[13px] ${p?.urgente ? "font-bold text-warn" : "text-text-2"}`}>
            {p?.texto ?? "Preço de hoje"}
            {o.condicao ? ` · ${o.condicao}` : ""}
          </div>
          {outros.length > 0 && (
            <div className="mt-1 text-[12px] text-text-2">
              {/* Com o preco por kg/L: pacote menor parece mais barato sem ser. */}
              Também:{" "}
              {outros
                .slice(0, 3)
                .map((x) => {
                  const u = porUnidade(x);
                  return `${nomeMercado(x.mercado)} ${brl(x.preco_por)}${u ? ` (${brl(u.valor)}/${u.u})` : ""}`;
                })
                .join(" · ")}
              <span className="font-bold text-brand"> · comparar</span>
            </div>
          )}
        </button>
      )}

      {/* O que ajuda a decidir: quanto pagou, a menor ja vista e a ultima promocao. */}
      {(pago != null || menor != null || (!o && d.ultimo_preco != null)) && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
          {pago != null && (
            <div className="rounded-xl border border-border px-2.5 py-1.5">
              <div className="text-text-3">Você pagou</div>
              <div className="text-[14px] font-extrabold tabular-nums">{brl(pago)}</div>
            </div>
          )}
          {menor != null && (
            <div className="rounded-xl border border-border px-2.5 py-1.5">
              <div className="text-text-3">Menor já visto</div>
              <div className="text-[14px] font-extrabold tabular-nums">
                {brl(menor)}
                <span className="ml-1 text-[11px] font-bold text-text-2">
                  {d.menor_mercado ? nomeMercado(d.menor_mercado) : ""} {dia(d.menor_em)}
                </span>
              </div>
            </div>
          )}
          {!o && d.ultimo_preco != null && (
            <div className="col-span-2 rounded-xl border border-border px-2.5 py-1.5">
              <div className="text-text-3">Última promoção</div>
              <div className="text-[14px] font-extrabold tabular-nums">
                {brl(Number(d.ultimo_preco))}
                <span className="ml-1 text-[11px] font-bold text-text-2">
                  {d.ultimo_mercado ? `no ${nomeMercado(d.ultimo_mercado)}` : ""}
                  {d.ultimo_fim ? ` · até ${dia(d.ultimo_fim)}` : d.ultimo_visto ? ` · vista em ${dia(d.ultimo_visto)}` : ""}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Escolher o que vigiar: digita "acem" e aparecem as ofertas com foto e o nome do encarte.
// Tocar numa delas guarda com foto e nome bonitos; a primeira opcao vigia qualquer "acem".
function VigiarModal({ open, onClose, ofertas }: { open: boolean; onClose: () => void; ofertas: Oferta[] }) {
  const { showToast } = useStore();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const t = texto.trim();
  const sugestoes = useMemo(() => {
    if (t.length < 2) return [];
    const vistos = new Set<string>();
    return ofertas
      .filter((o) => casaBusca(o, t))
      .sort(maisBarato)
      .filter((o) => {
        const k = termoDe(o);
        if (!k || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 8);
  }, [ofertas, t]);
  // A opcao "qualquer": as ofertas que ela pegaria agora, com a foto da mais barata.
  const qualquer = useMemo(() => (t.length >= 2 ? ofertasDo({ id: 0, termo: t, nome: t, tem_foto: false }, ofertas) : []), [ofertas, t]);
  const melhor = qualquer[0];

  async function guardar(termo: string, nome: string, oferta?: Oferta) {
    setBusy(true);
    const d = await salvarDesejo(termo, nome, oferta?.id);
    setBusy(false);
    if (!d) return showToast("Não deu para guardar. Tente de novo.");
    showToast(`⭐ De olho em ${d.nome}`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}>
      <div className="flex flex-col gap-3">
        <div className="pr-10">
          <div className="text-[22px] font-extrabold">Ficar de olho</div>
          <div className="text-[13px] text-text-2">Aviso quando entrar em promoção.</div>
        </div>
        <label className="relative block">
          <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && t.length >= 2 && !busy && guardar(t, nomeBonito(t, ofertas), melhor)}
            placeholder="Ex.: acém, azeite, fralda"
            className="h-14 w-full rounded-2xl border-2 border-border bg-card pl-12 pr-4 text-[17px] outline-none focus:border-brand"
            autoComplete="off"
            enterKeyHint="done"
          />
        </label>

        {t.length >= 2 && (
          <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
            <button
              disabled={busy}
              onClick={() => guardar(t, nomeBonito(t, ofertas), melhor)}
              className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-brand-soft p-2.5 text-left disabled:opacity-50"
            >
              <Foto o={melhor} className="h-12 w-12 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold">⭐ Qualquer “{nomeBonito(t, ofertas)}”</div>
                <div className="text-[12px] text-text-2">
                  {qualquer.length
                    ? `${qualquer.length} em oferta agora · a partir de ${brl(melhor.preco_por)}`
                    : "Sem oferta agora: aviso quando entrar"}
                </div>
              </div>
            </button>
            {sugestoes.length > 0 && (
              <div className="pt-1 text-[12px] font-bold uppercase tracking-[0.06em] text-text-2">Ou um produto certo</div>
            )}
            {sugestoes.map((o) => {
              const p = prazo(o);
              return (
                <button
                  key={o.id}
                  disabled={busy}
                  onClick={() => guardar(termoDe(o), o.produto, o)}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left disabled:opacity-50"
                >
                  <Foto o={o} className="h-12 w-12 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[14px] font-bold leading-tight">{nomeCompleto(o)}</div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-text-2">
                      <Selo mercado={o.mercado} />
                      <span className="font-extrabold text-pos tabular-nums">{brl(o.preco_por)}</span>
                      <span className="truncate">{p?.texto ?? "Preço de hoje"}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[22px]" aria-hidden>☆</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Ligar o aviso nativo do celular. No iPhone so funciona com o app na Tela de Inicio,
// entao fora dela a caixa ensina o caminho em vez de mostrar um botao que nao faz nada.
function AvisoCelular() {
  const { showToast } = useStore();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    estadoPush().then(setEstado, () => setEstado("sem-suporte"));
  }, []);
  if (!estado || estado === "sem-suporte") return null;

  if (estado === "ligado") {
    return (
      <div className="flex items-center justify-between gap-3 px-1 text-[13px] text-text-2">
        <span>🔔 Aviso ligado neste celular</span>
        <button
          onClick={async () => {
            await desligarPush();
            setEstado("desligado");
            showToast("Avisos desligados neste celular");
          }}
          className="h-10 px-2 font-bold text-text-2 underline"
        >
          Desligar
        </button>
      </div>
    );
  }
  if (estado === "instalar") {
    return (
      <div className="rounded-2xl bg-card-2 px-4 py-3 text-[13px] leading-snug">
        <div className="text-[14px] font-extrabold">🔔 Quer o aviso no iPhone?</div>
        Toque em <b>Compartilhar</b> (quadrado com seta ⬆️) → <b>Adicionar à Tela de Início</b>. Abra o app pelo ícone
        novo e ligue o aviso aqui.
      </div>
    );
  }
  if (estado === "negado") {
    return (
      <div className="rounded-2xl bg-card-2 px-4 py-3 text-[13px] leading-snug">
        🔕 Avisos bloqueados. Para ligar: <b>Ajustes</b> → <b>Notificações</b> → <b>Despensa</b> → Permitir.
      </div>
    );
  }
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await ligarPush();
        setBusy(false);
        if (!r.ok) return showToast(r.erro);
        setEstado("ligado");
        showToast("🔔 Pronto! Aviso quando entrar em promoção");
      }}
      className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-extrabold text-white disabled:opacity-60"
    >
      {busy ? "Ligando…" : "🔔 Avisar no celular quando entrar em promoção"}
    </button>
  );
}

// Estrela do card: acende quando a oferta ja esta De olho; tocar marca ou desmarca.
export function Estrela({ o }: { o: Oferta }) {
  const desejos = useDesejos();
  const { showToast } = useStore();
  const [busy, setBusy] = useState(false);
  if (!desejos) return null;
  const marcados = desejos.filter((d) => ofertasDo(d, [o]).length);
  const ligado = marcados.length > 0;
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        if (ligado) {
          for (const d of marcados) await removerDesejo(d.id);
          showToast(`${marcados.map((d) => d.nome).join(", ")} saiu do De olho`);
        } else {
          const d = await salvarDesejo(termoDe(o), o.produto, o.id);
          showToast(d ? `⭐ De olho em ${d.nome}: aviso nas próximas promoções` : "Não deu para guardar.");
        }
        setBusy(false);
      }}
      aria-label={ligado ? `Parar de vigiar ${o.produto}` : `Ficar de olho em ${o.produto}`}
      aria-pressed={ligado}
      className={`absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full text-[22px] leading-none shadow-[0_1px_4px_var(--shadow)] ${
        ligado ? "bg-[#FFF4CC] text-[#D99A00]" : "bg-card/90 text-text-3"
      }`}
    >
      {ligado ? "★" : "☆"}
    </button>
  );
}

