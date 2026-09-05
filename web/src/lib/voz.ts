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

// ============ PLANO B: ENTENDER A FRASE AQUI MESMO ============
// A rota /api/voz depende de uma chave da Groq. Sem ela, o app nao pode
// simplesmente dizer "nao configurado" e deixar a pessoa na mao no meio do
// mercado: o navegador transcreve por conta propria (SpeechRecognition) e a
// frase e interpretada aqui, por regra, sem IA nenhuma.
// ponytail: entende o jeito comum de falar compra ("comprei arroz vinte reais,
// dois pacotes"). Frase torta cai na tela de conferencia com o que deu para
// extrair, que e onde a pessoa corrige. O caminho bom continua sendo a Groq.

const NUMERO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, meio: 0.5, meia: 0.5,
};

const UNIDADE_PALAVRA: Record<string, string> = {
  kg: "kg", quilo: "kg", quilos: "kg", quilograma: "kg", quilogramas: "kg",
  g: "g", grama: "g", gramas: "g",
  l: "L", litro: "L", litros: "L", ml: "ml", mililitro: "ml", mililitros: "ml",
  pacote: "pct", pacotes: "pct", pct: "pct",
  caixa: "cx", caixas: "cx", cx: "cx",
  duzia: "dz", duzias: "dz", dz: "dz",
  unidade: "un", unidades: "un", un: "un",
};

// Verbo -> destino. A ordem importa: o primeiro que casar decide.
const VERBOS: [RegExp, VozIntencao][] = [
  [/\b(comprei|peguei|botei no carrinho|coloquei no carrinho|custou|paguei)\b/, "carrinho"],
  [/\b(preciso|vou comprar|falta|faltou|acabou|anota|comprar)\b/, "lista"],
  [/\b(tenho|sobrou|ainda tem|conferindo|conferi|em casa)\b/, "estoque"],
];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "doze e noventa" -> 12.90 (centavos), "vinte e cinco" -> 25 (soma).
// A regra que separa os dois: se o segundo numero e dezena redonda, e centavo.
export function numerosPorExtenso(texto: string): string {
  // Virgula de pontuacao vira token separado; a de decimal ("12,90") fica onde
  // esta. Sem isso "noventa," nao casava e o centavo falado se perdia.
  const tk = semAcento(texto.toLowerCase())
    .replace(/(?<!\d),|,(?!\d)/g, " , ")
    .split(/\s+/)
    .filter(Boolean);
  const saida: string[] = [];
  for (let i = 0; i < tk.length; i++) {
    const n = NUMERO[tk[i]];
    if (n === undefined) {
      saida.push(tk[i]);
      continue;
    }
    const prox = tk[i + 1] === "e" ? NUMERO[tk[i + 2]] : undefined;
    if (prox !== undefined) {
      const centavo = prox >= 10 && prox % 10 === 0 && prox < 100;
      saida.push(String(centavo ? n + prox / 100 : n + prox));
      i += 2;
      continue;
    }
    saida.push(String(n));
  }
  return saida.join(" ");
}

const LIXO = new Set([
  "comprei", "peguei", "botei", "coloquei", "custou", "paguei", "preciso",
  "vou", "comprar", "falta", "faltou", "acabou", "anota", "ai", "tenho",
  "sobrou", "ainda", "tem", "conferindo", "conferi", "casa", "em", "de", "do",
  "da", "no", "na", "os", "as", "o", "a", "por", "cada", "reais", "real", "r$",
  "que", "e", "com", "pra", "para", "mais",
]);

type Pedaco = { nome: string; qtd: number | null; preco: number | null; unidade: string | null };

function lePedaco(txt: string): Pedaco {
  const tk = txt.trim().split(/\s+/).filter(Boolean);
  let qtd: number | null = null;
  let preco: number | null = null;
  let unidade: string | null = null;
  const nome: string[] = [];

  for (let i = 0; i < tk.length; i++) {
    const t = tk[i].replace(/^r\$/, "");
    const num = Number(t.replace(",", "."));
    if (t !== "" && Number.isFinite(num)) {
      const seguinte = tk[i + 1] ?? "";
      const un = UNIDADE_PALAVRA[seguinte];
      if (un) {
        qtd = num;
        unidade = un;
        i += 1;
      } else if (/reais|real/.test(seguinte) || /^r\$/.test(tk[i])) {
        preco = num;
        if (/reais|real/.test(seguinte)) i += 1;
      } else if (!Number.isInteger(num)) {
        // Numero quebrado sem unidade e preco falado ("doze e noventa").
        preco = num;
      } else if (qtd === null) {
        qtd = num;
      } else if (preco === null) {
        preco = num;
      }
      continue;
    }
    const un = UNIDADE_PALAVRA[t];
    if (un) {
      unidade = un;
      continue;
    }
    if (!LIXO.has(t)) nome.push(t);
  }
  return { nome: nome.join(" ").trim(), qtd, preco, unidade };
}

export function interpretarLocal(texto: string): {
  intencao: VozIntencao;
  itens: VozItem[];
} {
  const cru = semAcento((texto ?? "").toLowerCase());
  const intencao = VERBOS.find(([re]) => re.test(cru))?.[1] ?? "lista";

  const pedacos = numerosPorExtenso(texto)
    .split(/,| e /)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(lePedaco);

  const itens: VozItem[] = [];
  for (const p of pedacos) {
    // Pedaco sem nome ("dois pacotes") completa o item anterior, em vez de virar
    // um item fantasma: e assim que se fala de verdade ("arroz cinco reais, dois").
    if (!p.nome) {
      const ultimo = itens[itens.length - 1];
      if (!ultimo) continue;
      if (p.qtd != null) {
        // Preco ja guardado era por unidade; com a quantidade nova ele continua
        // valendo como total do item, entao divide de novo.
        if (ultimo.preco != null) ultimo.preco = +(ultimo.preco * ultimo.qtd / p.qtd).toFixed(2);
        ultimo.qtd = p.qtd;
      }
      if (p.preco != null) ultimo.preco = +(p.preco / ultimo.qtd).toFixed(2);
      if (p.unidade) ultimo.unidade = p.unidade;
      continue;
    }
    const qtd = p.qtd != null && p.qtd > 0 ? p.qtd : 1;
    itens.push({
      nome: p.nome,
      qtd,
      unidade: p.unidade ?? unitFor(p.nome),
      preco: p.preco != null && p.preco > 0 ? +(p.preco / qtd).toFixed(2) : null,
    });
  }
  return { intencao, itens };
}

// O navegador transcreve sozinho (Chrome, Safari do iPhone). E o plano B quando
// a rota do servidor nao esta configurada.
export function reconhecimentoDoNavegador(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
