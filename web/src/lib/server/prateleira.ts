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
};

const DETECTAR = `Foto de prateleira, armário, despensa ou geladeira de uma casa brasileira.
Encontre CADA embalagem de produto visível (uma por uma: 3 pacotes iguais lado a lado = 3 itens).
Para cada uma devolva:
- "box_2d": [ymin, xmin, ymax, xmax] de 0 a 1000, um retângulo JUSTO em volta daquela embalagem inteira (da tampa à base, borda a borda), sem pegar a embalagem vizinha.
- "rotulo": o que está escrito na frente (tipo, marca, variante, tamanho). Vazio se não dá para ler.
- "nome": o produto como se fala em casa, minúsculo, produto + marca, sem tamanho ("café pilão", "leite italac", "detergente ypê"). Vazio se não sabe o que é.
- "legivel": true se você leu a marca/produto com segurança; false se é palpite ou não dá para ler.
Não marque prateleira, parede, móvel nem reflexo. Máximo de 60 itens.`;

const ESQUEMA_DETECTAR = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
      rotulo: { type: "STRING" },
      nome: { type: "STRING" },
      legivel: { type: "BOOLEAN" },
    },
    required: ["box_2d", "rotulo", "nome", "legivel"],
  },
};

type Erro = Exclude<RespostaGemini, { ok: true }>;

function partes(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  return m ? { mime_type: m[1], data: m[2] } : null;
}

export async function detectar(foto: string): Promise<{ ok: true; itens: Achado[] } | Erro> {
  const img = partes(foto);
  if (!img) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      contents: [{ parts: [{ inline_data: img }, { text: DETECTAR }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_DETECTAR, temperature: 0 },
    },
    true, // posicao: o modelo mais forte na frente (o "lite" erra mais o quadrado)
    60000,
  );
  if (!g.ok) return g;
  let bruto: unknown;
  try {
    bruto = JSON.parse(g.texto);
  } catch {
    return { ok: false, erro: "ia_falhou" };
  }
  const itens: Achado[] = [];
  for (const o of Array.isArray(bruto) ? bruto : []) {
    const b = (o as { box_2d?: unknown }).box_2d;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === "number")) continue;
    const [y0, x0, y1, x1] = (b as number[]).map((n) => Math.min(1000, Math.max(0, n)) / 1000);
    const r = o as { nome?: unknown; rotulo?: unknown; legivel?: unknown };
    itens.push({
      box: [Math.min(y0, y1), Math.min(x0, x1), Math.max(y0, y1), Math.max(x0, x1)],
      nome: String(r.nome ?? "").trim().toLowerCase(),
      rotulo: String(r.rotulo ?? "").trim(),
      legivel: r.legivel === true,
    });
  }
  return { ok: true, itens };
}

const CONFERIR = (n: number) => `A imagem é uma grade com ${n} recortes numerados (o número fica no canto de cada recorte).
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
export async function conferir(grade: string, n: number): Promise<{ ok: true; nomes: string[] } | Erro> {
  const img = partes(grade);
  if (!img || n < 1) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      contents: [{ parts: [{ inline_data: img }, { text: CONFERIR(n) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_CONFERIR, temperature: 0 },
    },
    false,
    45000,
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
