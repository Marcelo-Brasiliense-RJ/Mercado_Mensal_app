"use client";

import { useStore } from "@/lib/store";

export function Toast() {
  const { toast, toastDesfazer, desfazer } = useStore();
  if (!toast) return null;
  return (
    // Centralizado por um container de largura total (a animacao usa transform, e um
    // translate-x no proprio aviso era sobrescrito e cortava a esquerda). No celular fica
    // acima da barra Falar/Codigo/Digitar e das abas; no desktop, no rodape.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-8">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full animate-[pop_0.22s_ease_both] items-center gap-3 rounded-xl bg-text py-2 pl-5 pr-2 text-sm font-semibold text-bg shadow-[0_10px_26px_var(--shadow-lg)]"
      >
        <span className="min-w-0 py-1">{toast}</span>
      {/* Alvo grande e logo ao lado do que aconteceu: errou o toque, desfaz na hora. */}
        {toastDesfazer && (
          <button
            onClick={desfazer}
            className="h-10 shrink-0 rounded-lg bg-bg/15 px-3.5 text-sm font-extrabold text-bg"
          >
            Desfazer
          </button>
        )}
      </div>
    </div>
  );
}
