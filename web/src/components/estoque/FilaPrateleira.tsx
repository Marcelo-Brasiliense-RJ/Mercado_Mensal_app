"use client";

import { useState } from "react";
import { PrateleiraModal } from "./PrateleiraModal";
import { ProcessoFoto } from "./ProcessoFoto";
import { tentarDeNovo, tirarJob, useFilaPrateleira } from "@/lib/filaPrateleira";
import { useDescanso } from "@/lib/filaFotos";

// Aviso baixinho da foto dos produtos em segundo plano. Fica no AppShell (qualquer
// tela). Lendo: so informa. Pronta: fica FIXO ate a pessoa tocar e conferir (ou
// descartar dentro). Falhou: tentar de novo ou descartar.
export function FilaPrateleira() {
  const fila = useFilaPrateleira();
  const [aberto, setAberto] = useState<string | null>(null);
  const lendo = fila.filter((x) => x.estado === "lendo");
  const prontas = fila.filter((x) => x.estado === "pronto");
  const falhas = fila.filter((x) => x.estado === "falhou");
  const espera = Math.max(0, ...lendo.map((x) => x.espera ?? 0));
  const descanso = useDescanso(espera);
  const job = fila.find((x) => x.id === aberto && x.estado === "pronto");
  // Aberto ainda lendo (ou com erro): a tela do processo, ao vivo.
  const emProcesso = fila.find((x) => x.id === aberto && x.estado !== "pronto");

  if (!fila.length) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+160px)] z-30 flex flex-col items-center gap-2 px-4 text-center lg:bottom-24">
        {prontas[0] && (
          <button
            type="button"
            onClick={() => setAberto(prontas[0].id)}
            className="pointer-events-auto flex animate-[pop_0.22s_ease_both] items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[14px] font-extrabold text-brand-ink shadow-lg ring-4 ring-brand/25"
          >
            {prontas[0].destino === "carrinho" ? "🛒 Carrinho pronto" : "📸 Foto pronta"}: {prontas[0].achados?.length ?? 0} produtos
            {prontas.length > 1 ? ` (+${prontas.length - 1})` : ""} · <span className="underline">Conferir</span>
          </button>
        )}
        {falhas[0] && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-text py-1 pl-4 pr-1 text-[13px] font-bold text-bg shadow-lg">
            <button type="button" onClick={() => setAberto(falhas[0].id)} className="text-left">⚠️ {falhas[0].erro ?? "Não consegui ler a foto."}</button>
            <button type="button" onClick={() => tentarDeNovo(falhas[0].id)} className="h-9 rounded-full bg-bg/15 px-3 underline">
              Tentar de novo
            </button>
            <button type="button" aria-label="Descartar foto" onClick={() => tirarJob(falhas[0].id)} className="h-9 w-9 rounded-full">
              ✕
            </button>
          </div>
        )}
        {lendo.length > 0 && (
          <button
            type="button"
            onClick={() => setAberto(lendo[0].id)}
            className="pointer-events-auto flex items-center justify-center gap-2 rounded-full bg-text px-4 py-2 text-[13px] font-bold text-bg shadow-lg"
          >
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />
            {descanso > 0
              ? `⏸ IA no limite · volta em ${descanso}s`
              : lendo[0].etapa === "conferindo"
                ? `✨ Achei ${lendo[0].achados?.length ?? 0} produtos · conferindo`
                : `🔎 Analisando ${lendo.length > 1 ? `${lendo.length} fotos` : "a foto"} dos produtos…`}
            <span className="underline opacity-80">ver</span>
          </button>
        )}
      </div>
      {emProcesso && <ProcessoFoto key={emProcesso.id} job={emProcesso} onClose={() => setAberto(null)} />}
      {job && <PrateleiraModal key={job.id} job={job} destino={job.destino} onClose={() => setAberto(null)} />}
    </>
  );
}
