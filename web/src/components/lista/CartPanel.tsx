"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { CartItemModal } from "./CartItemModal";
import { BarcodeIcon } from "@/components/ui/icons";
import type { TripItem } from "@/lib/types";
import { atualizarLugar, useLugar } from "@/lib/lugar";
import { nomeMercado } from "@/lib/ofertas";
import { QualMercado } from "./QualMercado";

// Painel do modo "No mercado". Ate a 0026 a compra so podia ser aberta e
// alimentada pelo Telegram, e o painel era inalcancavel sem o bot. Agora o ciclo
// inteiro cabe aqui: abrir, pegar, tirar engano, desistir e finalizar.
export function CartPanel({ onScan }: { onScan?: () => void }) {
  const {
    trip,
    shopping,
    budget,
    startTrip,
    cancelTrip,
    finalizeTrip,
    showToast,
  } = useStore();
  const [busy, setBusy] = useState(false);
  const { noMercado, mercado } = useLugar();
  // Item aberto no popup de editar. O preco falado erra com frequencia (a etiqueta
  // e da embalagem e a transcricao come a virgula), entao corrigir na hora e o
  // gesto mais comum de todos.
  const [editar, setEditar] = useState<TripItem | null>(null);

  async function abrir() {
    // Toque do "Estou no mercado": a hora de pedir a localizacao (o iPhone so pergunta
    // com gesto). Com ela, o app aprende esta loja e da proxima vez ja sabe sozinho.
    void atualizarLugar(true);
    setBusy(true);
    const r = await startTrip();
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast("Compra aberta. Vá anotando o que pegar.");
  }

  async function desistir() {
    if (!confirm("Cancelar esta compra? Os itens do carrinho são descartados.")) return;
    setBusy(true);
    const r = await cancelTrip();
    setBusy(false);
    showToast(r.ok ? "Compra cancelada" : r.erro);
  }

  // Sem compra aberta o painel nao some: e daqui que se comeca.
  if (!trip) {
    return (
      <>
      <QualMercado />
      <div
        className={`rounded-[20px] border bg-card p-[18px] shadow-[0_1px_3px_var(--shadow)] lg:p-[22px] ${
          noMercado ? "border-2 border-brand bg-brand-soft" : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold">
              {noMercado
                ? `📍 Parece que você está no ${mercado ? nomeMercado(mercado) : "mercado"}`
                : "Vai ao mercado agora?"}
            </div>
            <div className="mt-0.5 text-[13px] leading-snug text-text-2">
              {noMercado
                ? "Abra o carrinho: o que você ler ou falar já entra nele."
                : "Abra a compra e vá anotando o que pegar, com o total subindo em tempo real."}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {onScan && (
              <button
                type="button"
                onClick={onScan}
                aria-label="Ler código de barras"
                className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[14px] border border-border bg-card text-text-2"
              >
                <BarcodeIcon size={22} />
              </button>
            )}
            <button
              type="button"
              onClick={abrir}
              disabled={busy}
              className="h-[50px] shrink-0 rounded-[14px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {noMercado ? "Abrir carrinho" : "Estou no mercado"}
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Preco que a pessoa pesquisou/estimou na lista, por nome (compara com o do
  // carrinho pra mostrar se ta mais caro ou mais barato do que ela esperava).
  function estimado(name: string): number | null {
    const s = shopping.find(
      (x) => x.status !== "removed" && x.name.toLowerCase() === name.toLowerCase(),
    );
    return s?.estimated_price != null && s.estimated_price > 0
      ? s.estimated_price
      : null;
  }

  async function finalizar() {
    setBusy(true);
    const r = await finalizeTrip();
    setBusy(false);
    showToast(r.ok ? "Compra finalizada, estoque reposto" : r.erro);
  }

  return (
    <>
    <QualMercado />
    <div className="overflow-hidden rounded-[22px] border-2 border-brand bg-card shadow-[0_4px_16px_var(--shadow)]">
      {/* Topo do modo mercado: onde esta e quanto ja deu, grande, para bater o olho no corredor. */}
      <div className="bg-brand px-[18px] pb-4 pt-3.5 text-brand-ink">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[15px] font-extrabold">
            🛒 {noMercado && mercado ? `No ${nomeMercado(mercado)}` : "No mercado"}
          </div>
          <div className="text-[13px] font-bold opacity-90">
            {trip.items.length} {trip.items.length === 1 ? "item" : "itens"}
          </div>
        </div>
        <div className="mt-1 text-[42px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{brl(trip.total)}</div>
        {budget.total > 0 && (
          <div className="mt-1.5 text-[13px] font-bold opacity-90">
            {budget.total - budget.spent - trip.total >= 0
              ? `Ainda cabem ${brl(budget.total - budget.spent - trip.total)} no orçamento do mês`
              : `Passa ${brl(-(budget.total - budget.spent - trip.total))} do orçamento do mês`}
          </div>
        )}
      </div>
      <div className="p-[18px] pt-3.5">
      {trip.items.length === 0 ? (
        <p className="text-[14px] leading-relaxed text-text-2">
          Leia o <b>Código</b> ou <b>Fale</b> o que pegou (botões embaixo). O total sobe aqui na hora.
        </p>
      ) : (
        <ul className="space-y-2">
          <li className="text-[12px] font-bold uppercase tracking-wide text-text-3">No carrinho</li>
          {trip.items.map((it) => {
            const esp = estimado(it.name);
            const diff = esp != null ? it.unit_price - esp : null;
            return (
            <li key={it.id}>
              {/* A linha inteira abre o popup de editar: alvo grande erra menos
                  com o celular na mao dentro do mercado. */}
              <button
                type="button"
                onClick={() => setEditar(it)}
                className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-card-2 p-3 text-left"
              >
              <div className="min-w-0 flex-1">
                <div className="font-bold">{it.name}</div>
                <div className="text-[13px] text-text-3">
                  {it.quantity} {it.unit} · {brl(it.unit_price)}
                </div>
                {/* Comparativo: pesquisado (lista) x pagando (carrinho) */}
                {diff !== null && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] font-bold">
                    <span className="text-text-3">
                      Pesquisado {brl(esp!)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-[2px] ${
                        diff > 0.005
                          ? "bg-neg-soft text-neg"
                          : diff < -0.005
                            ? "bg-pos-soft text-pos"
                            : "bg-card text-text-3"
                      }`}
                    >
                      {diff > 0.005
                        ? `+${brl(diff)} mais caro`
                        : diff < -0.005
                          ? `${brl(diff)} mais barato`
                          : "no preço"}
                    </span>
                  </div>
                )}
              </div>
              {it.above_par && (
                <span className="shrink-0 rounded-full bg-pos-soft px-2.5 py-[3px] text-[12px] font-bold text-pos">
                  já tinha
                </span>
              )}
              <span className="shrink-0 text-[16px] font-extrabold">
                {brl(it.quantity * it.unit_price)}
              </span>
              <span className="shrink-0 text-[13px] font-bold text-brand">
                Editar
              </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={desistir}
          disabled={busy}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold text-text-2 disabled:opacity-50"
        >
          Cancelar compra
        </button>
        <button
          type="button"
          onClick={finalizar}
          disabled={busy || trip.items.length === 0}
          className="h-[50px] flex-[2] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Finalizando…" : "Finalizar compra"}
        </button>
      </div>

      <CartItemModal item={editar} onClose={() => setEditar(null)} />
      </div>
    </div>
    </>
  );
}
