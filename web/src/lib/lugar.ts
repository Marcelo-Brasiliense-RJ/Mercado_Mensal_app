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

export type Ponto = { lat: number; lng: number; n: number; em: number };

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

// Esta dentro de um mercado conhecido? So com GPS preciso.
export function dentroDeMercado(pos: { lat: number; lng: number; precisao: number }, pontos: Ponto[]): boolean {
  if (!(pos.precisao <= PRECISAO_MAX)) return false;
  return pontos.some((p) => distancia(pos, p) <= RAIO);
}

// Junta o ponto novo ao da mesma loja (media ponderada) ou cria um novo.
export function aprender(pontos: Ponto[], pos: { lat: number; lng: number; precisao: number }, agora = Date.now()): Ponto[] {
  if (!(pos.precisao <= PRECISAO_MAX)) return pontos;
  const i = pontos.findIndex((p) => distancia(p, pos) <= MESMO_LUGAR);
  if (i < 0) return [...pontos, { lat: pos.lat, lng: pos.lng, n: 1, em: agora }].sort((a, b) => b.em - a.em).slice(0, MAX_PONTOS);
  const p = pontos[i];
  const n = Math.min(p.n, 20); // o centro ainda se move um pouco com leituras novas
  const novo = { lat: (p.lat * n + pos.lat) / (n + 1), lng: (p.lng * n + pos.lng) / (n + 1), n: p.n + 1, em: agora };
  return pontos.map((x, j) => (j === i ? novo : x));
}

// ============ estado do aparelho ============
type Estado = { noMercado: boolean; permitido: "sim" | "nao" | "perguntar" | "sem" };
let estado: Estado = { noMercado: false, permitido: "perguntar" };
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
  if (pos) definir({ noMercado: dentroDeMercado(pos, lerPontos()) });
}

// Item no carrinho: grava onde a pessoa esta (sem perguntar; so se ja tem permissao).
export async function aprenderMercado() {
  if ((await permissao()) !== "sim") return;
  const pos = await posicao();
  if (!pos) return;
  const pontos = aprender(lerPontos(), pos);
  gravarPontos(pontos);
  definir({ noMercado: dentroDeMercado(pos, pontos) });
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
