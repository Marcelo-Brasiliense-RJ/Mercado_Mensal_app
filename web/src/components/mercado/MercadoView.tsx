"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ShopItem, TripItem } from "@/lib/types";
import { BarcodeIcon, CameraIcon, CartIcon, MicIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
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
  chaveNao,
  naoEoMesmo,
  setModoMercado,
  useNaoEoMesmo,
  useModoMercado,
  useTrocas,
} from "@/lib/modoMercado";
import { DigitarCarrinho } from "./DigitarCarrinho";
import { PainelGasto } from "./PainelGasto";
import { CardFalta, LinhaCarrinho, LinhaFaltaCompacta, LinhaTroca } from "./LinhasMercado";
import { RevisarFim } from "./RevisarFim";

type Aba = "falta" | "carrinho";

// Modo mercado: a aba do carrinho. Os PRODUTOS sao o centro da tela (antes o painel e os
// cards de numero ocupavam tudo e, com 70 itens, nenhum aparecia sem rolar):
// - resumo compacto no topo (total, barra da lista, orcamento);
// - duas abas fixas ao rolar: "Falta" (grade de fotos, tocar = peguei) e "No carrinho"
//   (cada item com − / +, preco e o comparativo com a lista);
// - chips de categoria que filtram e, no carrinho, mostram quanto deu em cada uma.
// Logica pura em lib/modoMercado.ts.
export function MercadoView() {
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
  const naoSao = useNaoEoMesmo(trip?.trip_id ?? null);

  const [abaEscolhida, setAba] = useState<Aba | null>(null); // null = automatica
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [add, setAdd] = useState(false); // opcoes de adicionar abertas
  // Grade de fotos (4 por linha) ou lista de uma linha por item. Lembrado no aparelho.
  const [visual, setVisualState] = useState<"grade" | "lista">(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("mercado_visual") === "lista" ? "lista" : "grade";
    } catch {
      return "grade";
    }
  });
  function setVisual(v: "grade" | "lista") {
    setVisualState(v);
    try {
      localStorage.setItem("mercado_visual", v);
    } catch {}
  }
  // Categorias recolhidas: com 70 itens, ver so os titulos e abrir a do corredor.
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const alternar = (c: string) =>
    setFechadas((f) => {
      const n = new Set(f);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const [busy, setBusy] = useState<string | null>(null);
  const [pegando, setPegando] = useState<Set<string>>(new Set());
  const [foto, setFoto] = useState(false);
  const [codigo, setCodigo] = useState(false);
  const [falar, setFalar] = useState(false);
  const [digitar, setDigitar] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [editar, setEditar] = useState<TripItem | null>(null);

  const carrinho = trip?.items ?? [];
  // Carrinho mais recente, para o "Desfazer" do aviso achar o item que acabou de entrar.
  const carrinhoRef = useRef<TripItem[]>(carrinho);
  const inicioRef = useRef<HTMLDivElement>(null); // comeco dos itens (buscar volta pra ca)
  useEffect(() => {
    carrinhoRef.current = trip?.items ?? [];
  }, [trip]);

  // Categoria escolhida no estoque (se o item ja existe em casa), senao o palpite pelo nome.
  const catDe = (nome: string) =>
    categoriaDoItem({ name: nome, category: stock.find((x) => mesmoNome(x.name, nome))?.category }, cats);
  const aqui = corredorAtual(carrinho, catDe);
  // O corredor onde a pessoa esta (ultimo item pego) sobe para o topo da aba Falta.
  const ordem = (c: string) => {
    if (c === aqui) return -1;
    const i = cats.findIndex((x) => x.nome === c);
    return i < 0 ? 999 : i;
  };

  const r = montarMercado(shopping, carrinho, catDe, trocas, ordem);
  const total = trip?.total ?? 0;
  const conta = contaDoMes(budget.total, budget.spent, total, r.faltaValor);
  const sugestoes = r.sugestoes.filter((s) => !naoSao.includes(chaveNao(s.lista.id, s.carrinho.name)));
  const faltamN = r.totalLista - r.pegosLista + r.parciais;
  // Carrinho vem primeiro; abre nele quando ja tem item. Vazio, abre no que falta pegar.
  const aba: Aba = abaEscolhida ?? (carrinho.length > 0 ? "carrinho" : "falta");

  if (!ligado) {
    return (
      <div className="mx-auto max-w-[420px] pt-10 text-center">
        <div className="text-[54px]" aria-hidden>🛒</div>
        <h1 className="mt-2 text-[22px] font-extrabold">Modo mercado desligado</h1>
        <p className="mt-1 text-[14px] text-text-2">Ligue para ver o que falta, o que está no carrinho e quanto está dando.</p>
        <button onClick={() => setModoMercado(true)} className="mt-5 h-12 rounded-[14px] bg-brand px-6 text-[15px] font-bold text-brand-ink">
          Ligar modo mercado
        </button>
      </div>
    );
  }

  async function comecar() {
    void atualizarLugar(true);
    setBusy("abrir");
    const x = await startTrip();
    setBusy(null);
    showToast(x.ok ? "Compra aberta. Bora!" : x.erro);
  }

  // Toque no card: o card some com um check verde, o item entra no carrinho e o aviso
  // tem Desfazer (toque sem querer na grade e o erro mais facil de cometer aqui).
  async function peguei(i: ShopItem) {
    setPegando((s) => new Set(s).add(i.id));
    const x = await addTripItem({ name: i.name, price: i.estimated_price ?? null, qty: i.desired_quantity, unit: i.unit });
    setPegando((s) => {
      const n = new Set(s);
      n.delete(i.id);
      return n;
    });
    if (!x.ok) return showToast(x.erro);
    showToast(`✅ ${i.name} no carrinho`, {
      desfazer: async () => {
        const t = carrinhoRef.current.find((c) => mesmoNome(c.name, i.name));
        if (t) await removeTripItem(t.id);
      },
    });
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
    // Cobertos por produto de outro nome (troca ou nome do rotulo): o banco so baixa da
    // lista o de nome igual, entao estes saem da lista aqui.
    const trocados = r.paraLimpar;
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

  function trocarAba(a: Aba) {
    setAba(a);
    setCat(null);
  }

  const busca = q.trim().toLowerCase();
  const casa = (nome: string) => !busca || nome.toLowerCase().includes(busca);

  // Chips de categoria da aba atual: na Falta, quantos faltam; no carrinho, quanto deu.
  const chips = r.grupos
    .map((g) => ({
      categoria: g.categoria,
      falta: g.faltam.length + g.pegos.filter((p) => p.faltaQtd > 0).length,
      itens: g.noCarrinho.length,
      total: g.total,
    }))
    .filter((c) => (aba === "falta" ? c.falta > 0 : c.itens > 0));
  const catAtiva = cat && chips.some((c) => c.categoria === cat) ? cat : null;
  const grupos = r.grupos.filter((g) => !catAtiva || g.categoria === catAtiva);

  const titulo = `🛒 ${noMercado && mercado ? `No ${nomeMercado(mercado)}` : "No carrinho"} · ${carrinho.length} ${carrinho.length === 1 ? "item" : "itens"}`;

  return (
    <div className="space-y-3">
      <QualMercado />

      <PainelGasto r={r} conta={conta} titulo={titulo} />

      {!trip && (
        <button
          onClick={comecar}
          disabled={busy === "abrir"}
          className="flex w-full items-center gap-3 rounded-[16px] border-2 border-brand bg-brand-soft px-4 py-2.5 text-left disabled:opacity-60"
        >
          <span className="text-[24px]" aria-hidden>🚀</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold text-brand">Começar a compra</span>
            <span className="block text-[12px] text-text-2">Ou só toque no que pegar: o carrinho abre sozinho</span>
          </span>
        </button>
      )}

      {/* Um botao so para por no carrinho; tocar mostra as formas (foto, codigo, falar,
          digitar). Fechado ocupa uma linha: os itens ficam com a tela. */}
      <div className="overflow-hidden rounded-[22px] border-2 border-brand bg-card">
        <button
          onClick={() => setAdd(!add)}
          aria-expanded={add}
          className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap text-[15px] font-extrabold text-brand"
        >
          <CartIcon size={20} />
          Adicionar ao carrinho
          <span className={`text-[13px] transition-transform ${add ? "rotate-180" : ""}`} aria-hidden>
            ▼
          </span>
        </button>
        {add && (
          <div className="border-t border-border p-2">{gradeAdd()}</div>
        )}
      </div>

      {/* "Pegou X de limpeza e na lista tem Y parecido": e o mesmo? */}
      {trip &&
        sugestoes.map((s) => (
          <div key={s.lista.id} className="flex items-center gap-2.5 rounded-[16px] border-2 border-brand/40 bg-card p-2.5">
            <span className="text-[22px]" aria-hidden>🔄</span>
            <div className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug">
              Pegou <b>{s.carrinho.name}</b>. É o <b>{s.lista.name}</b> da lista?
            </div>
            <button
              onClick={() => marcarTroca(trip.trip_id, s.lista.id, s.carrinho.name)}
              className="h-10 shrink-0 rounded-[11px] bg-brand px-3 text-[13px] font-bold text-brand-ink"
            >
              Sim
            </button>
            <button
              onClick={() => naoEoMesmo(trip.trip_id, s.lista.id, s.carrinho.name)}
              className="h-10 shrink-0 rounded-[11px] border border-border px-3 text-[13px] font-bold"
            >
              Não
            </button>
          </div>
        ))}

      {/* Abas + categorias: ficam presas no topo enquanto rola a lista. */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg/95 px-4 pb-2 pt-2 backdrop-blur lg:-mx-9 lg:px-9">
        <div className="grid grid-cols-2 gap-2" role="tablist">
          <button
            role="tab"
            aria-selected={aba === "carrinho"}
            onClick={() => trocarAba("carrinho")}
            className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[15px] font-extrabold transition-colors ${
              aba === "carrinho" ? "bg-pos text-white shadow-[0_4px_12px_var(--shadow)]" : "border-2 border-border bg-card text-text-2"
            }`}
          >
            🛒 Carrinho
            <span
              key={carrinho.length}
              className={`ic-pop min-w-[26px] rounded-full px-1.5 py-0.5 text-[13px] tabular-nums ${aba === "carrinho" ? "bg-black/15" : "bg-pos-soft text-pos"}`}
            >
              {carrinho.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={aba === "falta"}
            onClick={() => trocarAba("falta")}
            className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[15px] font-extrabold transition-colors ${
              aba === "falta" ? "bg-brand text-brand-ink shadow-[0_4px_12px_var(--shadow)]" : "border-2 border-border bg-card text-text-2"
            }`}
          >
            ⏳ Falta
            <span
              key={faltamN}
              className={`ic-pop min-w-[26px] rounded-full px-1.5 py-0.5 text-[13px] tabular-nums ${aba === "falta" ? "bg-black/15" : "bg-brand-soft text-brand"}`}
            >
              {faltamN}
            </span>
          </button>
        </div>

        {buscando && (
          <div className="relative">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                inicioRef.current?.scrollIntoView({ block: "start" });
              }}
              placeholder={aba === "falta" ? "Procurar o que falta..." : "Procurar no carrinho..."}
              className="h-[44px] w-full rounded-[13px] border border-border bg-card pl-[42px] pr-4 text-[15px]"
            />
          </div>
        )}

        {(chips.length > 1 || r.totalLista + carrinho.length > 8) && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:-mx-9 lg:px-9" data-sem-gesto>
            <button
              onClick={() => {
                if (buscando) setQ("");
                setBuscando(!buscando);
              }}
              aria-label={buscando ? "Fechar busca" : "Procurar"}
              aria-pressed={buscando}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                buscando || busca ? "bg-text text-bg" : "border border-border bg-card text-text-2"
              }`}
            >
              {buscando ? "✕" : <SearchIcon size={16} />}
            </button>
            {aba === "falta" && (
              <button
                onClick={() => setVisual(visual === "grade" ? "lista" : "grade")}
                aria-label={visual === "grade" ? "Ver em lista" : "Ver em grade"}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-[16px] text-text-2"
              >
                {visual === "grade" ? "☰" : "▦"}
              </button>
            )}
            <button
              onClick={() => setCat(null)}
              aria-pressed={!catAtiva}
              className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-bold ${
                !catAtiva ? "bg-text text-bg" : "border border-border bg-card text-text-2"
              }`}
            >
              Todas
            </button>
            {chips.map((c) => (
              <button
                key={c.categoria}
                onClick={() => setCat(catAtiva === c.categoria ? null : c.categoria)}
                aria-pressed={catAtiva === c.categoria}
                className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold ${
                  catAtiva === c.categoria ? "bg-text text-bg" : "border border-border bg-card text-text-2"
                }`}
              >
                <span aria-hidden>{iconeDe(cats, c.categoria)}</span>
                {c.categoria === aqui && aba === "falta" && <span aria-label="você está aqui">📍</span>}
                <span className="max-w-[110px] truncate">{c.categoria}</span>
                <span className="tabular-nums opacity-80">{aba === "falta" ? c.falta : brl(c.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* scroll-mt: para o comeco dos itens nao ficar atras das abas presas no topo */}
      <div ref={inicioRef} className="scroll-mt-[160px]" aria-hidden />
      {aba === "falta" ? abaFalta() : abaCarrinho()}

      {/* Desligar o modo mercado fica na Lista e nos Ajustes, fora do caminho do polegar. */}
      {trip && (
        <button onClick={cancelar} disabled={busy === "fim"} className="mx-auto block h-11 px-4 text-[14px] font-bold text-neg disabled:opacity-50">
          Cancelar compra
        </button>
      )}

      {/* Respiro para a barra do rodape. */}
      <div className="h-[110px] lg:hidden" />

      {/* Rodape fixo: o total e o finalizar sempre no alcance do polegar. */}
      {trip && (
        // Barra do modo compra, flutuante no lugar das abas: voltar, total e finalizar.
        <div data-abas className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 flex h-[62px] items-center gap-2 rounded-full bg-[var(--barra)] p-1.5 pl-4 text-white shadow-[0_10px_30px_var(--shadow-lg)] lg:static lg:rounded-[18px]">
          <Link href="/app/lista" className="shrink-0 text-[14px] font-bold text-white/70 no-underline">
            ‹ Lista
          </Link>
          <div className="min-w-0 flex-1 text-right">
            <div className="truncate text-[10px] font-bold uppercase tracking-wide text-white/60">
              {faltamN ? `Faltam ${faltamN}` : r.totalLista ? "Lista completa ✓" : "No carrinho"}
            </div>
            <div className="truncate text-[18px] font-extrabold leading-tight tabular-nums">{brl(total)}</div>
          </div>
          <button
            onClick={() => setRevisar(true)}
            disabled={busy === "fim" || carrinho.length === 0}
            className="h-full shrink-0 whitespace-nowrap rounded-full bg-[var(--barra-ativa)] px-5 text-[15px] font-extrabold text-[var(--barra-ativa-ink)] disabled:opacity-50"
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

  // As 4 formas de por no carrinho (no botao "Adicionar" e no carrinho vazio).
  function gradeAdd() {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["Foto", CameraIcon, () => setFoto(true)],
            ["Código", BarcodeIcon, () => setCodigo(true)],
            ["Falar", MicIcon, () => setFalar(true)],
            ["Digitar", PlusIcon, () => setDigitar(true)],
          ] as const
        ).map(([rot, Icone, abrir]) => (
          <button
            key={rot}
            onClick={() => {
              setAdd(false);
              abrir();
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-[12px] bg-card-2 py-2.5 text-[13px] font-bold transition-transform active:scale-95"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-brand-ink">
              <Icone size={20} />
            </span>
            {rot}
          </button>
        ))}
      </div>
    );
  }

  // Titulo da categoria: toque recolhe/abre. Fechada, mostra so a contagem e o valor.
  function titulo_(c: string, direita: React.ReactNode, extra?: React.ReactNode) {
    const fechada = fechadas.has(c);
    return (
      <button
        onClick={() => alternar(c)}
        aria-expanded={!fechada}
        className="flex min-h-[40px] w-full items-center gap-2 px-1 text-left text-[15px] font-extrabold"
      >
        <span className={`text-[12px] text-text-3 transition-transform ${fechada ? "-rotate-90" : ""}`} aria-hidden>
          ▼
        </span>
        <span className="text-[19px]" aria-hidden>{iconeDe(cats, c)}</span>
        <span className="truncate">{c}</span>
        {extra}
        <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-text-2">{direita}</span>
      </button>
    );
  }

  function recolherTudo(nomes: string[]) {
    const todas = nomes.every((n) => fechadas.has(n));
    return (
      nomes.length > 2 && (
        <button
          onClick={() => setFechadas(todas ? new Set() : new Set(nomes))}
          className="h-8 shrink-0 rounded-full px-2 text-[13px] font-bold text-brand"
        >
          {todas ? "Abrir todas" : "Recolher todas"}
        </button>
      )
    );
  }

  // Aba "Falta": grade de fotos (4 por linha) ou lista de uma linha, por categoria.
  // Tocar = peguei. Parcial (pegou menos do que a lista pedia) em amarelo; tocar completa.
  function abaFalta() {
    const secoes = grupos
      .map((g) => ({
        g,
        faltam: g.faltam.filter((i) => casa(i.name)),
        restos: g.pegos.filter((p) => p.faltaQtd > 0 && p.carrinho && casa(p.item.name)),
      }))
      .filter((x) => x.faltam.length + x.restos.length > 0);

    if (!secoes.length)
      return (
        <div className="rounded-[18px] bg-pos-soft p-6 text-center">
          <div className="text-[40px]" aria-hidden>{r.totalLista ? "🎉" : "📝"}</div>
          <div className="mt-1 text-[17px] font-extrabold text-pos">
            {busca ? "Nada com esse nome faltando" : r.totalLista ? "Pegou tudo da lista!" : "Sua lista está vazia"}
          </div>
          <div className="mt-1 text-[13px] text-text-2">
            {r.totalLista ? "Confira o carrinho e finalize no caixa." : "Use Foto, Código, Falar ou Digitar para pôr itens no carrinho."}
          </div>
          {carrinho.length > 0 && (
            <button onClick={() => trocarAba("carrinho")} className="mt-3 h-11 rounded-[12px] bg-pos px-5 text-[14px] font-bold text-white">
              Ver carrinho ({carrinho.length})
            </button>
          )}
        </div>
      );

    const Item = visual === "grade" ? CardFalta : LinhaFaltaCompacta;
    return (
      <>
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="truncate text-[13px] font-bold text-text-3">
            {carrinho.length === 0 ? "👆 Toque no produto quando pegar" : `${faltamN} para pegar`}
          </p>
          {recolherTudo(secoes.map((x) => x.g.categoria))}
        </div>
        {secoes.map(({ g, faltam, restos }) => (
          <section key={g.categoria}>
            {titulo_(
              g.categoria,
              <>
                {faltam.length + restos.length}
                {g.falta > 0 && <span className="text-text-3"> · ~{brl(g.falta)}</span>}
              </>,
              g.categoria === aqui && (
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-[1px] text-[11px] font-extrabold text-warn">📍 aqui</span>
              ),
            )}
            {!fechadas.has(g.categoria) && (
              <ul
                className={
                  visual === "grade"
                    ? "mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-8"
                    : "mt-1 divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card"
                }
              >
                {restos.map((p) => (
                  <Item
                    key={p.item.id}
                    nome={p.item.name}
                    qtd={p.faltaQtd}
                    unidade={p.item.unit}
                    preco={null}
                    resto
                    pegando={busy === p.carrinho!.id}
                    onPegar={() => mudarQtd(p.carrinho!, p.item.desired_quantity)}
                  />
                ))}
                {faltam.map((i) => (
                  <Item
                    key={i.id}
                    nome={i.name}
                    qtd={i.desired_quantity}
                    unidade={i.unit}
                    preco={i.estimated_price}
                    emCasa={i.em_estoque}
                    pegando={pegando.has(i.id)}
                    onPegar={() => peguei(i)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </>
    );
  }

  // Aba "No carrinho": uma linha por item, agrupado por categoria com quanto deu em cada.
  function abaCarrinho() {
    const secoes = grupos
      .map((g) => {
        const pegoDe = new Map(g.pegos.filter((p) => p.carrinho && !p.trocadoPor).map((p) => [p.carrinho!.id, p]));
        return {
          g,
          pegoDe,
          itens: g.noCarrinho.filter((t) => casa(t.name)),
          trocados: g.pegos.filter((p) => p.trocadoPor && casa(p.item.name)),
        };
      })
      .filter((x) => x.itens.length + x.trocados.length > 0);

    if (!secoes.length)
      return (
        <div className="rounded-[18px] border-2 border-dashed border-border p-6 text-center">
          <div className="text-[40px]" aria-hidden>🛒</div>
          <div className="mt-1 text-[17px] font-extrabold">{busca ? "Nada com esse nome no carrinho" : "Carrinho vazio"}</div>
          <div className="mt-1 text-[13px] text-text-2">Ponha o primeiro item, ou toque no produto na aba Falta.</div>
          {!busca && <div className="mt-3">{gradeAdd()}</div>}
          {faltamN > 0 && (
            <button onClick={() => trocarAba("falta")} className="mt-3 h-11 rounded-[12px] bg-brand px-5 text-[14px] font-bold text-brand-ink">
              Ver o que falta ({faltamN})
            </button>
          )}
        </div>
      );

    return (
      <>
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="truncate text-[13px] font-bold text-text-3">
            {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} · {brl(total)}
          </p>
          {recolherTudo(secoes.map((x) => x.g.categoria))}
        </div>
        {secoes.map(({ g, pegoDe, itens, trocados }) => (
          <section key={g.categoria}>
            {titulo_(
              g.categoria,
              <>
                <span className="text-text-3">{itens.length} · </span>
                <span className="text-[14px] font-extrabold text-text">{brl(g.total)}</span>
              </>,
            )}
            {!fechadas.has(g.categoria) && (
              <ul className="mt-1 divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
                {itens.map((t) => (
                  <LinhaCarrinho
                    key={t.id}
                    t={t}
                    pego={pegoDe.get(t.id)}
                    fora={g.foraDaLista.includes(t)}
                    busy={busy === t.id}
                    onQtd={(n) => mudarQtd(t, n)}
                    onEditar={() => setEditar(t)}
                  />
                ))}
                {trocados.map(({ item, trocadoPor }) => (
                  <LinhaTroca
                    key={item.id}
                    item={item}
                    por={trocadoPor!}
                    onDesfazer={() => trip && marcarTroca(trip.trip_id, item.id, null)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </>
    );
  }
}
