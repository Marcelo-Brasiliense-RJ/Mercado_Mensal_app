"use client";

import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { LiveloSecao } from "./Livelo";
import { useListaOfertas, useOfertas } from "./useOfertas";

// Aba Livelo: pontos nas compras do mes (parceiros, Carrefour da lista e fixos). Saiu da
// aba Ofertas para ter espaco proprio.
export function LiveloView() {
  const estado = useOfertas();
  const ofertas = useListaOfertas();
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Livelo" subtitle="Pontos nas compras do mês" />
      {estado.fase === "carregando" ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-brand" />
        </div>
      ) : (
        <LiveloSecao ofertas={ofertas} sempreAberto />
      )}
    </div>
  );
}
