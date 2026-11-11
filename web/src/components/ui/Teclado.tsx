"use client";

import { useEffect } from "react";

// Teclado do celular sem esconder o que se digita (queixa do dono: o teclado cobria o
// campo, ou o campo ficava la embaixo e so se via o texto no fim). Um componente so,
// montado no layout, para todas as telas:
// 1. mede o teclado pelo viewport VISUAL (o iPhone nao encolhe a pagina) e publica
//    html[data-teclado] e --teclado (altura). O CSS usa isso para esconder a barra de
//    abas e o +, e subir as barras de baixo que tem campo (.acima-teclado);
// 2. o campo tocado vai para o MEIO da tela depois que o teclado termina de subir;
// 3. campo de numero (preco, quantidade) ja vem selecionado: digitar troca o valor,
//    sem apagar o antigo primeiro.
const CAMPO = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), textarea, select';

export function Teclado() {
  useEffect(() => {
    const html = document.documentElement;
    const vv = window.visualViewport;
    const medir = () => {
      if (!vv) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const aberto = kb > 120 && document.activeElement?.matches?.(CAMPO);
      if (aberto) {
        html.dataset.teclado = "1";
        html.style.setProperty("--teclado", `${Math.round(kb)}px`);
      } else {
        delete html.dataset.teclado;
        html.style.setProperty("--teclado", "0px");
      }
    };
    const entrou = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.(CAMPO)) return;
      if (el instanceof HTMLInputElement && /numeric|decimal/.test(el.inputMode)) {
        requestAnimationFrame(() => {
          try {
            el.select();
          } catch {
            /* tipo de campo sem selecao */
          }
        });
      }
      // Duas vezes: quando o teclado comeca a subir e quando termina (iPhone ~300 ms).
      for (const ms of [120, 380]) {
        setTimeout(() => {
          medir();
          if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" });
        }, ms);
      }
    };
    const saiu = () => setTimeout(medir, 250);
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    document.addEventListener("focusin", entrou);
    document.addEventListener("focusout", saiu);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      document.removeEventListener("focusin", entrou);
      document.removeEventListener("focusout", saiu);
      delete html.dataset.teclado;
    };
  }, []);
  return null;
}
