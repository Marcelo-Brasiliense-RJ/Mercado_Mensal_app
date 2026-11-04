// Foto da prateleira: onde esta cada produto (quadrado) e o que ele e. Duas passadas:
// 1) detectar: o Gemini devolve um quadrado (box_2d) por embalagem e o que leu nela;
// 2) conferir: o celular recorta cada quadrado, monta uma grade numerada e pergunta de
//    novo "o que tem em cada recorte?". Recorte que nao bate com o nome = quadrado
//    vermelho. E isso que garante o quadrado no produto certo, nao no vizinho.
// So no servidor.
import { gemini, type RespostaGemini } from "./gemini";

export type Achado = {
  box: [number, number, number, number]; // ymin, xmin, ymax, xmax em 0..1
  nome: string; // produto generico + marca, como a casa fala ("café pilão")
  rotulo: string; // como esta escrito ("Café Pilão Tradicional 250g")
  legivel: boolean;
  unidades: number; // quantas unidades dentro da embalagem (fardo de 12 leites = 12)
};

const DETECTAR = `Foto tirada no celular de um ou vários produtos de uma casa brasileira: pode ser um produto só na mão ou na mesa, ou um armário, despensa, geladeira, chão, bancada, ou o CARRINHO/cesta do mercado (produtos misturados, deitados, um em cima do outro, com a grade do carrinho na frente).
A foto costuma ser RUIM e é normal: torta ou de lado (rótulo de cabeça para baixo ou deitado), escura, de cima, meio desfocada, bagunçada, com produtos empilhados, um na frente do outro, caídos, cortados na borda da foto.
As embalagens também: pacotes abertos, dobrados, amassados ou fechados com prendedor de roupa; caixa de fardo (ex.: caixa de 12 leites); produto passado para saco plástico transparente ou pote sem rótulo.
Agrupe do jeito que se conta estoque em casa, UM quadrado por PRODUTO, com a quantidade:
- Unidades iguais juntas (lado a lado, empilhadas, uma atrás da outra, em fileira): UM quadrado em volta do GRUPO todo e "unidades" = quantas são, contando as de trás que aparecem só um pedaço (tampa, borda). Ex.: 4 garrafas de óleo Coamo juntas = 1 quadrado, unidades 4.
- Agrupe SÓ embalagens IDÊNTICAS (mesma marca, mesmo produto, mesmo tamanho). Produtos diferentes (outra marca, outro sabor, outro tipo) = quadrados separados, mesmo encostados. Ex.: passata Pramesa, molho Predilecta e molho tradicional Pramesa = 3 quadrados. Garrafas de bebidas diferentes juntas = um quadrado para CADA garrafa, nunca "bebidas ×4".
- Nunca use nome genérico de categoria ("bebida", "produto", "garrafa", "pacote", "alimento", "cereal" sozinho): ou o produto de verdade ("aperitivo aperol", "flocos de cereais neston"), ou vazio se não dá para saber.
- Caixa de fardo de papelão (ex.: "contém 12 unidades de 1L") ou pack plastificado (6 óleos, 12 latas): UM quadrado na caixa/pack, "unidades" = quantas tem dentro. Fechada: o número impresso ou o tamanho padrão. Aberta/faltando: conte o que dá para ver.
- O "nome" do fardo é o produto de dentro ("leite italac"), nunca "caixa" ou "fardo".
- Pacote vendido assim com várias coisinhas dentro (sachês, caixa de gelatina, caixa de chá) = 1 unidade.
- O mesmo produto separado em dois lugares da foto: dois quadrados com EXATAMENTE o mesmo "nome".
Para descobrir o que é, use tudo: texto em qualquer orientação, marca, cor e formato da embalagem, e o conteúdo que aparece (saco transparente com grão preto = "feijão preto", grão bege redondo = "grão de bico").
Para cada quadrado devolva:
- "box_2d": [ymin, xmin, ymax, xmax] de 0 a 1000, retângulo JUSTO em volta do produto/grupo inteiro (da tampa à base), sem pegar produto diferente vizinho.
- "rotulo": o que está escrito na frente (tipo, marca, variante, tamanho). Vazio se não dá para ler.
- "nome": o produto como se fala em casa, minúsculo, produto + marca + variante quando importa, sem tamanho ("café pilão", "leite italac", "molho de tomate pramesa", "passata pramesa"). Vazio se não sabe o que é.
- "unidades": inteiro, quantas unidades daquele produto o quadrado tem.
- "legivel": true se você leu a marca/produto com segurança; false se é palpite pelo formato/conteúdo, sem ler.
Não marque prateleira, parede, móvel, prendedor, sacola de mercado vazia nem reflexo. Máximo de 40 quadrados.`;

const ESQUEMA_DETECTAR = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
      rotulo: { type: "STRING" },
      nome: { type: "STRING" },
      legivel: { type: "BOOLEAN" },
      unidades: { type: "INTEGER" },
    },
    required: ["box_2d", "rotulo", "nome", "legivel", "unidades"],
  },
};

type Erro = Exclude<RespostaGemini, { ok: true }>;

// "Pramesa PASSATA DI POMODORO 300g" -> "pramesa passata di pomodoro"
export function nomeDoRotulo(rotulo: string): string {
  return rotulo
    .toLowerCase()
    .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|ml|l|lt|un|unid|unidades)\b/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

function partes(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  return m ? { mime_type: m[1], data: m[2] } : null;
}

