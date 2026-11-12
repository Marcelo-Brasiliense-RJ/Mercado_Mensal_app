"use client";

import { useSyncExternalStore } from "react";
import type { Cupom } from "./cupomPartes";
import type { CompraResumo } from "./compras";

// Nota fiscal lida em SEGUNDO PLANO (dono, 2026-11-12: "se for demorar, que fique gerando
// la e nao trave a tela; quando ficar pronto, o usuario clica e aparece, que nem as fotos
// do carrinho e da despensa"). As fotos da nota e a leitura de cada uma moram aqui, fora
// da tela: fechar a nota nao para a leitura. Um aviso flutuante (FilaNota, no AppShell)
// mostra "Lendo a nota · 3 de 7" e depois "Nota pronta · tocar para conferir".
//
// Uma nota por vez. So na memoria desta visita (fotos de nota pesam ~300 KB cada; nao
// cabem com folga no localStorage): recarregar o app perde a leitura em andamento.

export type Parte = {
  id: number;
  foto: string;
  estado: "lendo" | "ok" | "erro";
  cupom?: Cupom;
  erro?: string; // "ia" (ocupada, a foto e boa) ou "foto" (nao achou item)
  desde: number;
  tentativa: number;
};

export type NotaEmAndamento = {
  partes: Parte[];
  alvo: number; // quantas fotos o plano pede (1 = cupom pequeno)
  compra: CompraResumo | null; // nota de uma compra ja registrada (Gastos)
  aberta: boolean; // a tela da nota esta aberta (o aviso flutuante some)
};

const VAZIA: NotaEmAndamento = { partes: [], alvo: 2, compra: null, aberta: false };
let nota: NotaEmAndamento = VAZIA;
const ouvintes = new Set<() => void>();
let proximoId = 1;

function mudar(n: NotaEmAndamento) {
  nota = n;
  ouvintes.forEach((f) => f());
}
const trocarParte = (id: number, p: Partial<Parte>) => mudar({ ...nota, partes: nota.partes.map((x) => (x.id === id ? { ...x, ...p } : x)) });

export function useFilaNota(): NotaEmAndamento {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => nota,
    () => VAZIA,
  );
}
export const notaAtual = () => nota;

// Comeca uma nota (ou continua a que ja esta sendo lida, se for da mesma compra).
export function comecarNota(compra: CompraResumo | null) {
  if (nota.partes.length && (nota.compra?.id ?? null) === (compra?.id ?? null)) return;
  mudar({ ...VAZIA, compra, aberta: nota.aberta });
}
export function descartarNota() {
  mudar({ ...VAZIA, aberta: nota.aberta });
}
export function marcarNotaAberta(aberta: boolean) {
  if (nota.aberta !== aberta) mudar({ ...nota, aberta });
}
export function definirAlvo(alvo: number) {
  mudar({ ...nota, alvo });
}

// trocar: refaz uma foto; antesDe: poe a nova antes desta (o pedaco que faltou)
export function adicionarFotos(fotos: string[], destino: { trocar?: number; antesDe?: number } = {}) {
  if (!fotos.length) return;
  if (destino.trocar != null) {
    trocarParte(destino.trocar, { foto: fotos[0] });
    void ler(destino.trocar);
    return;
  }
  const novas: Parte[] = fotos.map((foto) => ({ id: proximoId++, foto, estado: "lendo", desde: Date.now(), tentativa: 1 }));
  const l = nota.partes;
  const i = destino.antesDe != null ? l.findIndex((p) => p.id === destino.antesDe) : -1;
  mudar({ ...nota, partes: i >= 0 ? [...l.slice(0, i), ...novas, ...l.slice(i)] : [...l, ...novas] });
  for (const p of novas) void ler(p.id);
}

export function tirarFoto(id: number) {
  const partes = nota.partes.filter((x) => x.id !== id);
  // nao pede outra foto no lugar da que saiu
  mudar({ ...nota, partes, alvo: Math.max(1, Math.min(nota.alvo, partes.length)) });
}

export function lerDeNovo(id: number) {
  void ler(id);
}

// No maximo 2 fotos sendo lidas ao mesmo tempo. Com 7 fotos de uma vez (uso real,
// 2026-11-12) a IA gratis estourava o limite por minuto e a foto do rodape falhava em 4 s.
const MAX_JUNTAS = 2;
let lendoAgora = 0;
const vez: (() => void)[] = [];
function pegarVez(): Promise<void> {
  if (lendoAgora < MAX_JUNTAS) {
    lendoAgora++;
    return Promise.resolve();
  }
  return new Promise((ok) => vez.push(ok));
}
function soltarVez() {
  const prox = vez.shift();
  if (prox) prox();
  else lendoAgora--;
}

async function ler(id: number, tentativa = 1): Promise<void> {
  const parte = nota.partes.find((p) => p.id === id);
  if (!parte) return; // a foto saiu (ou a nota foi descartada)
  const foto = parte.foto;
  trocarParte(id, { estado: "lendo", erro: undefined, desde: Date.now(), tentativa });
  let erro = "";
  await pegarVez();
  try {
    if (!nota.partes.some((p) => p.id === id && p.foto === foto)) return; // saiu ou trocou na fila
    const r = await fetch("/api/receipt-ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: foto }),
    });
    const d = (await r.json().catch(() => null)) as
      | { ok?: boolean; erro?: string; itens?: Cupom["itens"]; total?: number; emitente?: string; chave?: string; qtd_itens?: number }
      | null;
    if (!nota.partes.some((p) => p.id === id && p.foto === foto)) return;
    if (d?.ok && Array.isArray(d.itens)) {
      trocarParte(id, {
        estado: "ok",
        cupom: { itens: d.itens, total: Number(d.total) || 0, emitente: d.emitente ?? "", chave: d.chave ?? "", qtdItens: Number(d.qtd_itens) || 0 },
      });
      return;
    }
    // so "sem_itens" e culpa da foto; o resto e a IA ocupada ou sem cota
    erro = d?.erro === "sem_itens" ? "foto" : "ia";
  } catch {
    erro = "ia";
  } finally {
    soltarVez();
  }
  if (!erro) return;
  // IA ocupada: tenta de novo sozinha com a MESMA foto (ate 5 vezes, ~1 min e meio),
  // sem pedir foto nova (dono: "sempre travando ou pedindo uma nova").
  if (erro === "ia" && tentativa < 5) {
    await new Promise((ok) => setTimeout(ok, [0, 5000, 10000, 20000, 30000][tentativa]));
    return ler(id, tentativa + 1);
  }
  if (nota.partes.some((p) => p.id === id && p.foto === foto)) trocarParte(id, { estado: "erro", erro });
}
