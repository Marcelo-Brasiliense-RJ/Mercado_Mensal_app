"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "./supabase/client";
import type { PrecoVisto } from "./precoMercado";

// Precos que a casa ja viu em cada mercado (0043), um pedido por mercado por sessao.
// Sem a 0043 no banco fica tudo vazio, sem erro: o leitor so nao sugere.
const cache = new Map<string, PrecoVisto[]>();
const pedindo = new Set<string>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const VAZIO: PrecoVisto[] = [];

async function carregar(mercado: string) {
  if (cache.has(mercado) || pedindo.has(mercado)) return;
  pedindo.add(mercado);
  const { data } = await createClient().rpc("mercado_precos_mercado_web", { p_mercado: mercado });
  pedindo.delete(mercado);
  const r = data as { ok?: boolean; precos?: PrecoVisto[] } | null;
  cache.set(mercado, r?.ok ? (r.precos ?? []) : []);
  avisar();
}

export function usePrecosVistos(mercado: string | null): PrecoVisto[] {
  const v = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => (mercado ? (cache.get(mercado) ?? VAZIO) : VAZIO),
    () => VAZIO,
  );
  useEffect(() => {
    if (mercado) void carregar(mercado);
  }, [mercado]);
  return v;
}

// Item posto no carrinho com o mercado conhecido: guarda o preco visto la.
export async function registrarPreco(mercado: string, item: string, preco: number, barcode: string | null) {
  if (!(preco > 0) || !item.trim()) return;
  const nome = item.trim().toLowerCase();
  const lista = (cache.get(mercado) ?? []).filter((x) => x.item !== nome);
  cache.set(mercado, [...lista, { item: nome, barcode, preco, visto_em: new Date().toISOString() }]);
  avisar();
  await createClient().rpc("mercado_preco_visto_web", { p_mercado: mercado, p_item: nome, p_preco: preco, p_barcode: barcode });
}
