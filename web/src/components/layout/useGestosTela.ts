"use client";

import { useEffect, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ABAS, destinoDoGesto, gestoValeu, indiceAba } from "@/lib/gestos";

// Arrastar o dedo na tela (so no celular):
// - nas abas: pra esquerda = proxima aba, pra direita = aba anterior;
// - fora delas (Ajustes): da esquerda pra direita = voltar.
// O conteudo acompanha o dedo; na ponta (sem aba alem) ele "estica" e volta.
// Nao dispara dentro de campos de texto, de faixas que rolam pro lado
// (chips, carrosseis) nem em [data-sem-gesto].

function rolaProLado(el: Element | null, fim: Element): boolean {
  for (let n = el; n && n !== fim; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

export function useGestosTela(
  path: string,
  areaRef: RefObject<HTMLElement | null>,
  conteudoRef: RefObject<HTMLElement | null>,
) {
  const router = useRouter();

  // Deixa as abas vizinhas pre-carregadas: a troca pelo gesto fica instantanea.
  useEffect(() => {
    const i = indiceAba(path);
    if (i < 0) return;
    [ABAS[i - 1], ABAS[i + 1]].forEach((h) => h && router.prefetch(h));
  }, [path, router]);

  // Ao chegar na tela nova, limpa o deslocamento que o dedo deixou.
  useEffect(() => {
    const c = conteudoRef.current;
    if (!c) return;
    c.style.transition = "";
    c.style.transform = "";
    c.style.opacity = "";
  }, [path, conteudoRef]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    let x0 = 0, y0 = 0, t0 = 0, dx = 0;
    let estado: "nada" | "talvez" | "lado" | "fora" = "nada";

    const mover = (px: number, tempo = 0) => {
      const c = conteudoRef.current;
      if (!c) return;
      c.style.transition = tempo ? `transform ${tempo}ms cubic-bezier(.2,.8,.2,1), opacity ${tempo}ms` : "none";
      c.style.transform = px ? `translate3d(${px}px,0,0)` : "";
    };

    const inicio = (e: TouchEvent) => {
      estado = "nada";
      if (window.innerWidth >= 1024 || e.touches.length !== 1) return;
      const alvo = e.target as Element;
      if (alvo.closest("input, textarea, select, [contenteditable], [data-sem-gesto]")) return;
      if (rolaProLado(alvo, area)) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = e.timeStamp;
      dx = 0;
      estado = "talvez";
    };

    const durante = (e: TouchEvent) => {
      if (estado === "nada" || estado === "fora") return;
      const ddx = e.touches[0].clientX - x0;
      const ddy = e.touches[0].clientY - y0;
      if (estado === "talvez") {
        if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
        // Mais vertical que horizontal: e rolagem normal, sai do caminho.
        if (Math.abs(ddx) < Math.abs(ddy) * 1.4) {
          estado = "fora";
          return;
        }
        estado = "lado";
      }
      e.preventDefault(); // trava a rolagem vertical enquanto arrasta pro lado
      dx = ddx;
      const tem = destinoDoGesto(path, dx) !== null;
      // Com destino acompanha o dedo; na ponta, resistencia de elastico.
      mover(tem ? dx * 0.55 : dx * 0.12);
    };

    const fim = (e: TouchEvent) => {
      if (estado !== "lado") {
        estado = "nada";
        return;
      }
      estado = "nada";
      const destino = destinoDoGesto(path, dx);
      if (!destino || !gestoValeu(dx, e.timeStamp - t0, window.innerWidth)) {
        mover(0, 220);
        return;
      }
      // Saida: a tela atual desliza mais um pouco e some; a nova entra pelo lado.
      const c = conteudoRef.current;
      if (c) c.style.opacity = "0";
      mover(Math.sign(dx) * window.innerWidth * 0.35, 140);
      navigator.vibrate?.(8);
      if (destino.tipo === "aba") router.push(destino.href);
      else if (window.history.length > 1) router.back();
      else router.push("/app/estoque");
      // Rede lenta: se a tela nao trocou, volta ao normal em vez de ficar sumida.
      window.setTimeout(() => {
        if (c && c.style.opacity === "0") {
          c.style.opacity = "";
          mover(0, 200);
        }
      }, 1500);
    };

    area.addEventListener("touchstart", inicio, { passive: true });
    area.addEventListener("touchmove", durante, { passive: false });
    area.addEventListener("touchend", fim, { passive: true });
    area.addEventListener("touchcancel", fim, { passive: true });
    return () => {
      area.removeEventListener("touchstart", inicio);
      area.removeEventListener("touchmove", durante);
      area.removeEventListener("touchend", fim);
      area.removeEventListener("touchcancel", fim);
    };
  }, [path, router, areaRef, conteudoRef]);
}