// Nomes que a casa ja usa (estoque, carrinho): mesmo produto = mesmo nome. Isso deixa
// mais quadrados verdes e permite saber o que ja esta no carrinho (foto no mercado).
const COM_NOMES = (nomes: string[]) =>
  nomes.length
    ? `\nNomes que esta casa já usa. Se o produto da foto for um destes, use EXATAMENTE este nome em "nome". Se NÃO for nenhum destes, escreva o nome normalmente pelo rótulo: a lista é só ajuda, NUNCA deixe "nome" vazio para um produto que você leu.\n${nomes.map((n) => `- ${n}`).join("\n")}`
    : "";
const limparNomes = (nomes?: unknown) =>
  (Array.isArray(nomes) ? nomes : [])
    .filter((n): n is string => typeof n === "string" && n.trim().length > 1)
    .map((n) => n.trim().toLowerCase().slice(0, 60))
    .filter((n, i, a) => a.indexOf(n) === i)
    .slice(0, 120);

// Segunda passada ("o que faltou?"): a mesma foto com os quadrados ja achados
// desenhados em magenta e numerados. Numa passada so, a IA para nos produtos grandes e
// legiveis e larga o resto (tampinha atras, lata embaixo de outra, saco no canto).
const FALTOU = (ja: string[]) => `
ATENÇÃO: esta é uma SEGUNDA olhada. Os produtos já achados estão com contorno MAGENTA e número na foto:
${ja.map((n, i) => `${i + 1}. ${n || "(sem nome)"}`).join("\n")}
Ache SÓ os produtos que estão SEM contorno magenta. Varra a foto inteira por partes (cima à esquerda, cima à direita, meio, baixo, bordas) e procure principalmente: produtos pequenos (tampa, sachê, pote), os de trás que aparecem só um pedaço, os que estão embaixo ou atrás de outro, deitados, cortados na borda da foto, sacos e potes sem rótulo.
Não repita nenhum produto já contornado. Os "box_2d" são da foto inteira (o contorno magenta não faz parte do produto). Se não faltar nenhum, devolva lista vazia.`;

// ja: nomes dos quadrados ja desenhados na foto (segunda passada).
export async function detectar(foto: string, nomesCasa?: unknown, ja?: string[]): Promise<{ ok: true; itens: Achado[] } | Erro> {
  const img = partes(foto);
  if (!img) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      contents: [{ parts: [{ inline_data: img }, { text: DETECTAR + (ja ? FALTOU(ja) : "") + COM_NOMES(limparNomes(nomesCasa)) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_DETECTAR, temperature: 0 },
    },
    true, // posicao: o modelo mais forte na frente (o "lite" erra mais o quadrado)
    50000,
    55000, // a rota tem 60 s: responde antes de o servidor cortar
  );
  if (!g.ok) return g;
  // Resposta cortada no meio (muitos produtos) ainda aproveita os que vieram inteiros.
  let bruto: unknown;
  try {
    bruto = JSON.parse(g.texto);
  } catch {
    const corte = g.texto.lastIndexOf("}");
    try {
      bruto = JSON.parse(g.texto.slice(0, corte + 1).replace(/^[^[]*/, "") + "]");
    } catch {
      return { ok: false, erro: "ia_falhou" };
    }
  }
  const itens: Achado[] = [];
  for (const o of Array.isArray(bruto) ? bruto : []) {
    const b = (o as { box_2d?: unknown }).box_2d;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === "number")) continue;
    const [y0, x0, y1, x1] = (b as number[]).map((n) => Math.min(1000, Math.max(0, n)) / 1000);
    const r = o as { nome?: unknown; rotulo?: unknown; legivel?: unknown; unidades?: unknown };
    // A IA as vezes le o rotulo e deixa "nome" vazio: o nome sai do proprio rotulo.
    const rotulo = String(r.rotulo ?? "").trim();
    const nome = String(r.nome ?? "").trim().toLowerCase() || nomeDoRotulo(rotulo);
    const u = Math.round(Number(r.unidades));
    itens.push({
      box: [Math.min(y0, y1), Math.min(x0, x1), Math.max(y0, y1), Math.max(x0, x1)],
      nome,
      rotulo,
      legivel: r.legivel === true && !!nome,
      unidades: Number.isFinite(u) ? Math.min(48, Math.max(1, u)) : 1,
    });
  }
  return { ok: true, itens };
}

const CONFERIR = (n: number) => `A imagem é uma grade com ${n} recortes numerados (o número fica no canto de cada recorte).
Os recortes podem estar tortos, de lado ou de cabeça para baixo, escuros ou com o pacote aberto/amassado: leia mesmo assim.
Para CADA número, diga qual produto aparece no CENTRO daquele recorte: "nome" como se fala em casa (minúsculo, produto + marca, sem tamanho), vazio se não é um produto ou não dá para saber.
Responda um item por número, de 1 a ${n}.`;

const ESQUEMA_CONFERIR = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { n: { type: "INTEGER" }, nome: { type: "STRING" } },
    required: ["n", "nome"],
  },
};

// Grade de recortes numerados -> nome de cada um (indice 0 = recorte 1).
export async function conferir(grade: string, n: number, nomesCasa?: unknown): Promise<{ ok: true; nomes: string[] } | Erro> {
  const img = partes(grade);
  if (!img || n < 1) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      contents: [{ parts: [{ inline_data: img }, { text: CONFERIR(n) + COM_NOMES(limparNomes(nomesCasa)) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_CONFERIR, temperature: 0 },
    },
    false,
    45000,
    55000,
  );
  if (!g.ok) return g;
  const nomes = Array.from({ length: n }, () => "");
  try {
    for (const o of JSON.parse(g.texto) as { n?: number; nome?: string }[]) {
      const i = Number(o.n) - 1;
      if (i >= 0 && i < n) nomes[i] = String(o.nome ?? "").trim().toLowerCase();
    }
  } catch {
    return { ok: false, erro: "ia_falhou" };
  }
  return { ok: true, nomes };
}
