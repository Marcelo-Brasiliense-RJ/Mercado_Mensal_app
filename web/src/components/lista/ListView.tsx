"use client";

import { useEffect, useState } from "react";
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

export function ListView() {
  const { shopping, trip, buyItems, removeItems, addTripItem, showToast, reloadTrip } =
    useStore();
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Modo "No mercado" ao vivo: enquanto esta tela esta aberta, verifica a cada
  // 4s se ha compra aberta (ou novos itens) vinda do Telegram.
  // ponytail: polling; migrar pra Realtime do Supabase so se o atraso incomodar.
  useEffect(() => {
    reloadTrip();
    const id = setInterval(reloadTrip, 4000);
    return () => clearInterval(id);
  }, [reloadTrip]);

  const visible = shopping
    .filter((i) => i.status !== "removed")
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort(
      (a, b) =>
        (a.status === "bought" ? 1 : 0) - (b.status === "bought" ? 1 : 0),
    );
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
    showToast(r.ok ? "Comprado, estoque reposto" : r.erro);
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

        {shopping.filter((i) => i.status !== "removed").length === 0 && (
          <p className="pt-8 text-center text-[15px] leading-relaxed text-text-3">
            Sua lista está vazia. Use os botões aqui embaixo: <b>Falar</b> o que
            precisa, ler o <b>Código</b> da embalagem ou <b>Digitar</b> o item.
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
                <button
                  onClick={() => !bought && comprar(i.id)}
                  disabled={bought || busy === i.id}
                  aria-label={bought ? "Comprado" : "Marcar como comprado"}
                  className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border-2 ${
                    bought
                      ? "border-brand bg-brand text-brand-ink"
                      : "border-border text-transparent"
                  }`}
                >
                  <CheckIcon size={14} />
                </button>
                {/* Clicar no corpo abre as acoes: comprei, baixa (se ja tenho), tirar */}
                <button
                  onClick={() => !bought && setAction(i)}
                  disabled={bought}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className={`font-bold ${bought ? "text-text-3 line-through" : ""}`}>
                    {i.name}
                  </div>
                  <div className="text-[13px] text-text-3">
                    {i.desired_quantity} {i.unit} · {brl(price)}
                    {price > 0 && ` = ${brl(i.desired_quantity * price)}`}
                  </div>
                </button>
                {jaTenho && (
                  <span className="shrink-0 rounded-full bg-pos-soft px-2.5 py-[3px] text-[12px] font-bold text-pos">
                    já tenho
                  </span>
                )}
                {/* Com compra aberta, o alvo grande da linha e "Peguei". Sem
                    compra, continua sendo o valor, que e a informacao da lista. */}
                {!bought && trip ? (
                  <button
                    onClick={() => peguei(i)}
                    disabled={busy === i.id}
                    className="h-11 shrink-0 rounded-[12px] bg-brand px-3.5 text-[14px] font-bold text-brand-ink disabled:opacity-50"
                  >
                    Peguei
                  </button>
                ) : (
                  !jaTenho && (
                    <span className="shrink-0 text-[16px] font-extrabold">
                      {brl(i.desired_quantity * price)}
                    </span>
                  )
                )}
                <button
                  onClick={() => remover(i.id)}
                  disabled={busy === i.id}
                  aria-label="Remover"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card-2"
                >
                  ×
                </button>
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

      <QuickBar
        onVoice={() => setVoiceOpen(true)}
        onScan={() => setScanOpen(true)}
        onManual={() => setAddManualOpen(true)}
      />
      <AddItemModal open={addManualOpen} onClose={() => setAddManualOpen(false)} />
      <BarcodeModal open={scanOpen} onClose={() => setScanOpen(false)} />
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
