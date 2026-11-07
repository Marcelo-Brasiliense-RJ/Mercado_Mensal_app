// Ditado dentro do app: o audio vai para /api/voz, volta transcrito e ja separado
// em itens. Aqui ficam as partes puras (escolha de formato, saneamento do que o
// modelo devolveu), que sao as que erram calado e por isso tem teste.

import { unitFor } from "./defaults";
import { normalizarFala } from "./sinonimos";

export type VozIntencao = "lista" | "carrinho" | "estoque";

export type VozItem = {
  nome: string;
  qtd: number;
  unidade: string;
  // Preco POR UNIDADE. O modelo devolve o total falado ("arroz vinte reais, dois
  // pacotes" = 20 no total) e a divisao e feita em codigo, nunca pelo modelo:
  // conta de LLM e o tipo de erro que ninguem confere.
  preco: number | null;
  // O modelo nao teve certeza do produto (palavra que nao e produto, nome cortado,
  // marca sem o que e). Esse item nao entra sozinho: a tela pergunta.
  duvida?: boolean;
  // "Nao quero mais cafe", "tira o leite": sai da lista em vez de entrar.
  remover?: boolean;
  // Audio longo mistura tudo ("tenho 5 kg de arroz, preciso de cafe, nao compra
  // fermento"): cada item diz para onde vai. Sem isso, vale a intencao da frase.
  destino?: VozIntencao;
  // Por que nao comprar, quando a fala ja disse ("ja tem muito fermento" = excesso).
  motivo?: "excesso" | "ruim";
  // "Acabou o leite", "zerou o cafe": o estoque e ZERO (alem de ir para a lista).
  zerou?: boolean;
  // Nenhum numero foi dito ("ainda tem arroz"): qtd 1 e so um palpite. Ao atualizar o
  // estoque isso NAO pode virar 1; a tela pergunta quanto.
  semQtd?: boolean;
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
// `apple`: iPhone/Safari passou a dizer que grava webm, mas o arquivo sai quebrado
// ou mudo e o Whisper devolve vazio ("nao capta nada"). Ali o mp4 e o formato nativo.
export function escolherMime(
  suportado: (m: string) => boolean,
  apple = false,
): string | null {
  const ordem = apple
    ? ["audio/mp4", ...MIMES_AUDIO.filter((m) => m !== "audio/mp4")]
    : MIMES_AUDIO;
  return ordem.find((m) => suportado(m)) ?? null;
}

export function ehApple(ua: string): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (/safari/i.test(ua) && !/chrome|chromium|crios|android|fxios/i.test(ua));
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
    const acao = String(o.acao ?? "");
    // Zero so conta como "acabou" quando e estoque; em outra acao e so "nao disse".
    const zerou = o.zerou === true || (q === 0 && acao === "estoque");
    const semQtd = acao === "estoque" && !zerou && (q == null || q < 0);

    const unidade = String(o.unidade ?? "").trim() || unitFor(nome);

    const total = numero(o.preco_total);
    const preco = total != null && total > 0 ? +(total / qtd).toFixed(2) : null;

    // So `true` vale como duvida: qualquer outra coisa do modelo e "entendi".
    const remover = o.remover === true || acao === "remover";
    const motivo = o.motivo === "excesso" || o.motivo === "ruim" ? o.motivo : undefined;
    itens.push({
      nome,
      qtd,
      unidade,
      preco,
      ...(o.duvida === true ? { duvida: true } : {}),
      ...(zerou ? { zerou: true } : {}),
      ...(semQtd ? { semQtd: true } : {}),
      ...(remover ? { remover: true, ...(motivo ? { motivo } : {}) } : {}),
      ...(!remover && INTENCOES.includes(acao as VozIntencao) ? { destino: acao as VozIntencao } : {}),
    });
  }
  return itens;
}

