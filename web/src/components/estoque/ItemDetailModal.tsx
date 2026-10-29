"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FotoItem } from "@/components/ui/FotoItem";
import { categoriaDe } from "@/lib/categorias";
import { brl, stockRatio } from "@/lib/format";
import { ConfirmarExclusao } from "./ConfirmarExclusao";
import { useStore } from "@/lib/store";
import { BotaoFixo } from "@/components/ofertas/BotaoFixo";
import type { StockItem } from "@/lib/types";

// Quantidade em pt-BR sem casa decimal inutil: 1,5 kg e 2 un, nunca "1.5" nem "2,0".
const num = (n: number) => String(+n.toFixed(2)).replace(".", ",");

export function ItemDetailModal({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const {
    addStockToList,
    addStock,
    zerarStock,
    baixaStock,
    setPar,
    parSugerido,
    showToast,
  } = useStore();
  const [excluindo, setExcluindo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editPar, setEditPar] = useState(false);
  const [parTxt, setParTxt] = useState("");
  // Guarda o id junto: o modal e reaproveitado entre itens e a sugestao de um
  // nao pode aparecer no outro enquanto a nova nao chega.
  const [sug, setSug] = useState<{ id: string; valor: number } | null>(null);

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) return;
    let vivo = true;
    parSugerido(itemId).then((s) => {
      if (vivo && s) setSug({ id: itemId, valor: s.sugerido });
    });
    return () => {
      vivo = false;
    };
  }, [itemId, parSugerido]);

  function fechar() {
    setEditPar(false);
    setParTxt("");
    onClose();
  }
  if (!item) return null;

  // par_level 0 significa "ninguem definiu", nao "acabou": stockRatio devolve 1
  // nesse caso, entao mostrar a barra pintaria 100% para um dado que nao existe.
  const semReferencia = item.normal <= 0;
  const ratio = stockRatio(item.current, item.normal);
  const repor = !semReferencia && ratio < 0.5;
  const sugestao = sug && sug.id === item.id ? sug.valor : null;
  const mostrarSugestao = sugestao !== null && sugestao !== item.normal;
  const parDigitado = parTxt.trim() === "" ? NaN : Number(parTxt.replace(",", "."));
  const barColor = repor ? "var(--warn)" : "var(--pos)";
  const trendUp = item.trend > 0;
  const trendLabel = `${trendUp ? "+" : ""}${Math.round(item.trend * 100)}%`;

  async function add() {
    const r = await addStockToList(item!);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} adicionado à lista`);
    fechar();
  }

  // Quanto a pessoa costuma ter em casa. O aviso de "Repor" dispara na metade
  // disto (stockRatio < 0.5), por isso a mensagem fala da metade, e nao do valor.
  async function salvarPar(valor: number) {
    setBusy(true);
    const r = await setPar(item!.id, valor);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditPar(false);
    showToast(
      valor > 0
        ? `Avisamos quando ${item!.name} cair abaixo de ${num(valor / 2)} ${item!.unit}`
        : `Aviso de ${item!.name} desligado`,
    );
  }

  async function baixaTotal() {
    setBusy(true);
    const r = await zerarStock([item!.id]);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: acabou`, { desfazer: true });
    fechar();
  }

  // Atalho do caso mais comum: gastou parte e nao quer digitar. Arredonda em
  // 3 casas pra nao gerar dizima em unidade fracionada (kg, L).
  async function usouMetade() {
    const n = +(item!.current / 2).toFixed(3);
    if (n <= 0) return;
    setBusy(true);
    const r = await baixaStock(item!.id, n);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: baixa de ${n} ${item!.unit}`, { desfazer: true });
    fechar();
  }

  // Repor: volta o item ao nivel normal (soma no estoque, sem virar compra).
  // Serve pra desfazer baixa acidental sem re-cadastrar o item.
  async function repor_() {
    const falta = Math.max(1, +(item!.normal - item!.current).toFixed(3));
    setBusy(true);
    const r = await addStock({ name: item!.name, qty: falta, unit: item!.unit });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} reposto no estoque`, { desfazer: true });
    fechar();
  }

  return (
    <Modal open={!!item} onClose={fechar}>
      {/* Compacto: cabe numa tela sem rolar. Foto, nivel, precos e as acoes. */}
      <div className="mb-3 flex items-center gap-3 pr-12">
        <FotoItem nome={item.name} className="h-[72px] w-[72px] rounded-2xl border border-border" />
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-extrabold capitalize leading-tight">{item.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-text-2">
            <span
              className={`rounded-full px-2 py-[2px] font-bold ${repor ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos"}`}
            >
              {repor ? "Repor" : "Em casa"}
            </span>
            {item.category || categoriaDe(item.name)}
            <BotaoFixo nome={item.name} />
          </div>
        </div>
      </div>

      <div className="mb-2.5 rounded-[14px] bg-card-2 p-3">
        <div className="flex items-baseline justify-between text-[14px]">
          <span>
            Tem <b>{num(item.current)} {item.unit}</b>
            {!semReferencia && (
              <span className="text-text-2">
                {" "}
                de {num(item.normal)}
              </span>
            )}
          </span>
          {!editPar && (
            <button
              type="button"
              onClick={() => {
                setParTxt(item.normal > 0 ? num(item.normal) : "");
                setEditPar(true);
              }}
              className="text-[12px] font-bold text-brand underline underline-offset-2"
            >
              {semReferencia ? "Quanto costuma ter?" : "Mudar o normal"}
            </button>
          )}
        </div>
        {!semReferencia && (
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%`, background: barColor }}
            />
          </div>
        )}
        {mostrarSugestao && (
          <button
            type="button"
            onClick={() => salvarPar(sugestao)}
            disabled={busy}
            className="mt-2 w-full rounded-[10px] border-[1.5px] border-brand bg-card px-3 py-2 text-left text-[12px] leading-snug disabled:opacity-50"
          >
            <b>Você costuma comprar {num(sugestao)} {item.unit}.</b> Usar como normal?
          </button>
        )}
        {editPar && (
          <div className="mt-2 flex gap-2">
            <input
              value={parTxt}
              onChange={(e) => setParTxt(e.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder={`Quanto costuma ter? (${item.unit})`}
              className="h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-card px-3 text-[16px]"
            />
            <button
              type="button"
              onClick={() => salvarPar(parDigitado)}
              disabled={busy || !Number.isFinite(parDigitado) || parDigitado < 0}
              className="h-11 shrink-0 rounded-[12px] bg-brand px-4 text-[14px] font-bold text-brand-ink disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-[13px] text-text-2">
          <span>
            Último <b className="text-text">{brl(item.priceLast ?? 0)}</b>
          </span>
          <span>
            Média <b className="text-text">{brl(item.priceAvg ?? 0)}</b>{" "}
            <span className={`font-bold ${trendUp ? "text-neg" : "text-pos"}`}>{trendLabel}</span>
          </span>
        </div>
      </div>

      {/* Baixa por consumo: dois atalhos, sem teclado */}
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={usouMetade}
          disabled={busy || item.current <= 0}
          className="h-11 rounded-[12px] border border-warn bg-card text-[13px] font-bold text-warn disabled:opacity-50"
        >
          Usei metade
        </button>
        <button
          onClick={baixaTotal}
          disabled={busy || item.current <= 0}
          className="h-11 rounded-[12px] bg-warn text-[13px] font-bold text-white disabled:opacity-50"
        >
          Acabou
        </button>
      </div>

      <div data-rodape className="flex gap-2">
        {/* Repor: volta ao normal sem virar compra (desfaz baixa errada). */}
        {item.current < item.normal && (
          <button
            onClick={repor_}
            disabled={busy}
            className="h-[50px] flex-1 rounded-[14px] bg-pos text-[14px] font-bold text-white disabled:opacity-50"
          >
            Repor ao normal
          </button>
        )}
        <button onClick={add} className="h-[50px] flex-[1.3] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink">
          + Lista
        </button>
      </div>
      <button onClick={() => setExcluindo(true)} className="mt-1.5 h-9 w-full text-[13px] font-bold text-neg underline">
        Excluir do estoque
      </button>
      {excluindo && item && <ConfirmarExclusao itens={[item]} onClose={() => setExcluindo(false)} onFeito={fechar} />}
    </Modal>
  );
}
