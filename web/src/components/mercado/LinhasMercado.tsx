"use client";

import { brl } from "@/lib/format";
import { stepFor } from "@/lib/defaults";
import type { ShopItem, TripItem } from "@/lib/types";
import type { LinhaPego } from "@/lib/modoMercado";
import { CartIcon, CheckIcon } from "@/components/ui/icons";
import { FotoItem } from "@/components/ui/FotoItem";

// Linhas do modo mercado, DENSAS de proposito: compra do mes tem 50, 70, 100 itens, e
// cada pixel de altura vira rolagem no corredor. Cor e icone dizem o estado sem ler:
// laranja = falta pegar, verde = peguei, amarelo = peguei menos do que a lista pedia,
// cinza = pego fora da lista.

const qtdTxt = (n: number) => String(+n.toFixed(3)).replace(".", ",");

type Falta = {
  nome: string;
  qtd: number;
  unidade: string;
  preco: number | null;
  emCasa?: boolean;
  resto?: boolean; // pegou menos do que a lista pedia: tocar completa
  pegando: boolean;
  onPegar: () => void;
};

// Grade: 4 por linha no celular. Tocar no produto = peguei.
export function CardFalta({ nome, qtd, unidade, preco, emCasa, resto, pegando, onPegar }: Falta) {
  return (
    <li className={`transition-all duration-300 ${pegando ? "scale-90 opacity-0" : "scale-100 opacity-100"}`}>
      <button
        onClick={onPegar}
        disabled={pegando}
        aria-label={resto ? `Pegar o resto de ${nome}` : `Peguei ${nome}`}
        className={`relative flex h-full w-full flex-col items-center rounded-[14px] border-2 bg-card px-1 pb-1.5 pt-2 text-center shadow-[0_1px_3px_var(--shadow)] transition-transform active:scale-95 ${
          resto ? "border-warn bg-warn-soft" : "border-transparent"
        }`}
      >
        <FotoItem nome={nome} className="h-11 w-11 rounded-lg" />
        <span className="mt-1 line-clamp-2 min-h-[2.4em] w-full text-[12px] font-bold leading-[1.2]">{nome}</span>
        <span className={`text-[11px] font-bold leading-tight ${resto ? "text-warn" : "text-text-3"}`}>
          {resto ? `falta ${qtdTxt(qtd)}` : `${qtdTxt(qtd)} ${unidade}`}
        </span>
        {!resto && preco ? (
          <span className="text-[11px] font-bold leading-tight tabular-nums text-text-2">{brl(qtd * preco)}</span>
        ) : null}
        {emCasa && <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-pos ring-2 ring-card" title="tem em casa" />}
        {pegando && (
          <span className="absolute inset-0 grid place-items-center rounded-[12px] bg-pos/85 text-white">
            <CheckIcon size={28} />
          </span>
        )}
      </button>
    </li>
  );
}

// Lista: uma linha de ~48px por produto, nome inteiro legivel. Tocar na linha = peguei.
export function LinhaFaltaCompacta({ nome, qtd, unidade, preco, emCasa, resto, pegando, onPegar }: Falta) {
  return (
    <li className={`transition-all duration-300 ${pegando ? "opacity-0" : "opacity-100"}`}>
      <button
        onClick={onPegar}
        disabled={pegando}
        aria-label={resto ? `Pegar o resto de ${nome}` : `Peguei ${nome}`}
        className={`relative flex min-h-[48px] w-full items-center gap-2.5 px-2.5 py-1 text-left active:bg-card-2 ${resto ? "bg-warn-soft" : ""}`}
      >
        <FotoItem nome={nome} className="h-9 w-9 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">
            {emCasa && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-pos align-middle" title="tem em casa" />}
            {nome}
          </span>
          <span className={`block text-[12px] font-bold leading-tight ${resto ? "text-warn" : "text-text-3"}`}>
            {resto ? `pegou menos · falta ${qtdTxt(qtd)} ${unidade}` : `${qtdTxt(qtd)} ${unidade}`}
            {!resto && preco ? ` · ${brl(qtd * preco)}` : ""}
          </span>
        </span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${resto ? "bg-warn text-warn-ink" : "bg-brand text-brand-ink"}`}
          aria-hidden
        >
          {pegando ? <CheckIcon size={18} /> : <CartIcon size={17} />}
        </span>
      </button>
    </li>
  );
}

// No carrinho: UMA linha. Icone do estado, nome, detalhe colorido (parcial, preco x
// pesquisado, fora da lista), − / + e o valor. Tocar no nome abre o editar.
export function LinhaCarrinho({
  t,
  pego,
  fora,
  busy,
  onQtd,
  onEditar,
}: {
  t: TripItem;
  pego?: LinhaPego;
  fora: boolean;
  busy: boolean;
  onQtd: (q: number) => void;
  onEditar: () => void;
}) {
  const passo = stepFor(t.unit);
  const parcial = !!pego && pego.faltaQtd > 0;
  const diff = pego?.diffPreco != null && Math.abs(pego.diffPreco) >= 0.01 ? pego.diffPreco : null;
  return (
    <li className={`flex min-h-[52px] items-center gap-1.5 px-2 py-1 ${parcial ? "bg-warn-soft/60" : ""}`}>
      <button onClick={onEditar} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${
            fora ? "bg-text-3" : parcial ? "bg-warn" : "bg-pos"
          }`}
          aria-label={fora ? "fora da lista" : parcial ? "pegou menos que a lista" : "da lista"}
        >
          {fora ? <span className="text-[17px] font-extrabold leading-none">+</span> : <CheckIcon size={16} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-tight">{t.name}</span>
          {/* Linha 2 so com o que muda a decisao: preco unitario quando leva mais de 1,
              quanto da lista ja pegou e a diferenca para o pesquisado. */}
          <span className="block truncate text-[12px] font-bold leading-tight text-text-3">
            {t.quantity !== 1 ? `${brl(t.unit_price)}/${t.unit}` : fora ? "fora da lista" : "da lista"}
            {parcial && <span className="text-warn"> · {qtdTxt(t.quantity)} de {qtdTxt(pego!.item.desired_quantity)}</span>}
            {diff != null && (
              <span className={diff > 0 ? "text-neg" : "text-pos"}>
                {" "}
                · {diff > 0 ? "▲" : "▼"}
                {Math.abs(diff).toFixed(2).replace(".", ",")}
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center rounded-[10px] border border-border bg-card">
        <button
          onClick={() => onQtd(+(t.quantity - passo).toFixed(3))}
          disabled={busy}
          aria-label={`Menos ${t.name}`}
          className="grid h-9 w-7 place-items-center text-[18px] font-bold text-text-2 disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[20px] text-center text-[14px] font-extrabold tabular-nums">{qtdTxt(t.quantity)}</span>
        <button
          onClick={() => onQtd(+(t.quantity + passo).toFixed(3))}
          disabled={busy}
          aria-label={`Mais ${t.name}`}
          className="grid h-9 w-7 place-items-center text-[18px] font-bold text-brand disabled:opacity-40"
        >
          +
        </button>
      </div>
      <span className="w-[64px] shrink-0 text-right text-[14px] font-extrabold tabular-nums">{brl(t.quantity * t.unit_price)}</span>
    </li>
  );
}

// Item da lista coberto por outra marca ("e o mesmo?" respondido com sim).
export function LinhaTroca({ item, por, onDesfazer }: { item: ShopItem; por: string; onDesfazer: () => void }) {
  return (
    <li className="flex min-h-[48px] items-center gap-2.5 px-2.5 py-1">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pos-soft text-[16px]" aria-hidden>
        🔄
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight text-text-3 line-through">{item.name}</span>
        <span className="block truncate text-[12px] font-bold leading-tight text-pos">trocado por {por}</span>
      </span>
      <button onClick={onDesfazer} className="h-9 shrink-0 rounded-[10px] px-2 text-[13px] font-bold text-text-3">
        Desfazer
      </button>
    </li>
  );
}
