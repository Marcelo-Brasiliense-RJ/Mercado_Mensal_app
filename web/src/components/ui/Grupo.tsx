"use client";

import { useState } from "react";

// Grupo que abre e fecha (categoria do Estoque, das ofertas). O que a pessoa fechou
// fica fechado na proxima visita, so neste aparelho.
function ler(chave: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(chave) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function useRecolhidos(chave: string, padrao: "aberto" | "fechado" = "aberto") {
  // Guarda as excecoes ao padrao: com tudo aberto, os fechados; com tudo fechado, os abertos.
  const [excecoes, setExcecoes] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : ler(chave)));
  const aberto = (g: string) => (padrao === "aberto") !== excecoes.has(g);
  const alternar = (g: string) =>
    setExcecoes((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      try {
        localStorage.setItem(chave, JSON.stringify([...n]));
      } catch {
        // sem armazenamento: so nao lembra na proxima visita
      }
      return n;
    });
  return { aberto, alternar };
}

export function Grupo({
  titulo,
  icone,
  info,
  destaque,
  aberto,
  onAlternar,
  children,
}: {
  titulo: string;
  icone?: string;
  info?: string;
  destaque?: string;
  aberto: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <button
        onClick={onAlternar}
        aria-expanded={aberto}
        className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2 text-left"
      >
        {icone && <span className="text-[22px] leading-none" aria-hidden>{icone}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-extrabold">{titulo}</span>
          {info && <span className="block text-[12px] text-text-2">{info}</span>}
        </span>
        {destaque && (
          <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-extrabold text-warn">{destaque}</span>
        )}
        <span
          className={`shrink-0 text-[18px] text-text-3 transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden
        >
          ⌄
        </span>
      </button>
      {aberto && children}
    </section>
  );
}
