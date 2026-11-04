"use client";

import { useEffect, useState } from "react";

// O app salvo na tela inicial do iPhone nunca e fechado de verdade: volta da memoria
// com o codigo antigo. Aqui ele pergunta ao servidor qual versao esta no ar e:
// - ao voltar para o app (estava em segundo plano): recarrega sozinho, sem perguntar;
// - com o app aberto: mostra um aviso "Nova versao" e recarrega na proxima volta.
const MINHA = process.env.NEXT_PUBLIC_VERSAO ?? "";
const INTERVALO = 3 * 60 * 1000;

async function versaoNoAr(): Promise<string | null> {
  try {
    const r = await fetch(`/api/versao?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const { versao } = (await r.json()) as { versao?: string };
    return versao || null;
  } catch {
    return null;
  }
}

export function AutoAtualizar() {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    if (!MINHA || process.env.NODE_ENV !== "production") return;
    let velho = false;
    let checando = false;

    async function checar(aoVoltar: boolean) {
      if (velho) {
        if (aoVoltar) location.reload();
        return;
      }
      if (checando) return;
      checando = true;
      const v = await versaoNoAr();
      checando = false;
      if (!v || v === MINHA) return;
      velho = true;
      if (aoVoltar) location.reload();
      else setNova(true);
    }

    const aoVisivel = () => {
      if (document.visibilityState === "visible") checar(true);
    };
    const aoPageshow = (e: PageTransitionEvent) => {
      if (e.persisted) checar(true);
    };
    checar(true);
    document.addEventListener("visibilitychange", aoVisivel);
    window.addEventListener("pageshow", aoPageshow);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") checar(false);
    }, INTERVALO);
    return () => {
      document.removeEventListener("visibilitychange", aoVisivel);
      window.removeEventListener("pageshow", aoPageshow);
      clearInterval(id);
    };
  }, []);

  if (!nova) return null;
  return (
    <div className="fixed inset-x-0 top-[calc(8px+env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <button
        onClick={() => location.reload()}
        className="flex items-center gap-2 rounded-xl bg-text px-4 py-2.5 text-sm font-semibold text-bg shadow-[0_10px_26px_var(--shadow-lg)]"
      >
        Nova versão disponível · <span className="font-extrabold underline">Atualizar</span>
      </button>
    </div>
  );
}
