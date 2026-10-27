"use client";

import { createClient } from "./supabase/client";

// Mercados da casa (0044). Escolhidos: ids dos acompanhados ("guanabara") ou nome de
// um pedido ("Assaí"). Sem nenhum escolhido, a casa ve todos.
export type MeusMercados = {
  escolhidos: string[];
  acompanhados: { mercado: string; ofertas: number }[];
  pedidos: { nome: string; familias: number; meu: boolean }[];
};

export async function carregarMeusMercados(): Promise<MeusMercados | null> {
  const { data, error } = await createClient().rpc("mercado_meus_mercados_web");
  const r = data as (MeusMercados & { ok: boolean }) | null;
  return !error && r?.ok ? r : null;
}

export async function salvarMeusMercados(lista: string[]): Promise<boolean> {
  const { data, error } = await createClient().rpc("mercado_meus_mercados_salvar_web", { p_mercados: lista });
  return !error && !!(data as { ok?: boolean } | null)?.ok;
}

// "Quero tambem" / "vem sempre aqui": pede o mercado e, se a casa ja escolhe os
// seus, poe ele na escolha (as ofertas aparecem quando o monitor passar a ler).
export async function pedirMercado(nome: string, lat: number | null = null, lng: number | null = null) {
  await createClient().rpc("mercado_pedir_mercado_web", { p_nome: nome, p_lat: lat, p_lng: lng });
  const m = await carregarMeusMercados();
  if (m && m.escolhidos.length && !m.escolhidos.includes(nome)) await salvarMeusMercados([...m.escolhidos, nome]);
}
