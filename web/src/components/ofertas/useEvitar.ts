"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Evitar } from "@/lib/ofertas";

// Lista "Não compro" (0045), compartilhada pelo app inteiro: ofertas, leitor e Lista
// leem o mesmo estado. Vazia enquanto carrega ou sem a 0045: nada fica escondido.
let itens: Evitar[] = [];
let carregado = false;
let carregando = false;
const ouvintes = new Set<() => void>();
const definir = (x: Evitar[]) => {
  itens = x;
  ouvintes.forEach((f) => f());
};

async function carregar(forcar = false) {
  if (carregando || (carregado && !forcar)) return;
  carregando = true;
  const { data, error } = await createClient().rpc("mercado_evitar_web");
  carregando = false;
  carregado = true;
  const r = data as { ok: boolean; itens: Evitar[] } | null;
  if (!error && r?.ok) definir(r.itens);
}

export function useEvitar(): Evitar[] {
  const v = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => itens,
    () => itens,
  );
  useEffect(() => {
    void carregar();
  }, []);
  return v;
}

export async function marcarRuim(p: {
  termo: string;
  nome: string;
  barcode?: string | null;
  motivo?: string | null;
  oferta?: number | null;
  foto?: string | null;
}): Promise<boolean> {
  const { data, error } = await createClient().rpc("mercado_evitar_salvar_web", {
    p_termo: p.termo,
    p_nome: p.nome,
    p_barcode: p.barcode ?? null,
    p_motivo: p.motivo ?? null,
    p_oferta: p.oferta ?? null,
    p_foto: p.foto ?? null,
  });
  if (error || !(data as { ok?: boolean } | null)?.ok) return false;
  await carregar(true);
  return true;
}

export async function desmarcarRuim(id: number): Promise<boolean> {
  const antes = itens;
  definir(itens.filter((e) => e.id !== id));
  const { data, error } = await createClient().rpc("mercado_evitar_remover_web", { p_id: id });
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    definir(antes);
    return false;
  }
  return true;
}
