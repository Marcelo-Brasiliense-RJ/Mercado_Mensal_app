"use client";

import { useSyncExternalStore } from "react";
import { reconhecerImagem, reduzir } from "./reconhecer";
import { codigoNaFoto } from "./codigoNaFoto";
import { reconhecerEmEtapas, type Base } from "./etapasReconhecer";

// Fila de fotos para a IA reconhecer. Na correria do mercado a pessoa tira a foto e
// segue; a IA trabalha uma de cada vez (a cota gratuita nao aguenta rajada) e, quando
// o leitor fecha, cada produto reconhecido aparece num popup para conferir.
//
// Fica neste aparelho (localStorage): fechar o app no meio nao perde as fotos.

export type Destino = "estoque" | "carrinho" | "lista";
export type FotoFila = {
  id: string;
  img: string; // JPEG reduzido (data URL)
  destino: Destino;
  estado: "preparando" | "esperando" | "reconhecendo" | "pronto" | "falhou";
  codigoFoto?: string; // codigo de barras lido na propria foto, no celular
  fonte?: "codigo" | "ia";
  nome?: string;
  marca?: string;
  codigo?: string;
  unidade?: string;
  foto?: string | null; // foto da loja, quando o codigo acha o produto numa base
  nao?: string; // nome recusado ("pedir pra rever")
  tentativas?: number;
  motivo?: "sem_ia" | "ia_falhou"; // por que falhou, quando nao foi so "nao reconheci"
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
    fila = f.map((x) => (x.estado === "reconhecendo" || x.estado === "preparando" ? { ...x, estado: "esperando" } : x));
  } catch {
    fila = [];
  }
  void processar();
}

async function produto(codigo: string): Promise<Base | null> {
  const d = await (await fetch(`/api/produto?codigo=${encodeURIComponent(codigo)}`)).json();
  return d?.ok && d.encontrado && d.nome ? d : null;
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
      // "Rever" e porque o nome estava errado: pula o codigo da foto e vai direto na IA.
      const r = await reconhecerEmEtapas({
        codigoLocal: async () => (x.nao ? "" : (x.codigoFoto ?? "")),
        produto,
        ia: (forte) => reconhecerImagem(x.img, x.nao, forte),
      });
      if (r.ok) {
        trocar(x.id, { estado: "pronto", nome: r.nome, marca: r.marca, codigo: r.codigo, unidade: r.unidade, foto: r.foto, fonte: r.fonte });
        continue;
      }
      if (r.motivo === "ia_falhou") {
        // rede ou cota: tenta de novo daqui a pouco, ate 3 vezes
        const t = (x.tentativas ?? 0) + 1;
        trocar(x.id, t >= 3 ? { estado: "falhou", tentativas: t, motivo: "ia_falhou", codigo: r.codigo } : { estado: "esperando", tentativas: t });
        if (t < 3) await new Promise((ok) => setTimeout(ok, 4000));
        continue;
      }
      trocar(x.id, { estado: "falhou", motivo: r.motivo === "sem_ia" ? "sem_ia" : undefined, codigo: r.codigo });
    }
  } finally {
    rodando = false;
  }
}

export async function enfileirarFoto(arquivo: File, destino: Destino) {
  carregar();
  const img = await reduzir(arquivo);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  mudar([...fila, { id, img, destino, estado: "preparando" }]);
  // Etapa 1 com a foto inteira (mais nitida que a reduzida que vai para a IA).
  const codigoFoto = await codigoNaFoto(arquivo).catch(() => "");
  trocar(id, { estado: "esperando", codigoFoto });
  void processar();
}

// "Nao e isso": manda a mesma foto de novo, dizendo o nome que estava errado.
export function reverFoto(id: string) {
  const x = fila.find((y) => y.id === id);
  if (!x) return;
  trocar(id, { estado: "esperando", nao: x.nome || x.nao, nome: undefined, codigo: undefined, foto: null, tentativas: 0, motivo: undefined });
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
