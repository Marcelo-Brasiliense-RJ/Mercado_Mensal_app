"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { unitFor, findByName } from "@/lib/defaults";

// Painel do modo "No mercado". Ate a 0026 a compra so podia ser aberta e
// alimentada pelo Telegram, e o painel era inalcancavel sem o bot. Agora o ciclo
// inteiro cabe aqui: abrir, pegar, tirar engano, desistir e finalizar.
export function CartPanel() {
  const {
    trip,
    shopping,
    stock,
    startTrip,
    addTripItem,
    cancelTrip,
    updateTripItem,
    finalizeTrip,
    removeTripItem,
    showToast,
  } = useStore();
  const [busy, setBusy] = useState(false);
  // Edicao de item que ja esta no carrinho. O preco falado erra com frequencia
  // (a etiqueta e da embalagem e a transcricao come a virgula), entao corrigir
  // na hora e o gesto mais comum de todos.
  const [editId, setEditId] = useState<string | null>(null);
  const [eQtd, setEQtd] = useState("");
  const [ePreco, setEPreco] = useState("");

  async function salvarItem(id: string) {
    const q = Number(eQtd.replace(",", "."));
    const p = Number(ePreco.replace(",", "."));
    if (!(q > 0) || !(p >= 0)) return showToast("Quantidade e preço precisam ser válidos.");
    setBusy(true);
    const r = await updateTripItem(id, { qty: q, price: p });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditId(null);
  }
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");

  // Regra 2 da entrada de dados: o campo nasce preenchido. Unidade pela palavra
  // do nome, preco pelo ultimo pago naquele item.
  const conhecido = findByName(nome, stock);
  const unidade = conhecido?.unit ?? unitFor(nome);

  function onNome(v: string) {
    setNome(v);
    const item = findByName(v, stock);
    setPreco(item?.priceLast != null ? String(item.priceLast) : "");
  }

  async function abrir() {
    setBusy(true);
    const r = await startTrip();
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast("Compra aberta. Vá anotando o que pegar.");
  }

  async function pegar() {
    if (!nome.trim()) return;
    setBusy(true);
    const r = await addTripItem({
      name: nome.trim(),
      // Sem preco digitado, o banco cai no ultimo preco pago; se o item nunca
      // foi comprado, ele responde sem_preco e o toast pede o valor.
      price: preco.trim() === "" ? null : Number(preco.replace(",", ".")) || 0,
      qty: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setNome("");
    setQtd("1");
    setPreco("");
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
      <div className="rounded-[20px] border border-border bg-card p-[18px] shadow-[0_1px_3px_var(--shadow)] lg:p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold">Vai ao mercado agora?</div>
            <div className="mt-0.5 text-[13px] leading-snug text-text-2">
              Abra a compra e vá anotando o que pegar, com o total subindo em tempo real.
            </div>
          </div>
          <button
            type="button"
            onClick={abrir}
            disabled={busy}
            className="h-[50px] shrink-0 rounded-[14px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50"
          >
            Estou no mercado
          </button>
        </div>
      </div>
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
    <div className="rounded-[20px] border-2 border-brand bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-brand">
            No mercado
          </div>
          <div className="mt-0.5 text-[13px] text-text-3">
            carrinho em andamento
          </div>
        </div>
        <div className="text-right">
          <div className="text-[34px] font-extrabold leading-none lg:text-[40px]">
            {brl(trip.total)}
          </div>
          <div className="mt-1 text-[12px] text-text-3">
            {trip.items.length} {trip.items.length === 1 ? "item" : "itens"} no
            carrinho
          </div>
        </div>
      </div>

      {trip.items.length === 0 ? (
        <p className="mt-4 text-[14px] leading-relaxed text-text-3">
          Carrinho aberto. Anote abaixo o que for pegando, ou fale no Telegram que
          aparece aqui.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {trip.items.map((it) => {
            const esp = estimado(it.name);
            const diff = esp != null ? it.unit_price - esp : null;
            return (
            <li
              key={it.id}
              className="rounded-[14px] border border-border bg-card-2 p-3"
            >
            {editId === it.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-bold">{it.name}</span>
                <input
                  value={eQtd}
                  onChange={(e) => setEQtd(e.target.value)}
                  inputMode="decimal"
                  aria-label="Quantidade"
                  className="h-11 w-16 rounded-[11px] border border-border bg-card px-2 text-center text-[14px]"
                />
                <span className="text-[12px] text-text-3">{it.unit} ×</span>
                <input
                  value={ePreco}
                  onChange={(e) => setEPreco(e.target.value)}
                  inputMode="decimal"
                  aria-label="Preço por unidade"
                  className="h-11 w-24 rounded-[11px] border border-border bg-card px-2 text-right text-[14px]"
                />
                <button
                  type="button"
                  onClick={() => salvarItem(it.id)}
                  disabled={busy}
                  className="h-11 shrink-0 rounded-[11px] bg-brand px-3.5 text-[14px] font-bold text-brand-ink disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="h-11 shrink-0 px-2 text-[13px] font-bold text-text-2"
                >
                  Cancelar
                </button>
              </div>
            ) : (
            <div className="flex items-center gap-3">
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
              <button
                type="button"
                onClick={() => {
                  setEditId(it.id);
                  setEQtd(String(it.quantity));
                  setEPreco(String(it.unit_price));
                }}
                className="h-11 shrink-0 px-1.5 text-[13px] font-bold text-brand"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await removeTripItem(it.id);
                  if (!r.ok) showToast(r.erro);
                }}
                aria-label="Tirar do carrinho"
                className="grid h-11 w-8 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card"
              >
                ×
              </button>
            </div>
            )}
            </li>
            );
          })}
        </ul>
      )}

      {/* Pegar item sem sair da tela. Preco em branco usa o ultimo pago. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pegar();
        }}
        className="mt-4 rounded-[14px] border border-border bg-card-2 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nome}
            onChange={(e) => onNome(e.target.value)}
            placeholder="O que você pegou?"
            aria-label="Item"
            className="h-12 min-w-0 flex-[2] rounded-[13px] border border-border bg-card px-3.5 text-[15px]"
          />
          <div className="min-w-[132px] flex-1">
            <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
          </div>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="preço"
            aria-label="Preço"
            className="h-12 w-[92px] shrink-0 rounded-[13px] border border-border bg-card px-3 text-right text-[15px]"
          />
          <button
            type="submit"
            disabled={busy || !nome.trim()}
            className="h-12 shrink-0 rounded-[13px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50"
          >
            Peguei
          </button>
        </div>
        <div className="mt-1.5 text-[12px] text-text-3">
          {conhecido?.priceLast != null
            ? `Em ${unidade}, com o preço da última compra já preenchido.`
            : `Em ${unidade}. Sem preço, usamos o da última compra desse item.`}
        </div>
      </form>

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
    </div>
  );
}
