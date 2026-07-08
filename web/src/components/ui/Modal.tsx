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
      className="fixed inset-0 z-30 flex animate-[fadeIn_0.2s_ease_both] items-center justify-center bg-black/50 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="max-h-[90vh] w-full overflow-y-auto rounded-[24px] border border-border bg-card p-[26px] shadow-[0_30px_70px_var(--shadow-lg)]"
      >
        {children}
      </div>
    </div>
  );
}
