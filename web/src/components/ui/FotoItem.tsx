"use client";

import { useState } from "react";
import { categoriaDe, ICONE } from "@/lib/categorias";

// Foto de um item da casa pelo nome (/api/foto). Sem foto, o icone da categoria:
// o card nunca fica com um buraco.
export function FotoItem({ nome, className = "" }: { nome: string; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou || nome.trim().length < 2) {
    return (
      <div className={`grid shrink-0 place-items-center bg-card-2 text-[22px] ${className}`} aria-hidden>
        {ICONE[categoriaDe(nome)] ?? "🛒"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura da loja, cacheada pela rota
    <img
      src={`/api/foto?nome=${encodeURIComponent(nome.trim().toLowerCase())}`}
      alt=""
      loading="lazy"
      onError={() => setFalhou(true)}
      className={`shrink-0 bg-white object-contain ${className}`}
    />
  );
}
