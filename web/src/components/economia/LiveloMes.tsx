"use client";

import { brl } from "@/lib/format";
import { COR_LIVELO } from "@/lib/ofertas";
import { nomeParceiro } from "@/lib/livelo";
import { useLivelo } from "@/components/ofertas/useLivelo";

// Economia do mes tambem em pontos: o que foi comprado pela Livelo ("Comprei", na aba
// Ofertas) e quanto isso vale em reais, pelo valor do ponto que a casa escolheu.
export function LiveloMes() {
  const l = useLivelo();
  if (!l?.configurado) return null;
  const valor = l.mes.pontos * l.valor_ponto;
  return (
    <div className="rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="text-[26px]" aria-hidden>💗</span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">
            {Math.round(l.mes.pontos).toLocaleString("pt-BR")} pontos Livelo
          </div>
          <div className="text-[13px] text-text-2">
            {l.mes.compras
              ? `ganhos este mês ≈ ${brl(valor)} de economia`
              : "Nenhuma compra pela Livelo este mês. Os fixos na aba Ofertas dizem quando compensa."}
          </div>
        </div>
      </div>
      {l.por_parceiro.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
          {l.por_parceiro.map((p) => (
            <div key={p.parceiro} className="flex items-center gap-2">
              <span className="rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white" style={{ background: COR_LIVELO }}>
                {nomeParceiro(l, p.parceiro)}
              </span>
              <span className="min-w-0 flex-1 truncate text-text-2">{p.itens}</span>
              <b>{Math.round(p.pontos).toLocaleString("pt-BR")} pts</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