export const ERRO_VOZ: Record<string, string> = {
  nao_autenticado: "Sua sessão expirou. Entre de novo.",
  voz_indisponivel: "Ditado ainda não configurado neste ambiente.",
  audio_grande: "Áudio longo demais. Grave até 3 minutos.",
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
  cartela: "pct", cartelas: "pct", bandeja: "pct", bandejas: "pct", fardo: "pct", fardos: "pct",
  lata: "un", latas: "un", garrafa: "un", garrafas: "un", saco: "pct", sacos: "pct",
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
  "sobrou", "ainda", "tem", "conferindo", "conferi", "casa",
  "os", "as", "o", "a", "por", "cada", "reais", "real", "r$",
  "que", "e", "pra", "para", "mais", "quero", "nao", "precisa", "precisamos",
  "tira", "tirar", "tire", "remove", "remover", "cancela", "cancelar", "lista",
  "coloca", "colocar", "bota", "botar", "poe", "por", "adiciona", "adicionar",
  "compra", "compre", "mas", "agora", "tambem", "so", "isso", "aquele", "aquela",
  "um", "uma", "uns", "umas", "ja", "pegar", "favor", "enquanto", "vez",
  // tempo falado junto ("leite esse mes"): nunca e parte do nome do produto
  "esse", "essa", "este", "esta", "nesse", "nessa", "neste", "nesta", "mes",
  "semana", "hoje", "amanha", "proximo", "proxima", "dia", "dias",
  "eu", "nos", "gente", "ruim", "aqui", "ai", "la", "muito", "muita", "muitos", "muitas", "demais", "bastante",
  "sobrando", "sobra", "olha", "entao", "ne", "tipo", "assim",
  // "vou atualizar o meu estoque": o pedido do modo, nao produto
  "atualizar", "atualizando", "atualiza", "atualizei", "acertar", "acertando", "estoque",
  "meu", "minha", "meus", "minhas", "vamos", "bora", "contagem", "era", "tinha", "tinham", "havia",
  // verbo de quantidade que fica grudado no nome ("creme de leite ta com 6", "muda o arroz pra 3")
  "ta", "esta", "estao", "tao", "sao", "ficou", "ficaram", "sobraram", "restam", "caiu", "baixou",
  "subiu", "virou", "foi", "muda", "mude", "mudar", "corrige", "corrija", "corrigir", "atualize",
  "ajusta", "ajuste", "ajustar", "acerte", "troca", "trocar", "deixa", "zerado", "pro", "como",
  "verdade", "contei", "conto", "fazer", "faz", "fiz", "fizemos", "vez", "inventario",
  // muleta de fala ("deixa eu ver", "ah", "hum", "uns 6")
  "ver", "olhar", "ah", "ahn", "eh", "hum", "hmm", "oh", "uai", "bom", "beleza", "certo", "pronto",
  // lugar da casa, nao produto ("a despensa ta cheia de macarrao")
  "despensa", "dispensa", "armario", "geladeira", "freezer", "prateleira", "cozinha",
  "cheia", "cheio", "lotada", "lotado",
]);

// Negacao: "nao quero", "tira", "nao precisa mais". Vale para os itens seguintes
// ate aparecer um "quero"/"preciso"/"mas" de novo ("nao quero cafe e acucar, mas
// quero leite": cafe e acucar saem, leite entra).
const NEGA = /\b(nao (quero|precisa|preciso|vou|compra|comprar|precisamos)|tira|tirar|tire|remove|remover|cancela|cancelar|nao)\b/;
const AFIRMA = /\b(quero|preciso|precisamos|compra|comprar|falta|anota|coloca|bota|adiciona)\b/;

const CONECTOR = new Set(["em", "de", "do", "da", "dos", "das", "no", "na", "com"]);

// Palavra antes de um SEGUNDO numero que diz "este e o valor novo".
const VALOR_NOVO = new Set(["pra", "para", "pro", "agora", "tenho", "so", "sao", "com", "ficou", "ficaram", "caiu", "baixou", "subiu", "virou", "foi", "em"]);

type Pedaco = { nome: string; qtd: number | null; preco: number | null; unidade: string | null };

