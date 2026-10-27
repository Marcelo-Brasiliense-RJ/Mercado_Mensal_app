"use client";

import { useEffect, useSyncExternalStore } from "react";

// Onde a pessoa esta: dentro de um mercado onde ja comprou, ou nao.
//
// Por que existe: no mercado, o que se le ou fala e o que vai no carrinho; em casa e
// estoque. O app aprende sozinho os mercados: cada item posto no carrinho grava o
// ponto exato (e onde a pessoa estava pegando produto, ou seja, DENTRO da loja, nao
// no estacionamento). Depois, perto de um desses pontos e com GPS preciso, Falar e
// Codigo ja entram no Carrinho, de qualquer tela.
//
// Privacidade: os pontos ficam so neste aparelho (localStorage). Nada vai ao servidor.
// ponytail: um raio fixo por ponto. Loja grande ou GPS ruim dentro do predio pode
// precisar de raio maior; o upgrade e guardar o espalhamento de cada ponto.

// mercado: id dos acompanhados (guanabara...) ou o nome de outro ("Atacadão").
export type Ponto = { lat: number; lng: number; n: number; em: number; mercado?: string; nome?: string };

const CHAVE = "lugares_mercado";
const RAIO = 45; // m: dentro da loja, longe o bastante do estacionamento na maioria
const MESMO_LUGAR = 120; // m: dois pontos tao perto sao a mesma loja (corredores diferentes)
const PRECISAO_MAX = 50; // m: GPS pior que isso nao decide nada
const MAX_PONTOS = 30;

export function distancia(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// Em qual ponto conhecido a pessoa esta (-1: nenhum). So com GPS preciso.
export function pontoAtual(pos: { lat: number; lng: number; precisao: number }, pontos: Ponto[]): number {
  if (!(pos.precisao <= PRECISAO_MAX)) return -1;
  let melhor = -1;
  let d = Infinity;
  pontos.forEach((p, i) => {
    const x = distancia(pos, p);
    if (x <= RAIO && x < d) [melhor, d] = [i, x];
  });
  return melhor;
}

export function dentroDeMercado(pos: { lat: number; lng: number; precisao: number }, pontos: Ponto[]): boolean {
  return pontoAtual(pos, pontos) >= 0;
}

// Nome do mapa -> mercado que o monitor acompanha. "Supermercados Guanabara" -> guanabara.
const CONHECIDOS: [RegExp, string][] = [
  [/guanabara/, "guanabara"],
  [/mundial/, "mundial"],
  [/super\s*bom/, "superbom"],
  [/supermarket/, "supermarket"],
  [/economia/, "economia"],
];
export function idDoMercado(nome: string): string | null {
  const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return CONHECIDOS.find(([re]) => re.test(n))?.[1] ?? null;
}

// Junta o ponto novo ao da mesma loja (media ponderada) ou cria um novo.
export function aprender(pontos: Ponto[], pos: { lat: number; lng: number; precisao: number }, agora = Date.now()): Ponto[] {
  if (!(pos.precisao <= PRECISAO_MAX)) return pontos;
  const i = pontos.findIndex((p) => distancia(p, pos) <= MESMO_LUGAR);
  if (i < 0) return [...pontos, { lat: pos.lat, lng: pos.lng, n: 1, em: agora }].sort((a, b) => b.em - a.em).slice(0, MAX_PONTOS);
  const p = pontos[i];
  const n = Math.min(p.n, 20); // o centro ainda se move um pouco com leituras novas
  const novo = { ...p, lat: (p.lat * n + pos.lat) / (n + 1), lng: (p.lng * n + pos.lng) / (n + 1), n: p.n + 1, em: agora };
  return pontos.map((x, j) => (j === i ? novo : x));
}

// ============ estado do aparelho ============
type Estado = {
  noMercado: boolean;
  permitido: "sim" | "nao" | "perguntar" | "sem";
  // o mercado deste ponto, quando ja se sabe; `perguntar`: ponto novo sem nome ainda
  mercado: string | null;
  nomeMercado: string | null;
  perguntar: { sugestao: string | null } | null;
};
let estado: Estado = { noMercado: false, permitido: "perguntar", mercado: null, nomeMercado: null, perguntar: null };
let ultimaPos: { lat: number; lng: number; precisao: number } | null = null;
export const mercadoAtual = () => (estado.noMercado ? estado.mercado : null);
const ouvintes = new Set<() => void>();
const definir = (e: Partial<Estado>) => {
  estado = { ...estado, ...e };
  ouvintes.forEach((f) => f());
};

function lerPontos(): Ponto[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as Ponto[];
  } catch {
    return [];
  }
}
function gravarPontos(p: Ponto[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // sem armazenamento: so nao aprende
  }
}

