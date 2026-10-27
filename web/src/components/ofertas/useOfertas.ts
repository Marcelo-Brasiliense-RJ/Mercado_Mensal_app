"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemFalta, Oferta } from "@/lib/ofertas";

export type DadosOfertas = { ofertas: Oferta[]; lista: ItemFalta[]; atualizado_em: string | null };
export type EstadoOfertas =
  | { fase: "carregando" }
  | { fase: "desligado" } // migration 0038 ainda nao aplicada
  | { fase: "erro" }
  | { fase: "ok"; dados: DadosOfertas };

// Uma busca por vez para o app inteiro: a aba Ofertas, o carrinho e a lista usam a
// mesma resposta. Guarda por 10 min; as ofertas mudam no maximo 3 vezes por semana.
const VALIDADE_MS = 10 * 60 * 1000;
let cache: { em: number; promessa: Promise<EstadoOfertas> } | null = null;

function buscar(): Promise<EstadoOfertas> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.promessa;
  const promessa = Promise.resolve(createClient().rpc("mercado_ofertas_web")).then(
    ({ data, error }): EstadoOfertas => {
      if (error) return { fase: error.code === "PGRST202" ? "desligado" : "erro" };
      const d = data as (DadosOfertas & { ok: boolean }) | null;
      return d?.ok ? { fase: "ok", dados: d } : { fase: "erro" };
    },
    (): EstadoOfertas => ({ fase: "erro" }),
  );
  cache = { em: Date.now(), promessa };
  // Falha nao fica guardada: a proxima tela tenta de novo.
  promessa.then((e) => {
    if (e.fase === "erro" && cache?.promessa === promessa) cache = null;
  });
  return promessa;
}

export function useOfertas(): EstadoOfertas {
  const [estado, setEstado] = useState<EstadoOfertas>({ fase: "carregando" });
  useEffect(() => {
    let vivo = true;
    buscar().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

// So as ofertas, ou lista vazia enquanto carrega/sem oferta: para quem so quer avisar.
export function useListaOfertas(): Oferta[] {
  const e = useOfertas();
  return e.fase === "ok" ? e.dados.ofertas : [];
}
