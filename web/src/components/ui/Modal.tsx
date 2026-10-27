"use client";

import { useEffect, useState } from "react";

// Overlay centralizado do design (usado por detalhe, adicionar, orcamento e
// nota fiscal). Fecha no backdrop e no Esc.
//
// Teclado aberto no iPhone: o Safari NAO encolhe o viewport de layout quando o
// teclado sobe, entao um popup centralizado em 100vh ficava metade escondido
// atras do teclado, com os campos fora de alcance. A correcao e medir o viewport
// VISUAL e colar o popup nele; quando o teclado esta aberto o conteudo passa a
// ancorar no topo, que e onde sobra espaco.
//
// Com o teclado aberto, tres coisas para nao ficar ruim em celular nenhum:
// 1. o topo respeita a area segura (relogio, notch, ilha do iPhone), senao o titulo
//    some atras dela;
// 2. o bloco marcado com `data-rodape` (os botoes de salvar) gruda no fim do popup,
//    sempre a vista logo acima do teclado, em vez de ficar escondido la embaixo;
// 3. o campo tocado rola para o meio do popup depois que o teclado termina de subir.
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 460,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  // Altura e deslocamento do viewport visual. null = navegador sem a API, e ai
  // o comportamento fica igual ao de antes.
  const [area, setArea] = useState<{ altura: number; topo: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const medir = () => {
      // rAF em vez de setState direto: medir no corpo do effect dispara a regra
      // react-hooks/set-state-in-effect e um render em cascata.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setArea({ altura: vv.height, topo: vv.offsetTop }),
      );
    };
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      setArea(null);
    };
  }, [open]);

  // Campo tocado: espera o teclado subir e traz o campo para o meio do popup.
  useEffect(() => {
    if (!open) return;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.("input, textarea, select")) return;
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [open]);

  if (!open) return null;

  // Pouca altura = teclado aberto (ou telefone deitado): ancora no topo, senao
  // o centro joga os campos para baixo da linha do teclado.
  // Teclado aberto: tela curta, ou bem menor que a janela (celular grande com teclado).
  const apertado =
    area != null && (area.altura < 560 || (typeof window !== "undefined" && area.altura < window.innerHeight - 150));

  return (
    <div
      onClick={onClose}
      style={
        area
          ? { position: "fixed", top: area.topo, height: area.altura, left: 0, right: 0 }
          : undefined
      }
      className={`fixed inset-0 z-30 flex animate-[fadeIn_0.2s_ease_both] justify-center overflow-x-hidden bg-black/50 px-3 sm:px-6 ${
        apertado
          ? "items-start pb-2 pt-[max(10px,env(safe-area-inset-top))]"
          : "items-center py-[max(12px,env(safe-area-inset-top))] sm:py-6"
      }`}
    >
      {/* Em tela estreita os 100px de padding (24 do overlay + 26 do card, de cada
          lado) comiam a largura util e o conteudo transbordava. No mobile sao 40px. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth,
          // Com o teclado aberto o card vira a area rolavel: tudo continua
          // alcancavel, so que rolando dentro do popup.
          maxHeight: area
            ? `calc(${Math.max(220, area.altura)}px - max(${apertado ? 10 : 12}px, env(safe-area-inset-top)) - ${apertado ? 8 : 12}px)`
            : undefined,
        }}
        className={`relative max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-[24px] border border-border bg-card p-5 shadow-[0_30px_70px_var(--shadow-lg)] sm:p-[26px] ${
          apertado
            ? // rodape grudado no fim, com fundo para nao misturar com o que rola por baixo
              "[&_[data-rodape]]:sticky [&_[data-rodape]]:-bottom-5 [&_[data-rodape]]:z-10 [&_[data-rodape]]:-mx-5 [&_[data-rodape]]:border-t [&_[data-rodape]]:border-border [&_[data-rodape]]:bg-card [&_[data-rodape]]:px-5 [&_[data-rodape]]:pb-5 [&_[data-rodape]]:pt-3"
            : ""
        }`}
      >
        {/* Fechar visivel. Tocar fora funciona, mas ninguem adivinha isso: sem o
            X a pessoa fica presa no popup sem saber como sair. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-card-2 text-[20px] font-bold leading-none text-text-2 active:scale-95"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