function lePedaco(txt: string): Pedaco {
  // Pontuacao do ditado ("Nao. Biscoito") nao pode grudar no nome.
  const tk = txt
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^["“”']+|[.!?;:"“”']+$/g, ""))
    .filter(Boolean);
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
      } else if (qtd !== null && VALOR_NOVO.has(tk[i - 1] ?? "")) {
        // "tinha 13, agora tenho 6", "de 13 caiu pra 6": o segundo numero e o que vale.
        qtd = num;
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
  // Ligacao fica DENTRO do nome ("sabao em po", "pao de forma") e sai das pontas
  // ("preciso de arroz", "5 quilos de arroz", "ruim do iogurte").
  while (nome.length && CONECTOR.has(nome[0])) nome.shift();
  while (nome.length && CONECTOR.has(nome[nome.length - 1])) nome.pop();
  return { nome: nome.join(" ").trim(), qtd, preco, unidade };
}

// "Arroz de 3 para 5 quilos", "leite era 2 agora 4": o que vale e o PARA. O DE e
// o que o app ja sabe (estoque atual), a pessoa so confirma. Roda depois dos
// numeros por extenso, entao so ve algarismos.
export function dePara(texto: string): string {
  return texto.replace(
    /\b(?:de|era|tinha)\s+\d+(?:[.,]\d+)?\s+(?:([a-z]+)\s+)?(?:para|pra|agora(?:\s+(?:tem|tenho|e))?)\s+(\d+(?:[.,]\d+)?)/g,
    (todo, un: string | undefined, para: string) =>
      // "tenho" na frente: falar de-para e sempre sobre o que tem em casa
      un && !UNIDADE_PALAVRA[un] ? todo : un ? `tenho ${para} ${un}` : `tenho ${para}`,
  );
}

// "Vou atualizar o meu estoque", "conferir a despensa", "contagem da geladeira": a
// pessoa quer ACERTAR quantidades (fica X), nao somar nem anotar na lista.
export function querAtualizarEstoque(frase: string): boolean {
  const t = semAcento((frase ?? "").toLowerCase());
  return (
    /\b(atualiz\w*|acert\w*|confer\w*|recont\w*|contagem|revis\w*|arrum\w*|organiz\w*|ajust\w*|corrig\w*)\b[^.!?]{0,30}\b(estoque|despensa|dispensa|armario|geladeira|freezer)\b/.test(t) ||
    /\b(estoque|despensa|dispensa)\b[^.!?]{0,15}\b(atualiz\w*|em dia)\b/.test(t) ||
    /\b(contagem|inventario)\b/.test(t) ||
    /\b(confer\w*|cont\w*|ver)\b[^.!?]{0,12}\bo que (tem|tenho|temos|sobrou)\b/.test(t)
  );
}

// "Acabou" de verdade (zero em casa) vira uma marca propria ANTES dos sinonimos: la
// "ta acabando" e "falta" tambem viram "acabou", e esses nao sao zero.
const ZERO_FORTE =
  /\b(acabou|acabaram|cabou|zerou|zerei|zeramos|zeraram|zera|zerar|zerado|zerada|terminou|terminaram|nao tem mais|nao tenho mais|nao temos mais|nao sobrou nada|nao sobrou|ja era|nao tem nenhum|nao tem nenhuma|nao tenho nenhum|nao tenho nenhuma)\b/g;

function prepararFala(texto: string): string {
  return normalizarFala(semAcento((texto ?? "").toLowerCase()).replace(ZERO_FORTE, " zerado "));
}

// Depois dos numeros: o jeito de falar que muda o valor ou se corrige no meio.
function ajustarFala(t: string): string {
  return (
    dePara(t)
      // se corrigiu: "arroz 5, nao, pera, 4", "na verdade tenho 6", "quer dizer 3"
      .replace(/\b(na verdade|quer dizer|ou melhor|melhor dizendo|corrigindo|me enganei|errei|perai|pera ai|espera ai|opa|ops)\b/g, ",")
      .replace(/\bnao\s*,?\s*(pera|espera)\b/g, ",")
      .replace(/(^|,|\d)\s*nao\s*,?\s*(?=\d)/g, "$1 , ")
      // "um quilo e meio" -> 1.5 kg (senao o " e " partia em dois itens)
      .replace(/\b(\d+(?:\.\d+)?)\s+([a-z]+)\s+e\s+0\.5\b/g, (todo, n: string, un: string) =>
        UNIDADE_PALAVRA[un] ? `${+n + 0.5} ${un}` : todo,
      )
      // "muda o arroz pra 3", "corrige o leite para 4", "deixa o cafe como 2" = tem 3/4/2
      .replace(
        /\b(muda|mude|mudar|corrige|corrija|corrigir|atualiza|atualize|ajusta|ajuste|acerta|acerte|troca|deixa|coloca|bota|poe)\s+(?:o |a |os |as )?([^,]+?)\s+(?:para|pra|pro|como|em)\s+(\d+(?:\.\d+)?)/g,
        "tenho $3 $2",
      )
  );
}

// `atualizar`: a pessoa esta acertando o estoque (botao ou "vou atualizar o estoque"):
// numero sem verbo e o que TEM agora.
export function interpretarLocal(texto: string, atualizar = false): {
  intencao: VozIntencao;
  itens: VozItem[];
} {
  // Cada um fala de um jeito: "ta faltando", "cabou", "risca", "tem um monte" viram a
  // forma padrao antes de ler (lib/sinonimos.ts).
  const cru = prepararFala(texto);
  const atualizando = atualizar || querAtualizarEstoque(texto);
  // "nao quero cafe" sozinho e assunto de lista, nao de estoque.
  const intencao = atualizando
    ? "estoque"
    : /\bnao (quero|precisa)|\btira\b/.test(cru)
      ? "lista"
      : (VERBOS.find(([re]) => re.test(cru))?.[1] ?? "lista");

  // Jeito de falar ANTES dos numeros: "tem um monte" nao pode virar "tem 1 monte".
  const brutos = ajustarFala(numerosPorExtenso(cru))
    .replace(/\b(mas|porem)\b/g, ", mas")
    // Ponto final tambem separa ("quer dizer, 5. Ah, e comprei..."); "1.5" nao (sem espaco).
    .split(/,| e |[.;!?](?=\s|$)/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Acao por pedaco, levada adiante ate outro verbo aparecer: "tenho 5 kg de arroz
  // e 3 cartelas de ovos" sao os dois estoque; "nao precisa comprar leite, nem
  // fermento" sao os dois remover. "Ja tem muito X" depois de negar e excesso.
  let acao: VozIntencao | "remover" = intencao;
  const pedacos = brutos.map((b) => {
    const excesso = /\b(muito|muita|demais|bastante|sobrando|de sobra)\b/.test(b);
    const zerou = /\bzerado\b/.test(b);
    // Falou mal do produto: nao comprar, ruim (antes de tudo: "nao presta" tem um "nao").
    if (/\bruim\b/.test(b)) acao = "remover";
    else if (zerou || /\b(nao tenho|nao tem mais|acabou|faltou|falta)\b/.test(b)) acao = "lista";
    else if (/\b(preciso|precisa|comprar|compra)\b/.test(b) && !NEGA.test(b)) acao = "lista";
    else if (NEGA.test(b)) acao = "remover";
    else if (excesso && (acao === "remover" || /\bja tem\b/.test(b))) acao = "remover";
    else if (/\b(comprei|peguei|botei|coloquei|custou|paguei)\b/.test(b)) acao = "carrinho";
    else if (
      /\b(tenho|temos|tem|sobrou|sobraram|em casa|conferindo|conferi|contei|tinha|tinham|havia|ficou|ficaram|restam|restaram|sao|caiu|baixou|subiu|virou|ta com|esta com|estao)\b/.test(b)
    )
      acao = "estoque";
    else if (AFIRMA.test(b) || /^mas\b/.test(b)) acao = "lista";
    const motivo: VozItem["motivo"] =
      acao !== "remover" ? undefined : motivoNaoComprar(b) === "ruim" ? "ruim" : excesso ? "excesso" : undefined;
    return { ...lePedaco(b), acao, motivo, zerou };
  });

  // A conta toda roda sem acento; o nome volta com o acento que foi falado
  // ("feijao" -> "feijão"), senao a lista ganhava "pao" e "acucar".
  const acento = new Map<string, string>();
  for (const w of (texto ?? "").toLowerCase().split(/[^\p{L}\d]+/u)) {
    if (w) acento.set(semAcento(w), w);
  }
  for (const p of pedacos) {
    p.nome = p.nome.split(" ").map((w) => acento.get(w) ?? w).join(" ");
  }

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
        delete ultimo.semQtd;
        // "tinha 13 creme de leite, agora tenho 6": o "agora tenho" diz que e estoque
        if (p.acao === "estoque" && !ultimo.remover) ultimo.destino = "estoque";
      }
      if (p.preco != null) ultimo.preco = +(p.preco / ultimo.qtd).toFixed(2);
      if (p.unidade) ultimo.unidade = p.unidade;
      continue;
    }
    // "nao compra fermento, ja tem muito fermento": o mesmo item duas vezes vira um,
    // com o motivo que apareceu.
    const repetido = itens.find((i) => i.nome === p.nome && !!i.remover === (p.acao === "remover"));
    if (repetido) {
      if (p.motivo && !repetido.motivo) repetido.motivo = p.motivo;
      // "tenho 13 creme de leite... na verdade tenho 6 creme de leite": vale o ultimo.
      if (!repetido.remover && p.qtd != null && p.qtd > 0) {
        repetido.qtd = p.qtd;
        if (p.unidade) repetido.unidade = p.unidade;
        repetido.destino = p.acao as VozIntencao;
        delete repetido.semQtd;
      }
      continue;
    }
    const qtd = p.qtd != null && p.qtd > 0 ? p.qtd : 1;
    itens.push({
      nome: p.nome,
      qtd,
      unidade: p.unidade ?? unitFor(p.nome),
      preco: p.preco != null && p.preco > 0 ? +(p.preco / qtd).toFixed(2) : null,
      ...(p.zerou && p.acao !== "remover" ? { zerou: true } : {}),
      ...(p.qtd == null && !p.zerou && p.acao === "estoque" ? { semQtd: true } : {}),
      ...(p.acao === "remover"
        ? { remover: true, ...(p.motivo ? { motivo: p.motivo } : {}) }
        : { destino: p.acao }),
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

// Linhas pendentes da lista que a pessoa quis tirar falando so o produto ("tira o
// cafe" tira "cafe" e "cafe pilao"). Nome exato ganha; sem exato, vale o que
// comeca com a palavra falada.
export function achaNaLista<T extends { id: string; name: string; status: string }>(
  nome: string,
  lista: T[],
): T[] {
  const n = semAcento(nome.toLowerCase()).trim();
  if (!n) return [];
  const pend = lista.filter((i) => i.status === "pending");
  const chave = (s: string) => semAcento(s.toLowerCase()).trim();
  const exato = pend.filter((i) => chave(i.name) === n);
  if (exato.length) return exato;
  const singular = n.replace(/s$/, "");
  return pend.filter((i) => {
    const k = chave(i.name);
    return k.startsWith(`${n} `) || k.startsWith(`${singular} `) || k === singular;
  });
}

// "Nao comprar" tem dois motivos, e eles fazem coisas diferentes: produto RUIM some
// das ofertas para sempre; EXCESSO (tem demais em casa) so fica em observacao ate o
// estoque baixar. Pela fala: falou mal do produto = ruim; o resto = excesso.
export function motivoNaoComprar(frase: string): "ruim" | "excesso" {
  return /\b(ruim|nao presta|pessim|horrivel|nao gost|nao prest|porcaria|aguad|vagabund|qualidade)/.test(
    normalizarFala(semAcento((frase ?? "").toLowerCase())),
  )
    ? "ruim"
    : "excesso";
}
