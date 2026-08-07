"use client";

import { useEffect } from "react";

// Overlay centralizado do design (usado por detalhe, adicionar, orcamento e
// nota fiscal). Fecha no backdrop e no Esc.
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex animate-[fadeIn_0.2s_ease_both] items-center justify-center overflow-x-hidden bg-black/50 p-3 sm:p-6"
    >
      {/* Em tela estreita os 100px de padding (24 do overlay + 26 do card, de cada
          lado) comiam a largura util e o conteudo transbordava. No mobile sao 40px. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="max-h-[90vh] w-full overflow-y-auto overflow-x-hidden rounded-[24px] border border-border bg-card p-5 shadow-[0_30px_70px_var(--shadow-lg)] sm:p-[26px]"
      >
        {children}
      </div>
    </div>
  );
}
