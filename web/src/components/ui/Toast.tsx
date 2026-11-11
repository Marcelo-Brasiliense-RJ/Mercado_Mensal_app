"use client";

import { useStore } from "@/lib/store";

// Aviso rapido do app, no visual do redesenho: cartao escuro com icone em circulo,
// texto em duas linhas no maximo e "Desfazer" em pilula laranja. O emoji do comeco
// da mensagem ("✅ Cafe no carrinho") vira o icone; sem emoji, um check.
const EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

function partes(msg: string): { icone: string; texto: string; tom: string } {
  const m = msg.match(EMOJI);
  const icone = m ? m[1] : "✓";
  const texto = m ? msg.slice(m[0].length) : msg;
  const ruim = /n[aã]o (deu|consegui)|erro|falhou|sem conex/i.test(msg);
  return { icone: ruim && !m ? "!" : icone, texto, tom: ruim ? "bg-[#FF8A80] text-[#2A0E0C]" : m ? "bg-white/12" : "bg-[#4ADE80] text-[#06140B]" };
}

export function Toast() {
  const { toast, toastDesfazer, desfazer } = useStore();
  if (!toast) return null;
  const { icone, texto, tom } = partes(toast);
  return (
    // Centralizado por um container de largura total (a animacao usa transform, e um
    // translate-x no proprio aviso era sobrescrito e cortava a esquerda). No celular fica
    // acima das barras de baixo; no desktop, no rodape.
    <div className="pointer-events-none fixed inset-x-0 bottom-[var(--acima-fab,150px)] z-40 flex justify-center px-3 lg:bottom-8">
      <div
        role="status"
        className="pointer-events-auto relative flex w-full max-w-[440px] animate-[pop_0.22s_ease_both] items-center gap-3 overflow-hidden rounded-[22px] bg-[#18181A] py-2.5 pl-2.5 pr-2.5 text-white shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[18px] font-extrabold ${tom}`} aria-hidden>
          {icone}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-snug">{texto}</span>
        {/* Alvo grande e logo ao lado do que aconteceu: errou o toque, desfaz na hora. */}
        {toastDesfazer && (
          <button
            onClick={desfazer}
            className="h-10 shrink-0 rounded-full bg-[#FF7A1A] px-4 text-[14px] font-extrabold text-[#1A0C02]"
          >
            Desfazer
          </button>
        )}
        {/* Tempo para desfazer, encolhendo no pe do aviso. */}
        {toastDesfazer && <span className="absolute inset-x-0 bottom-0 h-[3px] origin-left animate-[encolher_6s_linear_both] bg-[#FF7A1A]/70" aria-hidden />}
      </div>
    </div>
  );
}
