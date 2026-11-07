"use client";

import { brl } from "@/lib/format";
import { stepFor } from "@/lib/defaults";
import type { ShopItem, TripItem } from "@/lib/types";
import type { LinhaPego } from "@/lib/modoMercado";
import { CartIcon, CheckIcon } from "@/components/ui/icons";
import { FotoItem } from "@/components/ui/FotoItem";

// As linhas da listagem do modo mercado. Cada estado tem cor e icone proprios, para a
// pessoa saber sem ler: laranja = falta pegar, verde = peguei, amarelo = peguei menos
// do que a lista pedia, cinza = pego fora da lista.

const qtdTxt = (n: number) => String(+n.toFixed(3)).replace(".", ",");

// Card de foto da aba "Falta": tocar no produto = peguei. Grade de 3 por linha no
// celular para bater o olho em muitos itens de uma vez (lista de 70 itens). Com
// `resto`, e o item que foi pego em quantidade menor do que a lista pedia.
export function CardFalta({
  nome,
  qtd,
  unidade,
  preco,
  emCasa,
  resto,
  pegando,
  onPegar,
}: {
  nome: string;
  qtd: number;
  unidade: string;
  preco: number | null;
  emCasa?: boolean;
  resto?: boolean;
  pegando: boolean;
  onPegar: () => void;
}) {
  return (
    <li className={`transition-all duration-300 ${pegando ? "scale-90 opacity-0" : "scale-100 opacity-100"}`}>
      <button
        onClick={onPegar}
        disabled={pegando}
        aria-label={resto ? `Pegar o resto de ${nome}` : `Peguei ${nome}`}
        className={`relative flex h-full w-full flex-col items-center rounded-[16px] border-2 bg-card px-1.5 pb-2 pt-2.5 text-center shadow-[0_1px_4px_var(--shadow)] transition-transform active:scale-95 ${
          resto ? "border-warn bg-warn-soft" : "border-transparent"
        }`}
      >
        <FotoItem nome={nome} className="h-[60px] w-[60px] rounded-xl" />
        <span className="mt-1.5 line-clamp-2 min-h-[2.5em] w-full text-[13px] font-bold leading-[1.25]">{nome}</span>
        <span className={`mt-0.5 text-[12px] font-bold ${resto ? "text-warn" : "text-text-3"}`}>
          {resto ? `faltam ${qtdTxt(qtd)} ${unidade}` : `${qtdTxt(qtd)} ${unidade}`}
          {!resto && preco ? ` · ${brl(qtd * preco)}` : ""}
        </span>
        {emCasa && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-pos-soft px-1.5 text-[10px] font-extrabold text-pos">
            tem em casa
          </span>
        )}
        <span
          className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full ${
            resto ? "bg-warn text-warn-ink" : "bg-brand text-brand-ink"
          }`}
          aria-hidden
        >
          <CartIcon size={15} />
        </span>
        {pegando && (
          <span className="absolute inset-0 grid place-items-center rounded-[14px] bg-pos/85 text-white">
            <CheckIcon size={34} />
          </span>
        )}
      </button>
    </li>
  );
}

// No carrinho: quantidade com − e + na propria linha (sem abrir popup), valor grande,
// e o comparativo com a lista (preco pesquisado e quantidade pedida).
export function LinhaCarrinho({
  t,
  pego,
  fora,
  busy,
  onQtd,
  onEditar,
  onResto,
}: {
  t: TripItem;
  pego?: LinhaPego;
  fora: boolean;
  busy: boolean;
  onQtd: (q: number) => void;
  onEditar: () => void;
  onResto?: () => void;
}) {
  const passo = stepFor(t.unit);
  const parcial = !!pego && pego.faltaQtd > 0;
  const borda = fora ? "border-l-text-3" : parcial ? "border-l-warn" : "border-l-pos";
  const fundo = fora ? "bg-card" : parcial ? "bg-warn-soft/60" : "bg-pos-soft/60";
  return (
    <li className={`rounded-[16px] border border-border border-l-[5px] ${borda} ${fundo} p-2.5`}>
      <div className="flex items-center gap-3">
        <button onClick={onEditar} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-white ${
              fora ? "bg-text-3" : parcial ? "bg-warn" : "bg-pos"
            }`}
          >
            {fora ? <span className="text-[20px] font-extrabold">+</span> : <CheckIcon size={22} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">{t.name}</span>
            <span className="block text-[13px] text-text-2">
              {brl(t.unit_price)}/{t.unit} ·{" "}
              <b className="tabular-nums text-text">{brl(t.quantity * t.unit_price)}</b>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center rounded-[12px] border border-border bg-card">
          <button
            onClick={() => onQtd(+(t.quantity - passo).toFixed(3))}
            disabled={busy}
            aria-label={`Menos ${t.name}`}
            className="grid h-10 w-9 place-items-center text-[20px] font-bold text-text-2 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[30px] text-center text-[15px] font-extrabold tabular-nums">{qtdTxt(t.quantity)}</span>
          <button
            onClick={() => onQtd(+(t.quantity + passo).toFixed(3))}
            disabled={busy}
            aria-label={`Mais ${t.name}`}
            className="grid h-10 w-9 place-items-center text-[20px] font-bold text-brand disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      {(fora || parcial || (pego?.diffPreco != null && Math.abs(pego.diffPreco) >= 0.01)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[60px] text-[12px] font-bold">
          {fora && <span className="rounded-full bg-card-2 px-2 py-[2px] text-text-2">➕ fora da lista</span>}
          {parcial && (
            <>
              <span className="rounded-full bg-warn-soft px-2 py-[2px] text-warn">
                pegou {qtdTxt(t.quantity)} de {qtdTxt(pego!.item.desired_quantity)} {t.unit}
              </span>
              {onResto && (
                <button onClick={onResto} disabled={busy} className="rounded-full bg-warn px-2.5 py-[3px] text-warn-ink">
                  + pegar o resto
                </button>
              )}
            </>
          )}
          {pego?.diffPreco != null && Math.abs(pego.diffPreco) >= 0.01 && (
            <span
              className={`rounded-full px-2 py-[2px] ${pego.diffPreco > 0 ? "bg-neg-soft text-neg" : "bg-pos-soft text-pos"}`}
            >
              {pego.diffPreco > 0 ? `▲ ${brl(pego.diffPreco)} mais caro` : `▼ ${brl(-pego.diffPreco)} mais barato`} que o
              pesquisado
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// Item da lista coberto por outra marca ("e o mesmo?" respondido com sim).
export function LinhaTroca({ item, por, onDesfazer }: { item: ShopItem; por: string; onDesfazer: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-[16px] border border-border border-l-[5px] border-l-pos bg-card-2 p-2.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-pos-soft text-[22px]" aria-hidden>
        🔄
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-text-3 line-through">{item.name}</div>
        <div className="truncate text-[13px] font-bold text-pos">trocado por {por}</div>
      </div>
      <button onClick={onDesfazer} className="h-10 shrink-0 rounded-[10px] px-2 text-[13px] font-bold text-text-3">
        Desfazer
      </button>
    </li>
  );
}
