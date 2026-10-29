"use client";

import { distancia, mercadosAprendidos } from "./lugar";

// Onde fica a loja de um mercado, perto da pessoa: primeiro a que o app ja aprendeu
// (onde ela comprou de verdade), senao a mais perto no mapa aberto (OpenStreetMap).
export type Loja = { lat: number; lng: number; nome: string; fonte: "aprendida" | "mapa" };

const NOME: Record<string, string> = {
  guanabara: "Guanabara",
  mundial: "Mundial",
  superbom: "Super ?Bom",
  supermarket: "Supermarket",
  economia: "Economia",
};

export async function localizarLoja(mercado: string, origem: { lat: number; lng: number }): Promise<Loja | null> {
  const aprendidas = mercadosAprendidos()
    .filter((p) => p.mercado === mercado)
    .sort((a, b) => distancia(origem, a) - distancia(origem, b));
  if (aprendidas[0]) return { lat: aprendidas[0].lat, lng: aprendidas[0].lng, nome: aprendidas[0].nome ?? mercado, fonte: "aprendida" };

  const re = (NOME[mercado] ?? mercado).replace(/"/g, "");
  const q = `[out:json][timeout:15];nwr(around:15000,${origem.lat},${origem.lng})["shop"~"supermarket|wholesale"]["name"~"${re}",i];out center tags 30;`;
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    const lojas = j.elements
      .map((e) => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, nome: e.tags?.name ?? mercado }))
      .filter((e): e is { lat: number; lng: number; nome: string } => e.lat != null && e.lng != null)
      .sort((a, b) => distancia(origem, a) - distancia(origem, b));
    return lojas[0] ? { ...lojas[0], fonte: "mapa" } : null;
  } catch {
    return null;
  }
}
