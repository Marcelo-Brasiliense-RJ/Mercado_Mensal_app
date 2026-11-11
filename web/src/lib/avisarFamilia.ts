"use client";

import type { Aviso } from "./avisos";

// Fila dos avisos para a familia: junta o que a pessoa faz em sequencia (5 itens na
// lista em 4 s viram um aviso so) e manda para /api/avisar. Falhar aqui nunca atrapalha
// o app: aviso e extra.
let fila: Aviso[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function enviar() {
  const avisos = fila;
  fila = [];
  if (!avisos.length) return;
  void fetch("/api/avisar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ avisos }),
    keepalive: true, // sai mesmo se a pessoa fechar o app logo depois
  }).catch(() => {});
}

export function avisarFamilia(a: Aviso, imediato = false) {
  if (typeof window === "undefined") return;
  fila.push(a);
  clearTimeout(timer);
  if (imediato) return enviar();
  timer = setTimeout(enviar, 4000);
}

if (typeof window !== "undefined") {
  // App indo para segundo plano: manda o que ficou na fila.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(timer);
      enviar();
    }
  });
}
