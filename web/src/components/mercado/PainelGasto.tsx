"use client";

import Link from "next/link";
import { brl } from "@/lib/format";
import type { Conta, ResumoMercado } from "@/lib/modoMercado";

// Resumo do topo, compacto de proposito: com 70 itens na lista, o painel grande ocupava
// a tela inteira e nenhum produto aparecia sem rolar (print do dono). Aqui cabe em
// ~130px: total, barra de quanto da lista ja foi e a situacao do orcamento numa linha.
// A cor da faixa muda sozinha: cabe (laranja), o resto nao cabe (amarelo), estourou (vermelho).
// Visual do redesenho (Claude Design "Despensa — Revisão de design"): bloco escuro
// unico com total, quanto da lista ja foi, orcamento numa linha e o Finalizar.
const TOM_FRASE: Record<Conta["tom"], string> = {
  ok: "text-[#8FD9AE]",
  sem: "text-white/70",
  atencao: "text-[#F5B544]",
  estourou: "text-[#FF8A80]",
};

export function PainelGasto({
  r,
  conta,
  titulo,
  onFinalizar,
  podeFinalizar = false,
}: {
  r: ResumoMercado;
  conta: Conta;
  titulo: string;
  onFinalizar?: () => void;
  podeFinalizar?: boolean;
}) {
  const n = Math.max(r.totalLista, 1);
  const ok = r.pegosLista - r.parciais; // pegos completos
  const frase =
    conta.tom === "sem"
      ? null
      : conta.tom === "estourou"
        ? `Passou ${brl(-(conta.sobraAgora ?? 0))} do orçamento`
        : (conta.sobraNoFim ?? 0) < 0
          ? `Cabem ${brl(conta.sobraAgora ?? 0)} · o resto passa ${brl(-(conta.sobraNoFim ?? 0))}`
          : `Cabem mais ${brl(conta.sobraAgora ?? 0)} no orçamento`;

  return (
    <div className="flex flex-col gap-2.5 rounded-[24px] bg-[var(--barra)] px-4 py-3.5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-white/65">{titulo}</div>
          <div className="text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{brl(conta.carrinho)}</div>
        </div>
        {onFinalizar && (
          <button
            onClick={onFinalizar}
            disabled={!podeFinalizar}
            className="h-11 shrink-0 rounded-full bg-[var(--barra-ativa)] px-4 text-[15px] font-extrabold text-[var(--barra-ativa-ink)] disabled:opacity-40"
          >
            Finalizar
          </button>
        )}
      </div>
      {r.totalLista > 0 && (
        <div className="flex items-center gap-2.5">
          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/15">
            <span className="h-full bg-white transition-[width] duration-500" style={{ width: `${(ok / n) * 100}%` }} />
            <span className="h-full bg-white/50 transition-[width] duration-500" style={{ width: `${(r.parciais / n) * 100}%` }} />
          </div>
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-white/85">
            {r.pegosLista} de {r.totalLista}
          </span>
        </div>
      )}
      {frase ? (
        <span className={`truncate text-[12px] font-semibold ${TOM_FRASE[conta.tom]}`}>{frase}</span>
      ) : (
        <Link href="/app/economia" className="self-start text-[12px] font-semibold text-white/70 underline no-underline">
          Definir orçamento ›
        </Link>
      )}
    </div>
  );
}
