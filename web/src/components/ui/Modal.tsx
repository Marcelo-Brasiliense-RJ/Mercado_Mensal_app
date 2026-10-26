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

  if (!open) return null;

  // Pouca altura = teclado aberto (ou telefone deitado): ancora no topo, senao
  // o centro joga os campos para baixo da linha do teclado.
  const apertado = area != null && area.altura < 560;

  return (
    <div
      onClick={onClose}
      style={
        area
          ? { position: "fixed", top: area.topo, height: area.altura, left: 0, right: 0 }
          : undefined
      }
      className={`fixed inset-0 z-30 flex animate-[fadeIn_0.2s_ease_both] justify-center overflow-x-hidden bg-black/50 p-3 sm:p-6 ${
        apertado ? "items-start" : "items-center"
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
          maxHeight: area ? Math.max(220, area.altura - 24) : undefined,
        }}
        className="max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-[24px] border border-border bg-card p-5 shadow-[0_30px_70px_var(--shadow-lg)] sm:p-[26px]"
      >
        {children}
      </div>
    </div>
  );
}
