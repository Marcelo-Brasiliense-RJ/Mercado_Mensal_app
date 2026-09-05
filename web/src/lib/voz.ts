// Ditado dentro do app: o audio vai para /api/voz, volta transcrito e ja separado
// em itens. Aqui ficam as partes puras (escolha de formato, saneamento do que o
// modelo devolveu), que sao as que erram calado e por isso tem teste.

import { unitFor } from "./defaults";

export type VozIntencao = "lista" | "carrinho" | "estoque";

export type VozItem = {
  nome: string;
  qtd: number;
  unidade: string;
  // Preco POR UNIDADE. O modelo devolve o total falado ("arroz vinte reais, dois
  // pacotes" = 20 no total) e a divisao e feita em codigo, nunca pelo modelo:
  // conta de LLM e o tipo de erro que ninguem confere.
  preco: number | null;
};

export type VozResposta =
  | { ok: true; texto: string; intencao: VozIntencao; itens: VozItem[] }
  | { ok: false; erro: string };

// Formatos que o Whisper aceita e que os navegadores gravam. Chrome/Android da
// webm; iOS Safari so grava mp4/m4a. A ordem e a preferencia.
export const MIMES_AUDIO = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg;codecs=opus",
];

// `suportado` entra por parametro para dar pra testar sem navegador (no browser,
// quem chama passa MediaRecorder.isTypeSupported).
export function escolherMime(suportado: (m: string) => boolean): string | null {
  return MIMES_AUDIO.find((m) => suportado(m)) ?? null;
}

// Extensao coerente com o mime, porque a API do Whisper decide o decoder pelo
// nome do arquivo enviado.
export function extensaoDe(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function segundosFmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

const INTENCOES: VozIntencao[] = ["lista", "carrinho", "estoque"];

export function intencaoValida(v: unknown): VozIntencao {
  // Na duvida cai em "lista": e a acao que nao mexe em estoque nem em gasto, entao
  // errar para la e o erro barato. Classificacao errada ja foi a falha numero 1
  // do bot em uso real (secao 2 do tarefas.md).
  return INTENCOES.includes(v as VozIntencao) ? (v as VozIntencao) : "lista";
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Sanea o que o modelo devolveu: nome obrigatorio, quantidade positiva, unidade
// deduzida do nome quando nao vier, e o preco TOTAL virando preco por unidade.
export function normalizaItens(raw: unknown): VozItem[] {
  if (!Array.isArray(raw)) return [];
  const itens: VozItem[] = [];
  for (const linha of raw) {
    if (!linha || typeof linha !== "object") continue;
    const o = linha as Record<string, unknown>;
    const nome = String(o.nome ?? "").trim();
    if (!nome) continue;

    const q = numero(o.qtd);
    const qtd = q != null && q > 0 ? q : 1;

    const unidade = String(o.unidade ?? "").trim() || unitFor(nome);

    const total = numero(o.preco_total);
    const preco = total != null && total > 0 ? +(total / qtd).toFixed(2) : null;

    itens.push({ nome, qtd, unidade, preco });
  }
  return itens;
}

export const ERRO_VOZ: Record<string, string> = {
  nao_autenticado: "Sua sessão expirou. Entre de novo.",
  voz_indisponivel: "Ditado ainda não configurado neste ambiente.",
  audio_grande: "Áudio longo demais. Grave até um minuto.",
  sem_audio: "Não gravou nada. Tente de novo.",
  nao_entendi: "Não entendi o que você falou. Tente de novo, mais perto.",
  transcricao_falhou: "Não consegui transcrever agora. Tente de novo.",
};
