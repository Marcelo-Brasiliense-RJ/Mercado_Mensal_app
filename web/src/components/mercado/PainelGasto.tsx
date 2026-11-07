"use client";

import Link from "next/link";
import { brl } from "@/lib/format";
import { Interruptor } from "@/components/ui/Interruptor";
import type { Conta, ResumoMercado } from "@/lib/modoMercado";

// Topo do modo mercado: a conta inteira num bloco so, para bater o olho no corredor.
// Anel = quanto da lista ja esta no carrinho. Barra = mes (ja gasto + carrinho + o que
// falta) contra o orcamento. A cor do bloco muda sozinha: cabe, atencao, estourou.
const COR: Record<Conta["tom"], string> = {
  ok: "bg-brand text-brand-ink",
  sem: "bg-brand text-brand-ink",
  atencao: "bg-warn text-warn-ink",
  estourou: "bg-neg text-neg-ink",
};

export function PainelGasto({
  r,
  conta,
  titulo,
  itens,
  onDesligar,
}: {
  r: ResumoMercado;
  conta: Conta;
  titulo: string;
  itens: number;
  onDesligar: () => void;
}) {
  const pct = r.totalLista ? r.pegosLista / r.totalLista : 0;
  const base = Math.max(conta.orcamento, conta.previsto, 1);
  const w = (v: number) => `${Math.min(100, (v / base) * 100)}%`;

  return (
    <div className={`overflow-hidden rounded-[24px] px-[18px] pb-4 pt-3.5 shadow-[0_6px_20px_var(--shadow)] transition-colors ${COR[conta.tom]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[15px] font-extrabold">{titulo}</div>
        <Interruptor ligado onChange={onDesligar} rotulo="Desligar modo mercado" />
      </div>

      <div className="mt-2 flex items-center gap-4">
        {/* Anel da lista: sem ler numero, ve quanto falta. */}
        <div className="relative h-[86px] w-[86px] shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(pct * 97.4, r.totalLista ? 2 : 0)} 97.4`}
              className="transition-[stroke-dasharray] duration-500"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center leading-none">
            {r.totalLista ? (
              <span>
                <span className="block text-[20px] font-extrabold tabular-nums">
                  {r.pegosLista}/{r.totalLista}
                </span>
                <span className="text-[10px] font-bold uppercase opacity-85">da lista</span>
              </span>
            ) : (
              <span className="text-[26px]" aria-hidden>🛒</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-85">No carrinho</div>
          <div className="text-[38px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{brl(conta.carrinho)}</div>
          <div className="mt-1 text-[12px] font-bold opacity-90">
            {itens} {itens === 1 ? "item" : "itens"}
            {r.qtdFora > 0 && ` · ${brl(r.valorFora)} fora da lista`}
          </div>
        </div>
      </div>

      {conta.orcamento > 0 ? (
        <div className="mt-3.5">
          <div className="mb-1 flex justify-between text-[12px] font-bold opacity-90">
            <span>Orçamento do mês</span>
            <span className="tabular-nums">{brl(conta.orcamento)}</span>
          </div>
          {/* ja gasto | carrinho | falta (estimado), contra o orcamento (risco branco) */}
          <div className="relative flex h-3.5 overflow-hidden rounded-full bg-black/15">
            <span className="h-full bg-current opacity-45" style={{ width: w(conta.antes) }} />
            <span className="h-full bg-current" style={{ width: w(conta.carrinho) }} />
            <span
              className="h-full opacity-60"
              style={{
                width: w(conta.falta),
                backgroundImage: "repeating-linear-gradient(45deg, currentColor 0 3px, transparent 3px 7px)",
              }}
            />
            {conta.previsto > conta.orcamento && (
              <span className="absolute inset-y-0 w-[3px] bg-current" style={{ left: w(conta.orcamento) }} aria-hidden />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold opacity-90">
            <span className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm bg-current opacity-45" /> já gasto {brl(conta.antes)}
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm bg-current" /> carrinho {brl(conta.carrinho)}
            </span>
            {conta.falta > 0 && (
              <span className="flex items-center gap-1">
                <i
                  className="h-2.5 w-2.5 rounded-sm opacity-70"
                  style={{ backgroundImage: "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 4px)" }}
                />{" "}
                falta ~{brl(conta.falta)}
              </span>
            )}
          </div>
          <div className="mt-2 rounded-[12px] bg-black/10 px-3 py-2 text-[14px] font-extrabold leading-snug">
            {conta.tom === "estourou"
              ? `🚨 Passou ${brl(-(conta.sobraAgora ?? 0))} do orçamento`
              : (conta.sobraNoFim ?? 0) < 0
                ? `⚠️ Cabem ${brl(conta.sobraAgora ?? 0)} agora, mas pegando o resto passa ${brl(-(conta.sobraNoFim ?? 0))}`
                : `✅ Cabem ${brl(conta.sobraAgora ?? 0)}${conta.falta > 0 ? ` · pegando tudo sobra ~${brl(conta.sobraNoFim ?? 0)}` : ""}`}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[12px] bg-black/10 px-3 py-2 text-[13px] font-bold">
          <span>{conta.falta > 0 ? `Pegando o que falta: ~${brl(conta.carrinho + conta.falta)}` : "Sem orçamento do mês"}</span>
          <Link href="/app/economia" className="shrink-0 underline">
            Definir orçamento
          </Link>
        </div>
      )}

      {Math.abs(r.vsPesquisado) >= 0.01 && (
        <div className="mt-2 text-[13px] font-bold opacity-95">
          {r.vsPesquisado > 0
            ? `💰 ${brl(r.vsPesquisado)} mais barato que o pesquisado`
            : `📈 ${brl(-r.vsPesquisado)} mais caro que o pesquisado`}
        </div>
      )}
    </div>
  );
}
