"use client";

import { useEffect, useState } from "react";

// "✕" para apagar o campo de uma vez, em TODOS os campos de texto do app (pedido do dono:
// apagar um nome errado letra por letra no celular demora). Um componente so, montado no
// layout: aparece no campo com foco que tem texto, sem mexer em cada tela.
// Campo que nao quer o ✕: data-sem-limpar.
const TIPOS = new Set(["", "text", "search", "email", "tel", "url", "number"]);

function serve(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    TIPOS.has(el.getAttribute("type") ?? "") &&
    !el.readOnly &&
    !el.disabled &&
    !el.hasAttribute("data-sem-limpar") &&
    el.getBoundingClientRect().width >= 110 // campo pequeno (preco, quantidade): sem espaco
  );
}

type Pos = { top: number; left: number };

export function LimparCampo() {
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    const entrou = (e: FocusEvent) => setEl(serve(e.target) ? e.target : null);
    const saiu = (e: FocusEvent) => setEl((atual) => (atual === e.target ? null : atual));
    document.addEventListener("focusin", entrou);
    document.addEventListener("focusout", saiu);
    return () => {
      document.removeEventListener("focusin", entrou);
      document.removeEventListener("focusout", saiu);
    };
  }, []);

  // Segue o campo (teclado subindo, popup rolando) e some quando o campo esta vazio.
  useEffect(() => {
    // o campo com foco e o proprio `el` (lido do DOM: e nele que o padding muda)
    const campo = document.activeElement;
    if (!el || campo !== el || !(campo instanceof HTMLInputElement)) return;
    const antes = campo.style.paddingRight;
    if (parseFloat(getComputedStyle(campo).paddingRight) < 34) campo.style.paddingRight = "36px";
    let id = 0;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setPos((p) => {
        const novo = el.value && r.width ? { top: r.top + window.scrollY + r.height / 2 - 14, left: r.right + window.scrollX - 34 } : null;
        return p?.top === novo?.top && p?.left === novo?.left ? p : novo;
      });
      id = requestAnimationFrame(medir);
    };
    id = requestAnimationFrame(medir);
    return () => {
      cancelAnimationFrame(id);
      campo.style.paddingRight = antes;
      setPos(null);
    };
  }, [el]);

  if (!el || !pos) return null;
  return (
    <button
      type="button"
      aria-label="Apagar o texto"
      // pointerdown/mousedown sem default: o campo nao perde o foco (o teclado nao desce)
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        // setter nativo + evento input: o onChange do React percebe (campo controlado)
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.focus();
      }}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 10000 }}
      className="grid h-7 w-7 place-items-center rounded-full bg-text-3/80 text-[15px] font-bold leading-none text-bg"
    >
      ✕
    </button>
  );
}