async function permissao(): Promise<Estado["permitido"]> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "sem";
  try {
    const r = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (!r) return estado.permitido;
    return r.state === "granted" ? "sim" : r.state === "denied" ? "nao" : "perguntar";
  } catch {
    return estado.permitido; // Safari antigo sem Permissions API
  }
}

function posicao(): Promise<{ lat: number; lng: number; precisao: number } | null> {
  return new Promise((ok) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        definir({ permitido: "sim" });
        ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy });
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) definir({ permitido: "nao", noMercado: false });
        ok(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    ),
  );
}

// Confere onde esta. So pergunta permissao quando `pedir` (vem de um toque).
export async function atualizarLugar(pedir = false) {
  const p = await permissao();
  if (p !== estado.permitido) definir({ permitido: p });
  if (p === "sem" || p === "nao" || (p === "perguntar" && !pedir)) return;
  const pos = await posicao();
  if (pos) situar(pos, lerPontos());
}

function situar(pos: { lat: number; lng: number; precisao: number }, pontos: Ponto[]) {
  ultimaPos = pos;
  const i = pontoAtual(pos, pontos);
  const p = pontos[i];
  definir({
    noMercado: i >= 0,
    mercado: p?.mercado ?? null,
    nomeMercado: p?.nome ?? null,
    perguntar: p && !p.mercado ? { sugestao: estado.perguntar?.sugestao ?? null } : null,
  });
  if (p && !p.mercado && !estado.perguntar?.sugestao) void sugerir(pos);
}

// Nome do mercado pelo mapa aberto (OpenStreetMap): o supermercado mais perto do ponto.
// So sugestao: a pessoa confirma com um toque, uma vez por loja.
async function sugerir(pos: { lat: number; lng: number }) {
  const q = `[out:json][timeout:10];nwr(around:150,${pos.lat},${pos.lng})["shop"~"supermarket|wholesale"];out center tags 10;`;
  let nome: string | null = null;
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    const perto = j.elements
      .map((e) => ({ nome: e.tags?.brand || e.tags?.name, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
      .filter((e): e is { nome: string; lat: number; lng: number } => !!e.nome && e.lat != null && e.lng != null)
      .sort((a, b) => distancia(pos, a) - distancia(pos, b));
    nome = perto[0]?.nome ?? null;
  } catch {
    // mapa fora do ar: a pergunta aparece sem sugestao
  }
  if (estado.perguntar) definir({ perguntar: { sugestao: nome } });
}

// A pessoa disse qual mercado e este ponto (id dos acompanhados ou nome de outro).
export function nomearMercado(nome: string) {
  if (!ultimaPos) return;
  const pontos = lerPontos();
  const i = pontoAtual(ultimaPos, pontos);
  if (i < 0) return;
  pontos[i] = { ...pontos[i], mercado: idDoMercado(nome) ?? nome.trim(), nome: nome.trim() };
  gravarPontos(pontos);
  situar(ultimaPos, pontos);
}
export const posicaoAtual = () => ultimaPos;

// Item no carrinho: grava onde a pessoa esta (sem perguntar; so se ja tem permissao).
export async function aprenderMercado() {
  if ((await permissao()) !== "sim") return;
  const pos = await posicao();
  if (!pos) return;
  const pontos = aprender(lerPontos(), pos);
  gravarPontos(pontos);
  situar(pos, pontos);
}

let ligado = false;
export function useLugar() {
  const e = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
    () => estado,
  );
  useEffect(() => {
    if (ligado) return;
    ligado = true;
    atualizarLugar();
    // voltar ao app (desbloquear o celular no corredor) confere de novo
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") atualizarLugar();
    });
    // e a cada 2 min com o app aberto: entrar na loja com o app na mao
    setInterval(() => document.visibilityState === "visible" && atualizarLugar(), 120000);
  }, []);
  return e;
}
