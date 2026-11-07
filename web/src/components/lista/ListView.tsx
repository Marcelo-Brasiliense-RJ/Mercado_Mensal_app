"use client";

import { useEffect, useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { BarcodeIcon, CheckIcon, MicIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import type { ShopItem } from "@/lib/types";
import { AddItemModal } from "./AddItemModal";
import { ListItemActions } from "./ListItemActions";
import { CartPanel } from "./CartPanel";
import { BarcodeModal } from "./BarcodeModal";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { QuickBar } from "./QuickBar";
import { FotoModal } from "./FotoModal";
import { FotoItem } from "@/components/ui/FotoItem";
import { categoriaDe } from "@/lib/categorias";
import { RotaModal } from "./RotaModal";
import { MontarLista } from "./MontarLista";
import { useListaOfertas, useOfertas } from "@/components/ofertas/useOfertas";
import { NaoCompro } from "@/components/ofertas/NaoCompro";
import { useLivelo } from "@/components/ofertas/useLivelo";
import { comPontos, ofertasLivelo } from "@/lib/livelo";
import { corMercado, corredor, faltaEmCasa, maisBarataPara, nomeMercado, porMercado, resumir } from "@/lib/ofertas";
import { MercadoModal, type ItemMercado } from "./MercadoModal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Interruptor } from "@/components/ui/Interruptor";
import { CartIcon } from "@/components/ui/icons";
import { setModoMercado, useModoMercado } from "@/lib/modoMercado";

export function ListView() {
  const { shopping, trip, buyItems, removeItems, addTripItem, showToast, reloadTrip, stock, stockToList, dataReady } =
    useStore();
  const router = useRouter();
  const modoMercado = useModoMercado();
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [fotoOpen, setFotoOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Selo "em oferta" em cada item: ao montar a lista ja se ve onde comprar.
  // Precos da Livelo entram como mais um mercado, ja descontando os pontos (0046).
  const ofertasMercado = useListaOfertas();
  const estadoOfertas = useOfertas();
  const escondidas = estadoOfertas.fase === "ok" ? (estadoOfertas.dados.escondidas ?? 0) : 0;
  const livelo = useLivelo();
  const ofertas = useMemo(
    () => (livelo ? [...ofertasMercado.map((o) => comPontos(o, livelo)), ...ofertasLivelo(livelo)] : ofertasMercado),
    [ofertasMercado, livelo],
  );
  // "Vou no Guanabara": mostra so o que vale comprar la, na ordem dos corredores.
  // Lembrado no aparelho: quem vai sempre no mesmo mercado nao escolhe de novo.
  const [ondeVou, setOndeVouState] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem("lista_onde_vou");
    } catch {
      return null;
    }
  });
  function setOndeVou(m: string | null) {
    setOndeVouState(m);
    try {
      if (m) localStorage.setItem("lista_onde_vou", m);
      else localStorage.removeItem("lista_onde_vou");
    } catch {}
  }
  const [montando, setMontando] = useState(false);

  // Modo "No mercado" ao vivo: enquanto esta tela esta aberta, verifica a cada
  // 4s se ha compra aberta (ou novos itens) vinda do Telegram.
  // ponytail: polling; migrar pra Realtime do Supabase so se o atraso incomodar.
  useEffect(() => {
    reloadTrip();
    const id = setInterval(reloadTrip, 4000);
    return () => clearInterval(id);
  }, [reloadTrip]);

  const pendentes = shopping.filter((i) => i.status === "pending");
  const { melhor, conta } = porMercado(pendentes, ofertas);
  const mercadosComOferta = Object.keys(conta).sort((a, b) => conta[b] - conta[a]);
  const filtro = ondeVou && conta[ondeVou] ? ondeVou : null;
  // Quanto a lista sai em cada mercado (o mais barato de cada item dentro dele): a
  // resposta para "onde compensa fazer a compra", na cara, sem abrir a aba Ofertas.
  const resumoLista = resumir(ofertas, faltaEmCasa(pendentes, []));
  const [rotaAberta, setRotaAberta] = useState(false);
  const [ondeAberto, setOndeAberto] = useState(false);
  const [montar, setMontar] = useState(false);
  const [mercadoAberto, setMercadoAberto] = useState<string | null>(null);
  // Produtos do encarte que entram na conta do mercado aberto.
  const itensDoMercado = (m: string): ItemMercado[] =>
    resumoLista.itens.flatMap((x) => {
      const o = x.opcoes.find((y) => y.mercado === m);
      if (!o) return [];
      const naLista = shopping.find((s) => s.status === "pending" && s.name.trim().toLowerCase() === x.item.nome)?.estimated_price ?? null;
      return [{ nome: x.item.nome, oferta: o, naLista, melhor: x.opcoes[0] }];
    });
  // Fica fora do "Vou no X" so o que esta mais barato em OUTRO mercado; item sem oferta
  // nenhuma se compra em qualquer lugar e continua aparecendo.
  const emOutro = (i: ShopItem) => {
    const o = melhor.get(i);
    return !!filtro && !!o && o.mercado !== filtro;
  };
  const visible = shopping
    .filter((i) => i.status !== "removed")
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .filter((i) => !emOutro(i))
    .sort(
      (a, b) =>
        (a.status === "bought" ? 1 : 0) - (b.status === "bought" ? 1 : 0) ||
        (filtro
          ? corredor(melhor.get(a)?.categoria) - corredor(melhor.get(b)?.categoria)
          : trip // no mercado: na ordem dos corredores, para nao voltar ao mesmo corredor
            ? corredor(categoriaDe(a.name)) - corredor(categoriaDe(b.name))
            : 0),
    );
  const escondidos = filtro ? pendentes.filter(emOutro).length : 0;

  // Lista do mes: tudo que esta abaixo do nivel normal e ainda nao esta na lista.
  // A quantidade sai do proprio estoque (normal - tem), pela mesma RPC do "Mandar pra lista".
  const naLista = new Set(pendentes.map((i) => i.name.toLowerCase()));
  const doMes = stock.filter((s) => s.normal > 0 && s.current < s.normal && !naLista.has(s.name.toLowerCase()));
  async function montarMes() {
    setMontando(true);
    const r = await stockToList(doMes.map((s) => s.id));
    setMontando(false);
    showToast(r.ok ? `${doMes.length} itens na lista do mês` : r.erro);
  }
  // So conta no total quem voce vai comprar: pendente e NAO esta em estoque.
  const aComprar = shopping.filter(
    (i) => i.status === "pending" && !i.em_estoque,
  );
  const total = aComprar.reduce(
    (acc, i) => acc + i.desired_quantity * (i.estimated_price ?? 0),
    0,
  );
  const missing = aComprar.length;

  async function comprar(id: string) {
    setBusy(id);
    const r = await buyItems([id]);
    setBusy(null);
    showToast(r.ok ? "Comprado, estoque reposto" : r.erro, { desfazer: r.ok });
  }
  // Um toque: o item da lista vai para o carrinho com a quantidade e o preco que
  // ja estavam ali. E o gesto mais repetido dentro do mercado, e ate agora exigia
  // abrir o popup de acoes ou digitar o nome de novo no painel do carrinho.
  async function peguei(i: ShopItem) {
    setBusy(i.id);
    const r = await addTripItem({
      name: i.name,
      price: i.estimated_price ?? null,
      qty: i.desired_quantity,
      unit: i.unit,
    });
    setBusy(null);
    showToast(r.ok ? `${i.name} no carrinho` : r.erro);
  }

  async function remover(id: string) {
    setBusy(id);
    const r = await removeItems([id]);
    setBusy(null);
    if (!r.ok) showToast(r.erro);
  }

  // Desktop: as tres formas de anotar sao botoes de verdade, nao um menu que
  // abre outro menu. No celular quem faz esse papel e a QuickBar do rodape.
  const secundario =
    "flex h-[44px] items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-[14px] font-bold";
  const addBtn = (
    <>
      <button onClick={() => setVoiceOpen(true)} className={secundario}>
        <MicIcon size={18} />
        Falar
      </button>
      <button onClick={() => setScanOpen(true)} className={secundario}>
        <BarcodeIcon size={18} />
        Código
      </button>
      <button
        onClick={() => setAddManualOpen(true)}
        className="flex h-[44px] items-center gap-2 rounded-[12px] bg-brand px-[18px] text-[14px] font-bold text-brand-ink"
      >
        <PlusIcon size={18} />
        Adicionar item
      </button>
    </>
  );

  return (
    <>
      <ScreenHeader title="Lista de compras" action={addBtn} />

      <div className="space-y-4 lg:space-y-6">
        {/* Modo mercado: liga a aba do carrinho (escondida ate ligar), so de pegar. */}
        <div className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-3.5 shadow-[0_1px_3px_var(--shadow)]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-brand-soft text-brand">
            <CartIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold">Modo mercado</div>
            <div className="text-[13px] leading-snug text-text-2">
              {modoMercado ? (
                <Link href="/app/mercado" className="font-bold text-brand">
                  Abrir a aba Mercado ›
                </Link>
              ) : (
                "Aba própria do carrinho: por categoria, o que falta e o valor"
              )}
            </div>
          </div>
          <Interruptor
            ligado={modoMercado}
            rotulo="Modo mercado"
            onChange={(v) => {
              setModoMercado(v);
              if (v) router.push("/app/mercado");
            }}
          />
        </div>

        {/* O carrinho vem antes dos cards: dentro do mercado e o numero que muda. */}
        <CartPanel onScan={() => setScanOpen(true)} />

        {/* No celular esses dois numeros ja vivem na QuickBar, fixa no rodape:
            repetir aqui custava meia tela dentro do mercado. */}
        <div className="hidden gap-4 sm:grid-cols-2 lg:grid">
          <div className="rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)] lg:p-[22px]">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-3">
              Total a pagar
            </div>
            <div className="text-[34px] font-extrabold leading-none lg:text-[44px]">
              {brl(total)}
            </div>
            <div className="mt-1.5 text-[12px] text-text-3">só o que falta comprar</div>
          </div>
          <div className="rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)] lg:p-[22px]">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-3">
              Faltando
            </div>
            <div className="text-[34px] font-extrabold leading-none text-brand lg:text-[44px]">
              {missing}
            </div>
            <div className="mt-1.5 text-[12px] text-text-3">itens para comprar</div>
          </div>
        </div>

        {/* Montar a lista como numa vitrine: um toque por produto, com foto.
            Dentro do mercado (carrinho aberto) vira um botao discreto: a tela e de pegar,
            mas lembrar de algo no corredor ainda e um toque. */}
        {trip ? (
          <button
            onClick={() => setMontar(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-brand bg-card text-[15px] font-bold text-brand"
          >
            ⚡ Montar lista rápida
          </button>
        ) : (
        <button
          onClick={() => setMontar(true)}
          className="flex w-full items-center gap-3 rounded-[18px] bg-brand px-4 py-3.5 text-left text-brand-ink shadow-[0_4px_14px_var(--shadow)]"
        >
          <span className="text-[26px]" aria-hidden>⚡</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold">Montar lista rápida</span>
            <span className="block text-[13px] opacity-90">Toque nos produtos: acabando, de casa ou em oferta</span>
          </span>
          <span className="text-[22px]" aria-hidden>›</span>
        </button>
        )}

        {/* Nao compro (0045): os produtos ruins, aqui onde a lista e montada. */}
        <NaoCompro ofertas={ofertasMercado} escondidas={escondidas} />

        {/* Lista do mes num toque: o app ja sabe o que falta para completar a casa. */}
        {!trip && doMes.length > 0 && (
          <div className="flex items-center gap-3 rounded-[18px] border-2 border-brand/40 bg-brand-soft p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-extrabold text-brand">Lista do mês</div>
              <div className="text-[13px] text-text-2">
                {doMes.length} {doMes.length > 1 ? "itens estão" : "item está"} abaixo do normal em casa
              </div>
            </div>
            <button
              onClick={montarMes}
              disabled={montando}
              className="h-12 shrink-0 rounded-[14px] bg-brand px-4 text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {montando ? "Montando…" : "Montar"}
            </button>
          </div>
        )}

        {/* Onde compensa: cada mercado com quantos itens da lista e quanto sai la.
            Tocar filtra a lista por aquele mercado, na ordem dos corredores. */}
        {/* No mercado (carrinho aberto) fica fechado numa linha: a tela e de pegar. */}
        {trip && !ondeAberto && mercadosComOferta.length > 0 && resumoLista.mercados[0] && (
          <button
            onClick={() => setOndeAberto(true)}
            aria-expanded={false}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[16px] font-extrabold">🏆 Onde compensa comprar</span>
              <span className="block truncate text-[12px] text-text-2">
                {nomeMercado(resumoLista.mercados[0].mercado)}: {resumoLista.mercados[0].itens} de {pendentes.length} itens em
                oferta · {brl(resumoLista.mercados[0].total)}
              </span>
            </span>
            <span className="text-[18px] text-text-3" aria-hidden>⌄</span>
          </button>
        )}
        {(!trip || ondeAberto) && mercadosComOferta.length > 0 && (
          <div className="rounded-[18px] border border-border bg-card p-3.5">
            {trip && (
              <button onClick={() => setOndeAberto(false)} className="float-right -mt-1 h-8 px-2 text-[13px] font-bold text-text-3">
                Fechar
              </button>
            )}
            {resumoLista.mercados[0] && (() => {
              const m0 = resumoLista.mercados[0];
              const pct = pendentes.length ? Math.min(1, m0.itens / pendentes.length) : 0;
              return (
                <div className="flex items-center gap-3">
                  {/* Anel: quanto da lista esta em oferta no melhor mercado, sem precisar ler. */}
                  <div className="relative h-14 w-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden>
                      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--card-2)" strokeWidth="5" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${Math.max(pct * 94.2, 3)} 94.2`} />
                    </svg>
                    <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold tabular-nums">
                      {m0.itens}/{pendentes.length}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-text-2">em oferta</div>
                    <div className="truncate text-[18px] font-extrabold">🏆 {nomeMercado(m0.mercado)}</div>
                  </div>
                </div>
              );
            })()}
            <div className="mt-3 flex flex-col gap-1.5">
              {(() => { const maxItens = Math.max(1, ...resumoLista.mercados.map((x) => x.itens)); return resumoLista.mercados
                .filter((m) => m.itens > 0)
                .map((m, i) => {
                  const on = filtro === m.mercado;
                  return (
                    <button
                      key={m.mercado}
                      onClick={() => setMercadoAberto(m.mercado)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-[13px] border-2 px-3 py-2 text-left ${on ? "" : "border-border"}`}
                      style={on ? { borderColor: corMercado(m.mercado), background: `${corMercado(m.mercado)}14` } : undefined}
                    >
                      <span
                        className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-extrabold text-white"
                        style={{ background: corMercado(m.mercado) }}
                      >
                        {nomeMercado(m.mercado)}
                      </span>
                      {/* Barra = quantos itens da lista saem em oferta aqui. */}
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-card-2">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.max(8, (m.itens / maxItens) * 100)}%`, background: corMercado(m.mercado) }}
                          />
                        </span>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-text-2">{m.itens}</span>
                      </span>
                      <span className="text-[15px] font-extrabold tabular-nums">{brl(m.total)}</span>
                      {i === 0 && <span className="text-[16px]" aria-hidden>🏆</span>}
                      <span className="text-[18px] text-text-3" aria-hidden>
                        ›
                      </span>
                    </button>
                  );
                }); })()}
            </div>
            {resumoLista.itens.some((x) => !x.opcoes.length) && (
              // Recolhido: a lista inteira so aparece se a pessoa quiser ver.
              <details className="group mt-2.5">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full bg-card-2 px-3 text-[13px] font-bold text-text-2 [&::-webkit-details-marker]:hidden">
                  🏷️ {resumoLista.itens.filter((x) => !x.opcoes.length).length} sem oferta
                  <span className="transition-transform group-open:rotate-180" aria-hidden>⌄</span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resumoLista.itens
                    .filter((x) => !x.opcoes.length)
                    .map((x) => (
                      <span key={x.item.nome} className="max-w-full truncate rounded-full border border-border px-2.5 py-1 text-[12px] capitalize text-text-2">
                        {x.item.nome}
                      </span>
                    ))}
                </div>
              </details>
            )}
            <button
              onClick={() => setRotaAberta(true)}
              className="mt-3 h-12 w-full rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              🗺️ Montar rota da compra
            </button>
            {filtro && (
              <p className="mt-2 text-[13px] text-text-2">
                Na ordem dos corredores.
                {escondidos > 0 && (
                  <>
                    {" "}
                    {escondidos} {escondidos > 1 ? "itens estão" : "item está"} mais barato em outro mercado.{" "}
                    <button onClick={() => setOndeVou(null)} className="font-bold text-brand underline">
                      Ver tudo
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {trip && pendentes.length > 0 && (
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[18px] font-extrabold">📝 Falta pegar</h2>
            <span className="text-[13px] font-bold text-text-2">
              {pendentes.length} {pendentes.length > 1 ? "itens" : "item"} · na ordem dos corredores
            </span>
          </div>
        )}
        {shopping.filter((i) => i.status !== "removed").length > 0 && (
          <div className="relative">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar item da lista..."
              className="h-[44px] w-full rounded-[12px] border border-border bg-card pl-[42px] pr-4 text-[14px]"
            />
          </div>
        )}

        {dataReady && shopping.filter((i) => i.status !== "removed").length === 0 && (
          <p className="pt-8 text-center text-[15px] leading-relaxed text-text-3">
            Sua lista está vazia. Use os botões aqui embaixo: <b>Falar</b> o que
            precisa, ler o <b>Código</b> da embalagem ou tirar <b>Foto</b> do produto.
          </p>
        )}

        <ul className="space-y-2.5 lg:space-y-0 lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-border lg:bg-card lg:shadow-[0_2px_12px_var(--shadow)] empty:hidden">
          {visible.map((i) => {
            const bought = i.status === "bought";
            const price = i.estimated_price ?? 0;
            const jaTenho = !bought && i.em_estoque;
            return (
              <li
                key={i.id}
                className={`flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-3 shadow-[0_1px_3px_var(--shadow)] lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:px-5 lg:py-[15px] lg:shadow-none ${
                  bought ? "opacity-60" : ""
                }`}
              >
                {/* No mercado o "Peguei" faz o papel da caixinha: ela sai e o nome ganha espaco. */}
                <button
                  onClick={() => !bought && comprar(i.id)}
                  disabled={bought || busy === i.id}
                  aria-label={bought ? "Comprado" : "Marcar como comprado"}
                  className={`${trip && !bought ? "hidden" : "grid"} h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border-2 ${
                    bought
                      ? "border-brand bg-brand text-brand-ink"
                      : "border-border text-transparent"
                  }`}
                >
                  <CheckIcon size={14} />
                </button>
                <FotoItem nome={i.name} className="h-10 w-10 rounded-lg" />
                {/* Clicar no corpo abre as acoes: comprei, baixa (se ja tenho), tirar */}
                <button
                  onClick={() => !bought && setAction(i)}
                  disabled={bought}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className={`font-bold ${bought ? "text-text-3 line-through" : ""}`}>
                    {i.name}
                    {livelo?.fixos.includes(i.name.trim().toLowerCase()) && (
                      <span className="ml-1 text-[13px]" title="Fixo do mês">
                        ⭐
                      </span>
                    )}
                    {jaTenho && (
                      <span className="mt-0.5 block w-fit rounded-full bg-pos-soft px-2 py-[1px] text-[11px] font-bold text-pos">
                        já tem em casa
                      </span>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-[13px] text-text-3">
                    {i.desired_quantity} {i.unit}
                    {price > 0 && i.desired_quantity !== 1 && ` × ${brl(price)}`}
                  </div>
                  {!bought &&
                    (() => {
                      const o = maisBarataPara(ofertas, i.name);
                      return (
                        o && (
                          <div
                            title={`Em oferta no ${nomeMercado(o.mercado)}`}
                            className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-bold text-white"
                            style={{ background: corMercado(o.mercado) }}
                          >
                            <span className="whitespace-nowrap">
                              {nomeMercado(o.mercado)} {brl(o.preco_por)}
                            </span>
                          </div>
                        )
                      );
                    })()}
                </button>
                {/* Com compra aberta, o alvo grande da linha e "Peguei". Sem
                    compra, continua sendo o valor, que e a informacao da lista. */}
                {/* Valor (ou Peguei) e o X empilhados: o nome e a oferta ganham a largura. */}
                <div className="flex shrink-0 flex-col items-end">
                <button
                  onClick={() => remover(i.id)}
                  disabled={busy === i.id}
                  aria-label="Remover"
                  className="-mr-1.5 -mt-1.5 grid h-8 w-8 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card-2"
                >
                  ×
                </button>
                {!bought && trip ? (
                  <button
                    onClick={() => peguei(i)}
                    disabled={busy === i.id}
                    className="h-11 shrink-0 rounded-[12px] bg-brand px-3.5 text-[14px] font-bold text-brand-ink disabled:opacity-50"
                  >
                    Peguei
                  </button>
                ) : (
                  !jaTenho &&
                  price > 0 && (
                    <span className="shrink-0 whitespace-nowrap text-[16px] font-extrabold tabular-nums">
                      {brl(i.desired_quantity * price)}
                    </span>
                  )
                )}
                </div>
              </li>
            );
          })}
        </ul>
        {shopping.filter((i) => i.status !== "removed").length > 0 &&
          visible.length === 0 && (
            <p className="pt-6 text-center text-text-3">Nenhum item encontrado.</p>
          )}

        {/* Respiro para a barra fixa do rodape nao cobrir o ultimo item. */}
        <div className="h-[104px] lg:hidden" />
      </div>

      <QuickBar />
      {addManualOpen && <AddItemModal open onClose={() => setAddManualOpen(false)} />}
      {fotoOpen && (
        <FotoModal
          onClose={() => setFotoOpen(false)}
          onDigitar={() => {
            setFotoOpen(false);
            setAddManualOpen(true);
          }}
        />
      )}
      {scanOpen && <BarcodeModal open onClose={() => setScanOpen(false)} />}
      {rotaAberta && <RotaModal onClose={() => setRotaAberta(false)} />}
      {mercadoAberto && (
        <MercadoModal
          mercado={mercadoAberto}
          itens={itensDoMercado(mercadoAberto)}
          filtrando={filtro === mercadoAberto}
          onFiltrar={() => setOndeVou(filtro === mercadoAberto ? null : mercadoAberto)}
          onClose={() => setMercadoAberto(null)}
        />
      )}
      {montar && <MontarLista onClose={() => setMontar(false)} />}
      <VoiceModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      <ListItemActions
        key={action?.id}
        item={action}
        onClose={() => setAction(null)}
        onComprar={comprar}
        onRemover={remover}
      />
    </>
  );
}
