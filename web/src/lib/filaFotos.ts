"use client";

import { useSyncExternalStore } from "react";
import { reconhecerImagem, reduzir } from "./reconhecer";

// Fila de fotos para a IA reconhecer. Na correria do mercado a pessoa tira a foto e
// segue; a IA trabalha uma de cada vez (a cota gratuita nao aguenta rajada) e, quando
// o leitor fecha, cada produto reconhecido aparece num popup para conferir.
//
// Fica neste aparelho (localStorage): fechar o app no meio nao perde as fotos.

export type Destino = "estoque" | "carrinho";
export type FotoFila = {
  id: string;
  img: string; // JPEG reduzido (data URL)
  destino: Destino;
  estado: "esperando" | "reconhecendo" | "pronto" | "falhou";
  nome?: string;
  marca?: string;
  codigo?: string;
  unidade?: string;
  foto?: string | null; // foto da loja, quando o codigo acha o produto numa base
  nao?: string; // nome recusado ("pedir pra rever")
  tentativas?: number;
};

const CHAVE = "fila_fotos";
let fila: FotoFila[] = [];
let leitorAberto = false;
let carregada = false;
const ouvintes = new Set<() => void>();

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // cheio ou sem armazenamento: a fila so vive nesta visita
  }
}
function mudar(f: FotoFila[]) {
  fila = f;
  gravar();
  ouvintes.forEach((x) => x());
}
const trocar = (id: string, p: Partial<FotoFila>) => mudar(fila.map((x) => (x.id === id ? { ...x, ...p } : x)));

function carregar() {
  if (carregada || typeof window === "undefined") return;
  carregada = true;
  try {
    const f = JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as FotoFila[];
    // o que estava no meio quando o app fechou volta para a espera
    fila = f.map((x) => (x.estado === "reconhecendo" ? { ...x, estado: "esperando" } : x));
  } catch {
    fila = [];
  }
  void processar();
}

let rodando = false;
async function processar() {
  if (rodando) return;
  rodando = true;
  try {
    for (;;) {
      const x = fila.find((y) => y.estado === "esperando");
      if (!x) break;
      trocar(x.id, { estado: "reconhecendo" });
      const r = await reconhecerImagem(x.img, x.nao);
      if (r === undefined) {
        // rede ou cota: tenta de novo daqui a pouco, ate 3 vezes
        const t = (x.tentativas ?? 0) + 1;
        trocar(x.id, t >= 3 ? { estado: "falhou", tentativas: t } : { estado: "esperando", tentativas: t });
        if (t < 3) await new Promise((ok) => setTimeout(ok, 4000));
        continue;
      }
      if (!r) {
        trocar(x.id, { estado: "falhou" });
        continue;
      }
      // Codigo lido na foto: o nome certo vem da base publica (o da IA varia de foto para foto).
      let base: { nome?: string; unidade?: string | null; marca?: string; foto?: string | null } = {};
      if (r.codigo) {
        try {
          const d = await (await fetch(`/api/produto?codigo=${encodeURIComponent(r.codigo)}`)).json();
          if (d?.ok && d.encontrado && d.nome) base = d;
        } catch {
          // base fora do ar: fica o nome da IA
        }
      }
      trocar(x.id, {
        estado: "pronto",
        nome: base.nome || r.nome,
        marca: base.marca || r.marca,
        codigo: r.codigo,
        unidade: base.unidade ?? undefined,
        foto: base.foto ?? null,
      });
    }
  } finally {
    rodando = false;
  }
}

export async function enfileirarFoto(arquivo: File, destino: Destino) {
  carregar();
  const img = await reduzir(arquivo);
  mudar([...fila, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, img, destino, estado: "esperando" }]);
  void processar();
}

// "Nao e isso": manda a mesma foto de novo, dizendo o nome que estava errado.
export function reverFoto(id: string) {
  const x = fila.find((y) => y.id === id);
  if (!x) return;
  trocar(id, { estado: "esperando", nao: x.nome || x.nao, nome: undefined, codigo: undefined, foto: null, tentativas: 0 });
  void processar();
}

export const tirarDaFila = (id: string) => mudar(fila.filter((x) => x.id !== id));

// O leitor aberto segura os popups: a pessoa continua lendo e confere tudo ao fechar.
export function marcarLeitor(aberto: boolean) {
  leitorAberto = aberto;
  ouvintes.forEach((x) => x());
}

type Estado = { fila: FotoFila[]; leitorAberto: boolean };
let foto: Estado = { fila, leitorAberto };
function ler(): Estado {
  if (foto.fila !== fila || foto.leitorAberto !== leitorAberto) foto = { fila, leitorAberto };
  return foto;
}
const vazio: Estado = { fila: [], leitorAberto: false };

export function useFilaFotos(): Estado {
  return useSyncExternalStore(
    (f) => {
      carregar();
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    ler,
    () => vazio,
  );
}
