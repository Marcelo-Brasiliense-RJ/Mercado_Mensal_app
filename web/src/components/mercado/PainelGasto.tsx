"use client";

import Link from "next/link";
import { brl } from "@/lib/format";
import type { Conta, ResumoMercado } from "@/lib/modoMercado";

// Resumo do topo, compacto de proposito: com 70 itens na lista, o painel grande ocupava
// a tela inteira e nenhum produto aparecia sem rolar (print do dono). Aqui cabe em
// ~130px: total, barra de quanto da lista ja foi e a situacao do orcamento numa linha.
// A cor da faixa muda sozinha: cabe (laranja), o resto nao cabe (amarelo), estourou (vermelho).
const COR: Record<Conta["tom"], string> = {
  ok: "bg-brand text-brand-ink",
  sem: "bg-brand text-brand-ink",
  atencao: "bg-warn text-warn-ink",
  estourou: "bg-neg text-neg-ink",
};

export function PainelGasto({ r, conta, titulo }: { r: ResumoMercado; conta: Conta; titulo: string }) {
  const n = Math.max(r.totalLista, 1);
  const ok = r.pegosLista - r.parciais; // pegos completos
  const frase =
    conta.tom === "sem"
      ? null
      : conta.tom === "estourou"
        ? `🚨 Passou ${brl(-(conta.sobraAgora ?? 0))} do orçamento`
        : (conta.sobraNoFim ?? 0) < 0
          ? `⚠️ Cabem ${brl(conta.sobraAgora ?? 0)} · o resto passa ${brl(-(conta.sobraNoFim ?? 0))}`
          : `✅ Cabem ${brl(conta.sobraAgora ?? 0)}${conta.falta > 0 ? ` · com o resto sobra ${brl(conta.sobraNoFim ?? 0)}` : " no orçamento"}`;

  return (
    <div className={`rounded-[22px] px-4 pb-2.5 pt-2.5 shadow-[0_4px_16px_var(--shadow)] transition-colors ${COR[conta.tom]}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold opacity-90">{titulo}</div>
          <div className="text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{brl(conta.carrinho)}</div>
        </div>
        {r.totalLista > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-[20px] font-extrabold leading-none tabular-nums">
              {r.pegosLista}
              <span className="text-[15px] opacity-80">/{r.totalLista}</span>
            </div>
            <div className="text-[11px] font-bold uppercase opacity-85">da lista</div>
          </div>
        )}
      </div>

      {r.totalLista > 0 && (
        // verde = pegou tudo do item; amarelo = pegou menos do que a lista pedia
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-black/15">
          <span className="h-full bg-current transition-[width] duration-500" style={{ width: `${(ok / n) * 100}%` }} />
          <span className="h-full bg-current opacity-50 transition-[width] duration-500" style={{ width: `${(r.parciais / n) * 100}%` }} />
        </div>
      )}

      {/* Uma linha so: a situacao do orcamento (ou o convite para definir um). */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-bold">
        {frase ? (
          <span className="min-w-0 truncate rounded-full bg-black/15 px-2.5 py-0.5">{frase}</span>
        ) : (
          <>
            <Link href="/app/economia" className="shrink-0 rounded-full bg-white px-2.5 py-1 text-brand no-underline">
              💰 Definir orçamento ›
            </Link>
            {r.faltaValor > 0 && <span className="truncate rounded-full bg-black/15 px-2.5 py-1">falta ~{brl(r.faltaValor)}</span>}
          </>
        )}
      </div>
    </div>
  );
}
