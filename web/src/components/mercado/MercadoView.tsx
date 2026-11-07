"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ShopItem, TripItem } from "@/lib/types";
import { BarcodeIcon, CameraIcon, MicIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { FotoModal } from "@/components/lista/FotoModal";
import { BarcodeModal } from "@/components/lista/BarcodeModal";
import { CartItemModal } from "@/components/lista/CartItemModal";
import { QualMercado } from "@/components/lista/QualMercado";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { categoriaDoItem, iconeDe, useCategorias } from "@/components/estoque/useCategorias";
import { atualizarLugar, useLugar } from "@/lib/lugar";
import { nomeMercado } from "@/lib/ofertas";
import {
  contaDoMes,
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
import { PainelGasto } from "./PainelGasto";
import { LinhaCarrinho, LinhaFalta, LinhaTroca } from "./LinhasMercado";
import { RevisarFim } from "./RevisarFim";

type Vista = "categorias" | "lista";
type Filtro = "tudo" | "falta" | "peguei" | "fora";

// Modo mercado: a aba do carrinho. Feita para o corredor, com o celular numa mao:
// a conta do mes no topo, tres numeros (peguei / falta / fora da lista) que filtram,
// categorias em cards e cada item com cor e icone do seu estado. Logica pura em
// lib/modoMercado.ts.
export function MercadoView() {
  const router = useRouter();
  const ligado = useModoMercado();
  const {
    trip,
    shopping,
    stock,
    budget,
    startTrip,
    cancelTrip,
    finalizeTrip,
    addTripItem,
    updateTripItem,
    removeTripItem,
    removeItems,
    showToast,
  } = useStore();
  const { noMercado, mercado } = useLugar();
  const cats = useCategorias();
  const trocas = useTrocas(trip?.trip_id ?? null);

  const [vista, setVista] = useState<Vista>("categorias");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [aberta, setAberta] = useState<string | null>(null); // categoria filtrada
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [foto, setFoto] = useState(false);
  const [codigo, setCodigo] = useState(false);
  const [falar, setFalar] = useState(false);
  const [digitar, setDigitar] = useState(false);
  const [revisar, setRevisar] = useState(false);
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
  const total = trip?.total ?? 0;
  // budget.spent = compras ja finalizadas no mes; o carrinho aberto ainda nao entrou nele.
  const conta = contaDoMes(budget.total, budget.spent, total, r.faltaValor);
  const sugestoes = r.sugestoes.filter((s) => !dispensadas.has(s.lista.id));
  const aqui = corredorAtual(carrinho, catDe);
  const grupoAqui = aqui ? r.grupos.find((g) => g.categoria === aqui) : null;
  const faltamN = r.totalLista - r.pegosLista + r.parciais;
  const tudoPego = r.totalLista > 0 && faltamN === 0;

  if (!ligado) {
    return (
      <div className="mx-auto max-w-[420px] pt-10 text-center">
        <div className="text-[54px]" aria-hidden>🛒</div>
        <h1 className="mt-2 text-[22px] font-extrabold">Modo mercado desligado</h1>
        <p className="mt-1 text-[14px] text-text-2">Ligue para ver o carrinho por categoria, o que falta e quanto está dando.</p>
        <button onClick={() => setModoMercado(true)} className="mt-5 h-12 rounded-[14px] bg-brand px-6 text-[15px] font-bold text-brand-ink">
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

  // − e + na linha. Chegar a zero tira do carrinho, com Desfazer no aviso.
  async function mudarQtd(t: TripItem, qtd: number) {
    setBusy(t.id);
    if (qtd <= 0) {
      const x = await removeTripItem(t.id);
      setBusy(null);
      if (!x.ok) return showToast(x.erro);
      return showToast(`${t.name} saiu do carrinho`, {
        desfazer: async () => {
          await addTripItem({ name: t.name, price: t.unit_price, qty: t.quantity, unit: t.unit });
        },
      });
    }
    const x = await updateTripItem(t.id, { qty: qtd });
    setBusy(null);
    if (!x.ok) showToast(x.erro);
  }

  async function finalizar() {
    if (!trip) return;
    const trocados = Object.keys(trocas);
    setBusy("fim");
    const x = await finalizeTrip();
    // Os da lista trocados por outra marca saem dela: o que foi pego ja repos o estoque.
    if (x.ok && trocados.length) await removeItems(trocados);
    setBusy(null);
    if (x.ok) {
      limparTrocas();
      setRevisar(false);
    }
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

  function verLista(f: Filtro, cat: string | null = null) {
    setVista("lista");
    setFiltro(f);
    setAberta(cat);
  }

  const busca = q.trim().toLowerCase();
  const casa = (nome: string) => !busca || nome.toLowerCase().includes(busca);
  const grupos = r.grupos.filter((g) => !aberta || g.categoria === aberta);
  const acao =
    "flex flex-col items-center justify-center gap-1.5 rounded-[18px] border border-border bg-card py-3 text-[13px] font-bold shadow-[0_1px_3px_var(--shadow)] active:scale-95 transition-transform";
  const titulo = `🛒 ${noMercado && mercado ? `No ${nomeMercado(mercado)}` : trip ? "Comprando" : "Modo mercado"}`;

  return (
    <div className="space-y-4">
      <QualMercado />

      <PainelGasto r={r} conta={conta} titulo={titulo} itens={carrinho.length} onDesligar={desligar} />

      {/* Tres numeros que respondem tudo; tocar filtra a listagem. */}
      <div className="grid grid-cols-3 gap-2">
        <Contador
          cor="pos"
          icone="✅"
          rotulo="Peguei"
          n={r.pegosLista}
          sub={r.totalLista ? `de ${r.totalLista} da lista` : "da lista"}
          ativo={vista === "lista" && filtro === "peguei"}
          onClick={() => verLista("peguei")}
        />
        <Contador
          cor="brand"
          icone="⏳"
          rotulo="Falta"
          n={faltamN}
          sub={r.faltaValor > 0 ? `~${brl(r.faltaValor)}` : faltamN ? "itens" : "nada!"}
          ativo={vista === "lista" && filtro === "falta"}
          onClick={() => verLista("falta")}
        />
        <Contador
          cor="text-3"
          icone="➕"
          rotulo="Extras"
          n={r.qtdFora}
          sub={r.qtdFora ? `${brl(r.valorFora)} fora` : "fora da lista"}
          ativo={vista === "lista" && filtro === "fora"}
          onClick={() => verLista("fora")}
        />
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

      {tudoPego && (
        <div className="rounded-[18px] bg-pos-soft p-3.5 text-center text-[16px] font-extrabold text-pos">
          🎉 Pegou tudo da lista! Só falta o caixa.
        </div>
      )}

      {/* Lembrete do corredor: pegou algo daqui e ainda falta coisa da lista aqui. */}
      {grupoAqui && grupoAqui.faltam.length > 0 && (
        <div className="rounded-[18px] border-2 border-warn bg-warn-soft p-3.5">
          <div className="text-[15px] font-extrabold">
            {iconeDe(cats, grupoAqui.categoria)} Você está em {grupoAqui.categoria}
          </div>
          <div className="mt-0.5 text-[13px] text-text-2">Aproveite: aqui ainda falta pegar</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {grupoAqui.faltam.map((f) => (
              <button
                key={f.id}
                onClick={() => peguei(f)}
                disabled={busy === f.id}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-bold disabled:opacity-50"
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
          <div key={s.lista.id} className="rounded-[18px] border-2 border-brand/40 bg-card p-3.5">
            <div className="flex items-center gap-3">
              <span className="text-[26px]" aria-hidden>🔄</span>
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
              if (v === "categorias") {
                setVista(v);
                setAberta(null);
              } else verLista(filtro, aberta);
            }}
            className={`h-11 flex-1 rounded-[11px] text-[15px] font-bold ${vista === v ? "bg-card shadow-[0_1px_4px_var(--shadow)]" : "text-text-2"}`}
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
            <CardCategoria key={g.categoria} g={g} icone={iconeDe(cats, g.categoria)} onClick={() => verLista("tudo", g.categoria)} />
          ))}
        </div>
      ) : (
        <>
          {r.totalLista + carrinho.length > 6 && (
            <div className="relative">
              <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Procurar no carrinho ou na lista..."
                className="h-[46px] w-full rounded-[13px] border border-border bg-card pl-[42px] pr-4 text-[15px]"
              />
            </div>
          )}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" data-sem-gesto>
            {(
              [
                ["tudo", "Tudo"],
                ["falta", `⏳ Falta ${faltamN}`],
                ["peguei", `✅ Peguei ${r.pegosLista}`],
                ["fora", `➕ Fora ${r.qtdFora}`],
              ] as const
            ).map(([f, rot]) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`h-10 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${
                  filtro === f ? "bg-brand text-brand-ink" : "border border-border bg-card text-text-2"
                }`}
              >
                {rot}
              </button>
            ))}
            {aberta && (
              <button
                onClick={() => setAberta(null)}
                className="h-10 shrink-0 rounded-full border-2 border-brand bg-brand-soft px-3.5 text-[13px] font-bold text-brand"
              >
                {iconeDe(cats, aberta)} {aberta} ✕
              </button>
            )}
          </div>

          {(() => {
            const secoes = grupos.map((g) => {
              const pegoDe = new Map(g.pegos.filter((p) => p.carrinho).map((p) => [p.carrinho!.id, p]));
              const faltam = filtro === "tudo" || filtro === "falta" ? g.faltam.filter((i) => casa(i.name)) : [];
              const noCarrinho = g.noCarrinho.filter((t) => {
                if (!casa(t.name)) return false;
                const fora = g.foraDaLista.includes(t);
                const parcial = (pegoDe.get(t.id)?.faltaQtd ?? 0) > 0;
                if (filtro === "fora") return fora;
                if (filtro === "peguei") return !fora;
                if (filtro === "falta") return parcial; // pegou menos do que a lista pedia
                return true;
              });
              const trocados =
                filtro === "tudo" || filtro === "peguei" ? g.pegos.filter((p) => p.trocadoPor && casa(p.item.name)) : [];
              if (!faltam.length && !noCarrinho.length && !trocados.length) return null;
              const daLista = g.pegos.length + g.faltam.length;
              return (
                <section key={g.categoria} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1 pt-1">
                    <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
                      <span className="text-[22px]" aria-hidden>{iconeDe(cats, g.categoria)}</span>
                      {g.categoria}
                    </h2>
                    <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-text-2">
                      {daLista > 0 && (
                        <span className={`rounded-full px-2 py-[1px] ${g.faltam.length ? "bg-brand-soft text-brand" : "bg-pos-soft text-pos"}`}>
                          {g.pegos.length}/{daLista}
                        </span>
                      )}
                      {brl(g.total)}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {faltam.map((i) => (
                      <LinhaFalta key={i.id} i={i} busy={busy === i.id} onPeguei={() => peguei(i)} />
                    ))}
                    {noCarrinho.map((t) => {
                      const p = pegoDe.get(t.id);
                      return (
                        <LinhaCarrinho
                          key={t.id}
                          t={t}
                          pego={p}
                          fora={g.foraDaLista.includes(t)}
                          busy={busy === t.id}
                          onQtd={(n) => mudarQtd(t, n)}
                          onEditar={() => setEditar(t)}
                          onResto={p && p.faltaQtd > 0 ? () => mudarQtd(t, p.item.desired_quantity) : undefined}
                        />
                      );
                    })}
                    {trocados.map(({ item, trocadoPor }) => (
                      <LinhaTroca
                        key={item.id}
                        item={item}
                        por={trocadoPor!}
                        onDesfazer={() => trip && marcarTroca(trip.trip_id, item.id, null)}
                      />
                    ))}
                  </ul>
                </section>
              );
            });
            return secoes.some(Boolean) ? (
              secoes
            ) : (
              <p className="pt-4 text-center text-[15px] text-text-3">
                {filtro === "falta" ? "🎉 Nada faltando aqui." : busca ? "Nenhum item encontrado." : "Nada por aqui ainda."}
              </p>
            );
          })()}
        </>
      )}

      {trip && (
        <button onClick={cancelar} disabled={busy === "fim"} className="mx-auto block h-11 px-4 text-[14px] font-bold text-neg disabled:opacity-50">
          Cancelar compra
        </button>
      )}

      {/* Respiro para a barra do rodape. */}
      <div className="h-[110px] lg:hidden" />

      {/* Rodape fixo: o total e o finalizar sempre no alcance do polegar. */}
      {trip && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_16px_var(--shadow)] lg:static lg:rounded-[18px] lg:border lg:shadow-none">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-3">
              {faltamN ? `Faltam ${faltamN}` : r.totalLista ? "Lista completa ✓" : "No carrinho"}
            </div>
            <div className="text-[22px] font-extrabold leading-none tabular-nums text-brand">{brl(total)}</div>
          </div>
          <button
            onClick={() => setRevisar(true)}
            disabled={busy === "fim" || carrinho.length === 0}
            className="mr-[68px] h-12 shrink-0 rounded-[14px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50 lg:mr-0"
          >
            Finalizar ✓
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
      {revisar && (
        <RevisarFim
          r={r}
          conta={conta}
          busy={busy === "fim"}
          ocupado={busy}
          onPeguei={peguei}
          onFinalizar={finalizar}
          onClose={() => setRevisar(false)}
        />
      )}
      <CartItemModal item={editar} onClose={() => setEditar(null)} />
    </div>
  );
}

// Numero grande que filtra a listagem.
const CORES = {
  pos: { n: "text-pos", borda: "border-pos" },
  brand: { n: "text-brand", borda: "border-brand" },
  "text-3": { n: "text-text-2", borda: "border-text-3" },
} as const;

function Contador({
  cor,
  icone,
  rotulo,
  n,
  sub,
  ativo,
  onClick,
}: {
  cor: keyof typeof CORES;
  icone: string;
  rotulo: string;
  n: number;
  sub: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex min-w-0 flex-col items-start rounded-[18px] border-2 bg-card px-3 py-2.5 text-left shadow-[0_1px_3px_var(--shadow)] active:scale-95 transition-transform ${
        ativo ? CORES[cor].borda : "border-transparent"
      }`}
    >
      <span className="w-full truncate text-[12px] font-bold text-text-2">
        {icone} {rotulo}
      </span>
      <span className={`text-[30px] font-extrabold leading-none tabular-nums ${CORES[cor].n}`}>{n}</span>
      <span className="mt-0.5 w-full truncate text-[12px] font-bold text-text-3">{sub}</span>
    </button>
  );
}

// Card da categoria: icone grande, quanto da lista ja foi pego e quanto esta dando.
function CardCategoria({ g, icone, onClick }: { g: GrupoMercado; icone: string; onClick: () => void }) {
  const daLista = g.pegos.length + g.faltam.length;
  const incompletos = g.pegos.filter((p) => p.faltaQtd > 0).length;
  const completo = daLista > 0 && g.faltam.length === 0 && incompletos === 0;
  const pct = daLista ? g.pegos.length / daLista : 1;
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-[18px] border-2 p-3 text-left shadow-[0_1px_3px_var(--shadow)] active:scale-[.98] transition-transform ${
        completo ? "border-pos bg-pos-soft/50" : "border-border bg-card"
      }`}
    >
      {completo && <span className="absolute right-2.5 top-2.5 text-[18px]" aria-label="Completo">✅</span>}
      {!completo && g.faltam.length + incompletos > 0 && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-brand px-2 py-[1px] text-[12px] font-extrabold text-brand-ink">
          falta {g.faltam.length + incompletos}
        </span>
      )}
      <span className="text-[34px] leading-none" aria-hidden>{icone}</span>
      <span className="mt-1.5 line-clamp-1 text-[14px] font-extrabold">{g.categoria}</span>
      <span className="mt-0.5 text-[21px] font-extrabold leading-tight tabular-nums">{brl(g.total)}</span>
      {daLista > 0 ? (
        <>
          <span className="mt-1.5 h-2 overflow-hidden rounded-full bg-card-2">
            <span
              className={`block h-full rounded-full transition-[width] ${completo ? "bg-pos" : "bg-brand"}`}
              style={{ width: `${Math.max(pct * 100, 4)}%` }}
            />
          </span>
          <span className="mt-1 text-[12px] font-bold text-text-2">
            {g.pegos.length} de {daLista} da lista
            {g.falta > 0 && <span className="text-text-3"> · ~{brl(g.falta)}</span>}
          </span>
        </>
      ) : (
        <span className="mt-1.5 text-[12px] font-bold text-text-3">➕ {g.noCarrinho.length} fora da lista</span>
      )}
    </button>
  );
}
