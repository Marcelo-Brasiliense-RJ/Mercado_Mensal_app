"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ShopItem, TripItem } from "@/lib/types";
import { BarcodeIcon, CameraIcon, CheckIcon, MicIcon, PlusIcon } from "@/components/ui/icons";
import { FotoItem } from "@/components/ui/FotoItem";
import { Interruptor } from "@/components/ui/Interruptor";
import { FotoModal } from "@/components/lista/FotoModal";
import { BarcodeModal } from "@/components/lista/BarcodeModal";
import { CartItemModal } from "@/components/lista/CartItemModal";
import { QualMercado } from "@/components/lista/QualMercado";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { categoriaDoItem, iconeDe, useCategorias } from "@/components/estoque/useCategorias";
import { atualizarLugar, useLugar } from "@/lib/lugar";
import { nomeMercado } from "@/lib/ofertas";
import {
  corredorAtual,
  limparTrocas,
  marcarTroca,
  mesmoNome,
  montarMercado,
  setModoMercado,
  useModoMercado,
  useTrocas,
  type GrupoMercado,
} from "@/lib/modoMercado";
import { DigitarCarrinho } from "./DigitarCarrinho";

type Vista = "categorias" | "lista";
type Filtro = "tudo" | "falta" | "carrinho";

// Modo mercado: a aba do carrinho. Tudo pensado para o corredor, com o celular numa
// mao: numeros grandes, icones, um toque por acao. A logica (o que foi pego, o que
// falta, "e o mesmo?") mora em lib/modoMercado.ts.
export function MercadoView() {
  const router = useRouter();
  const ligado = useModoMercado();
  const { trip, shopping, stock, budget, startTrip, cancelTrip, finalizeTrip, addTripItem, removeItems, showToast } =
    useStore();
  const { noMercado, mercado } = useLugar();
  const cats = useCategorias();
  const trocas = useTrocas(trip?.trip_id ?? null);

  const [vista, setVista] = useState<Vista>("categorias");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [aberta, setAberta] = useState<string | null>(null); // categoria filtrada
  const [busy, setBusy] = useState<string | null>(null);
  const [foto, setFoto] = useState(false);
  const [codigo, setCodigo] = useState(false);
  const [falar, setFalar] = useState(false);
  const [digitar, setDigitar] = useState(false);
  const [editar, setEditar] = useState<TripItem | null>(null);
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set());

  // Categoria escolhida no estoque (se o item ja existe em casa), senao o palpite pelo nome.
  const catDe = (nome: string) =>
    categoriaDoItem({ name: nome, category: stock.find((x) => mesmoNome(x.name, nome))?.category }, cats);
  const ordem = (c: string) => {
    const i = cats.findIndex((x) => x.nome === c);
    return i < 0 ? 999 : i;
  };

  const carrinho = trip?.items ?? [];
  const r = montarMercado(shopping, carrinho, catDe, trocas, ordem);
  const sugestoes = r.sugestoes.filter((s) => !dispensadas.has(s.lista.id));
  const aqui = corredorAtual(carrinho, catDe);
  const grupoAqui = aqui ? r.grupos.find((g) => g.categoria === aqui) : null;
  const total = trip?.total ?? 0;
  const pct = r.totalLista ? r.pegosLista / r.totalLista : 0;
  const sobra = budget.total > 0 ? budget.total - budget.spent - total : null;

  if (!ligado) {
    return (
      <div className="mx-auto max-w-[420px] pt-10 text-center">
        <div className="text-[54px]" aria-hidden>🛒</div>
        <h1 className="mt-2 text-[22px] font-extrabold">Modo mercado desligado</h1>
        <p className="mt-1 text-[14px] text-text-2">Ligue para ver o carrinho por categoria, o que falta e quanto está dando.</p>
        <button
          onClick={() => setModoMercado(true)}
          className="mt-5 h-12 rounded-[14px] bg-brand px-6 text-[15px] font-bold text-brand-ink"
        >
          Ligar modo mercado
        </button>
      </div>
    );
  }

  function desligar() {
    setModoMercado(false);
    router.push("/app/lista");
  }

  async function comecar() {
    void atualizarLugar(true);
    setBusy("abrir");
    const x = await startTrip();
    setBusy(null);
    showToast(x.ok ? "Compra aberta. Bora!" : x.erro);
  }

  async function peguei(i: ShopItem) {
    setBusy(i.id);
    const x = await addTripItem({ name: i.name, price: i.estimated_price ?? null, qty: i.desired_quantity, unit: i.unit });
    setBusy(null);
    showToast(x.ok ? `✅ ${i.name} no carrinho` : x.erro);
  }

  async function finalizar() {
    if (!trip) return;
    const trocados = Object.keys(trocas);
    setBusy("fim");
    const x = await finalizeTrip();
    // Os da lista trocados por outra marca saem dela: o que foi pego ja repos o estoque.
    if (x.ok && trocados.length) await removeItems(trocados);
    setBusy(null);
    if (x.ok) limparTrocas();
    showToast(x.ok ? "Compra finalizada, estoque reposto 🎉" : x.erro);
  }

  async function cancelar() {
    if (!confirm("Cancelar esta compra? Os itens do carrinho são descartados.")) return;
    setBusy("fim");
    const x = await cancelTrip();
    setBusy(null);
    if (x.ok) limparTrocas();
    showToast(x.ok ? "Compra cancelada" : x.erro);
  }

  function abrirCategoria(c: string) {
    setAberta(c);
    setVista("lista");
    setFiltro("tudo");
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const grupos = r.grupos.filter((g) => !aberta || g.categoria === aberta);
  const acao =
    "flex flex-col items-center justify-center gap-1.5 rounded-[18px] border border-border bg-card py-3 text-[13px] font-bold shadow-[0_1px_3px_var(--shadow)] active:scale-95 transition-transform";

  return (
    <div className="space-y-4">
      <QualMercado />

      {/* Topo: onde estou, quanto ja deu e quanto da lista ja esta no carrinho. */}
      <div className="overflow-hidden rounded-[24px] bg-brand px-[18px] pb-4 pt-3.5 text-brand-ink shadow-[0_6px_20px_var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[15px] font-extrabold">
            🛒 {noMercado && mercado ? `No ${nomeMercado(mercado)}` : trip ? "Comprando" : "Modo mercado"}
          </div>
          <Interruptor ligado onChange={desligar} rotulo="Desligar modo mercado" />
        </div>
        <div className="mt-1 text-[44px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{brl(total)}</div>
        <div className="mt-1 text-[13px] font-bold opacity-90">
          {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} no carrinho
          {sobra != null && (sobra >= 0 ? ` · cabem ${brl(sobra)} no orçamento` : ` · passa ${brl(-sobra)} do orçamento`)}
        </div>
        {r.totalLista > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[12px] font-bold opacity-95">
              <span>
                📝 {r.pegosLista} de {r.totalLista} da lista
              </span>
              {r.faltaValor > 0 && <span>falta ~{brl(r.faltaValor)}</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.max(pct * 100, 3)}%` }} />
            </div>
          </div>
        )}
      </div>

      {!trip && (
        <button
          onClick={comecar}
          disabled={busy === "abrir"}
          className="flex w-full items-center gap-3 rounded-[18px] border-2 border-brand bg-brand-soft px-4 py-3.5 text-left disabled:opacity-60"
        >
          <span className="text-[28px]" aria-hidden>🚀</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold text-brand">Começar a compra</span>
            <span className="block text-[13px] text-text-2">Ou só vá pegando: o carrinho abre sozinho</span>
          </span>
        </button>
      )}

      {/* As 4 formas de por no carrinho, a um toque. */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setFoto(true)} className={acao}>
          <CameraIcon size={24} />
          Foto
        </button>
        <button onClick={() => setCodigo(true)} className={acao}>
          <BarcodeIcon size={24} />
          Código
        </button>
        <button onClick={() => setFalar(true)} className={acao}>
          <MicIcon size={24} />
          Falar
        </button>
        <button onClick={() => setDigitar(true)} className={acao}>
          <PlusIcon size={24} />
          Digitar
        </button>
      </div>

      {/* Lembrete do corredor: pegou algo daqui e ainda falta coisa da lista aqui. */}
      {grupoAqui && grupoAqui.faltam.length > 0 && (
        <div className="rounded-[18px] border-2 border-warn bg-warn-soft p-3.5">
          <div className="text-[15px] font-extrabold">
            {iconeDe(cats, grupoAqui.categoria)} Você está em {grupoAqui.categoria}
          </div>
          <div className="mt-0.5 text-[13px] text-text-2">Aqui ainda falta pegar:</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {grupoAqui.faltam.map((f) => (
              <button
                key={f.id}
                onClick={() => peguei(f)}
                disabled={busy === f.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card-2 px-3 text-[13px] font-bold disabled:opacity-50"
              >
                {f.name} <span className="text-brand">+ pegar</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* "Pegou X de limpeza e na lista tem Y parecido": e o mesmo? */}
      {trip &&
        sugestoes.map((s) => (
          <div key={s.lista.id} className="rounded-[18px] border border-border bg-card p-3.5">
            <div className="flex items-center gap-3">
              <span className="text-[24px]" aria-hidden>🔄</span>
              <div className="min-w-0 flex-1 text-[14px] leading-snug">
                Você pegou <b>{s.carrinho.name}</b>. Na lista tem <b>{s.lista.name}</b>. É o mesmo?
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => marcarTroca(trip.trip_id, s.lista.id, s.carrinho.name)}
                className="h-11 flex-1 rounded-[12px] bg-brand text-[14px] font-bold text-brand-ink"
              >
                Sim, já peguei
              </button>
              <button
                onClick={() => setDispensadas((d) => new Set(d).add(s.lista.id))}
                className="h-11 flex-1 rounded-[12px] border border-border bg-card text-[14px] font-bold"
              >
                Não, falta pegar
              </button>
            </div>
          </div>
        ))}

      {/* Visual (categorias) ou listagem. */}
      <div className="flex rounded-[14px] bg-card-2 p-1" role="tablist">
        {(
          [
            ["categorias", "🧩 Categorias"],
            ["lista", "📋 Listagem"],
          ] as const
        ).map(([v, rot]) => (
          <button
            key={v}
            role="tab"
            aria-selected={vista === v}
            onClick={() => {
              setVista(v);
              if (v === "categorias") setAberta(null);
            }}
            className={`h-10 flex-1 rounded-[11px] text-[14px] font-bold ${vista === v ? "bg-card shadow-[0_1px_4px_var(--shadow)]" : "text-text-2"}`}
          >
            {rot}
          </button>
        ))}
      </div>

      {r.grupos.length === 0 && (
        <p className="pt-6 text-center text-[15px] leading-relaxed text-text-3">
          Nada na lista nem no carrinho ainda. Use <b>Foto</b>, <b>Código</b>, <b>Falar</b> ou <b>Digitar</b> para pôr o
          primeiro item.
        </p>
      )}

      {vista === "categorias" ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {r.grupos.map((g) => (
            <CardCategoria key={g.categoria} g={g} icone={iconeDe(cats, g.categoria)} onClick={() => abrirCategoria(g.categoria)} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["tudo", "Tudo"],
                ["falta", `⏳ Falta (${r.totalLista - r.pegosLista})`],
                ["carrinho", `✅ No carrinho (${carrinho.length})`],
              ] as const
            ).map(([f, rot]) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${
                  filtro === f ? "bg-brand text-brand-ink" : "border border-border bg-card text-text-2"
                }`}
              >
                {rot}
              </button>
            ))}
            {aberta && (
              <button
                onClick={() => setAberta(null)}
                className="h-9 rounded-full border-2 border-brand bg-brand-soft px-3.5 text-[13px] font-bold text-brand"
              >
                {iconeDe(cats, aberta)} {aberta} ✕
              </button>
            )}
          </div>

          {grupos.map((g) => {
            const faltam = filtro === "carrinho" ? [] : g.faltam;
            const pegos = filtro === "falta" ? [] : g.noCarrinho;
            const trocados = filtro === "falta" ? [] : g.pegos.filter((p) => p.trocadoPor);
            if (!faltam.length && !pegos.length && !trocados.length) return null;
            return (
              <section key={g.categoria} className="space-y-2">
                <div className="flex items-baseline justify-between px-1 pt-1">
                  <h2 className="text-[17px] font-extrabold">
                    {iconeDe(cats, g.categoria)} {g.categoria}
                  </h2>
                  <span className="text-[13px] font-bold tabular-nums text-text-2">
                    {g.pegos.length + g.faltam.length > 0 && `${g.pegos.length}/${g.pegos.length + g.faltam.length} · `}
                    {brl(g.total)}
                  </span>
                </div>
                <ul className="space-y-2">
                  {faltam.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-2.5">
                      <FotoItem nome={i.name} className="h-11 w-11 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{i.name}</div>
                        <div className="text-[13px] text-text-3">
                          {i.desired_quantity} {i.unit}
                          {i.estimated_price ? ` · ~${brl(i.estimated_price)}` : ""}
                          {i.em_estoque && <span className="ml-1 text-pos">· já tem em casa</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => peguei(i)}
                        disabled={busy === i.id}
                        className="h-11 shrink-0 rounded-[12px] bg-brand px-3.5 text-[14px] font-bold text-brand-ink disabled:opacity-50"
                      >
                        Peguei
                      </button>
                    </li>
                  ))}
                  {trocados.map(({ item, trocadoPor }) => (
                    <li key={item.id} className="flex items-center gap-3 rounded-[16px] border border-border bg-card-2 p-2.5 opacity-80">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-pos-soft text-[20px]" aria-hidden>
                        🔄
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold line-through decoration-text-3">{item.name}</div>
                        <div className="truncate text-[13px] text-text-2">trocado por {trocadoPor}</div>
                      </div>
                      <button
                        onClick={() => trip && marcarTroca(trip.trip_id, item.id, null)}
                        className="h-9 shrink-0 rounded-[10px] px-2 text-[13px] font-bold text-text-3"
                      >
                        Desfazer
                      </button>
                    </li>
                  ))}
                  {pegos.map((t) => {
                    const fora = g.foraDaLista.includes(t);
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => setEditar(t)}
                          className="flex w-full items-center gap-3 rounded-[16px] border border-pos/40 bg-pos-soft/50 p-2.5 text-left"
                        >
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-pos text-white">
                            <CheckIcon size={20} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold">{t.name}</div>
                            <div className="text-[13px] text-text-2">
                              {t.quantity} {t.unit} × {brl(t.unit_price)}
                              {fora && <span className="ml-1 font-bold text-text-3">· fora da lista</span>}
                            </div>
                          </div>
                          <span className="shrink-0 text-[16px] font-extrabold tabular-nums">{brl(t.quantity * t.unit_price)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {trip && (
        <button
          onClick={cancelar}
          disabled={busy === "fim"}
          className="mx-auto block h-11 px-4 text-[14px] font-bold text-neg disabled:opacity-50"
        >
          Cancelar compra
        </button>
      )}

      {/* Respiro para a barra do rodape. */}
      <div className="h-[110px] lg:hidden" />

      {/* Rodape fixo: o total e o finalizar sempre no alcance do polegar. */}
      {trip && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_16px_var(--shadow)] lg:static lg:rounded-[18px] lg:border lg:shadow-none">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-3">No carrinho</div>
            <div className="text-[22px] font-extrabold leading-none tabular-nums text-brand">{brl(total)}</div>
          </div>
          <button
            onClick={finalizar}
            disabled={busy === "fim" || carrinho.length === 0}
            className="mr-[68px] h-12 shrink-0 rounded-[14px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50 lg:mr-0"
          >
            {busy === "fim" ? "Finalizando…" : "Finalizar ✓"}
          </button>
        </div>
      )}

      {foto && (
        <FotoModal
          destinoPadrao="carrinho"
          onClose={() => setFoto(false)}
          onDigitar={() => {
            setFoto(false);
            setDigitar(true);
          }}
        />
      )}
      {codigo && <BarcodeModal open destinoPadrao="carrinho" onClose={() => setCodigo(false)} />}
      <VoiceModal open={falar} onClose={() => setFalar(false)} tela="mercado" />
      {digitar && <DigitarCarrinho onClose={() => setDigitar(false)} />}
      <CartItemModal item={editar} onClose={() => setEditar(null)} />
    </div>
  );
}

// Card da categoria: icone grande, quanto da lista ja foi pego e quanto esta dando.
function CardCategoria({ g, icone, onClick }: { g: GrupoMercado; icone: string; onClick: () => void }) {
  const daLista = g.pegos.length + g.faltam.length;
  const completo = daLista > 0 && g.faltam.length === 0;
  const pct = daLista ? g.pegos.length / daLista : 1;
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-[18px] border-2 bg-card p-3 text-left shadow-[0_1px_3px_var(--shadow)] active:scale-[.98] transition-transform ${
        completo ? "border-pos" : "border-border"
      }`}
    >
      {completo && <span className="absolute right-2.5 top-2.5 text-[16px]" aria-label="Completo">✅</span>}
      {!completo && g.faltam.length > 0 && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-brand px-2 py-[1px] text-[12px] font-extrabold text-brand-ink">
          falta {g.faltam.length}
        </span>
      )}
      <span className="text-[32px] leading-none" aria-hidden>{icone}</span>
      <span className="mt-1.5 line-clamp-1 text-[14px] font-extrabold">{g.categoria}</span>
      <span className="mt-0.5 text-[20px] font-extrabold leading-tight tabular-nums">{brl(g.total)}</span>
      {daLista > 0 ? (
        <>
          <span className="mt-1.5 h-2 overflow-hidden rounded-full bg-card-2">
            <span
              className={`block h-full rounded-full ${completo ? "bg-pos" : "bg-brand"}`}
              style={{ width: `${Math.max(pct * 100, 4)}%` }}
            />
          </span>
          <span className="mt-1 text-[12px] font-bold text-text-2">
            {g.pegos.length} de {daLista} da lista
          </span>
        </>
      ) : (
        <span className="mt-1.5 text-[12px] font-bold text-text-3">{g.noCarrinho.length} fora da lista</span>
      )}
    </button>
  );
}
