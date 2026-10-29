"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOMES_LIVELO } from "@/lib/ofertas";
import type { Livelo } from "@/lib/livelo";

// Estado da Livelo (0046), um so para o app inteiro: Ofertas, Lista e Economia leem o
// mesmo. null enquanto carrega ou sem a 0046 aplicada: as telas so nao mostram a Livelo.
let estado: Livelo | null = null;
let carregado = false;
let carregando = false;
const ouvintes = new Set<() => void>();

async function carregar(forcar = false) {
  if (carregando || (carregado && !forcar)) return;
  carregando = true;
  const { data, error } = await createClient().rpc("mercado_livelo_web");
  carregando = false;
  carregado = true;
  const r = data as (Livelo & { ok: boolean }) | null;
  if (error || !r?.ok) return;
  for (const p of r.paridades) NOMES_LIVELO[p.codigo] = p.nome ?? p.codigo;
  estado = r;
  ouvintes.forEach((f) => f());
}
export const recarregarLivelo = () => carregar(true);

export function useLivelo(): Livelo | null {
  const v = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
    () => null,
  );
  useEffect(() => {
    void carregar();
  }, []);
  return v;
}

async function rpc(nome: string, args: Record<string, unknown>): Promise<{ ok: boolean; erro?: string; pontos?: number }> {
  const { data, error } = await createClient().rpc(nome, args);
  const r = data as { ok?: boolean; erro?: string; pontos?: number } | null;
  if (error || !r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para salvar. Tente de novo." };
  await carregar(true);
  return { ok: true, pontos: r.pontos };
}

export const salvarConfigLivelo = (valor: number, clube: boolean, parceiros: string[]) =>
  rpc("mercado_livelo_config_web", { p_valor_ponto: valor, p_clube: clube, p_parceiros: parceiros });
export const marcarFixo = (item: string, fixo: boolean) => rpc("mercado_fixo_web", { p_item: item, p_fixo: fixo });
export const salvarPrecoLivelo = (item: string, parceiro: string, preco: number | null) =>
  rpc("mercado_livelo_preco_web", { p_item: item, p_parceiro: parceiro, p_preco: preco });
export const registrarCompraLivelo = (parceiro: string, item: string, valor: number) =>
  rpc("mercado_livelo_compra_web", { p_parceiro: parceiro, p_item: item, p_valor: valor });
