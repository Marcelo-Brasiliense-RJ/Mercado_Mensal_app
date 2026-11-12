// Nota fiscal pela FOTO do cupom, direto no Gemini: funciona com cupom de qualquer
// estado (o portal da SEFAZ-RJ bloqueia a leitura pelo QR, ver nfce-consulta). Cupom de
// compra do mes tem 50 a 100 itens e nao cabe numa foto: aceita varias fotos do MESMO
// cupom, em ordem, e a IA junta sem repetir o trecho que aparece em duas.
// So no servidor.
import { gemini, type RespostaGemini } from "./gemini";

import { juntarPartes, totalConfere, type Cupom, type ItemCupom } from "../cupomPartes";
export { juntarPartes, totalConfere, type Cupom, type ItemCupom };

export const LER_CUPOM = `Foto(s) de UM cupom fiscal (NFC-e) de supermercado brasileiro. Se vierem várias fotos, são partes do MESMO cupom, de cima para baixo: junte tudo e NÃO repita o item que aparece em duas fotos (a sobreposição entre uma foto e a próxima).
Leia TODAS as linhas de produto. Para cada uma:
- "nome": o produto genérico como se fala em casa, minúsculo, sem marca nem tamanho ("arroz", "leite", "papel higiênico", "detergente"). Decifre as abreviações do cupom ("ARR TP1 TIO JOAO 5KG" = arroz; "LT UHT INT ITALAC" = leite; "PAP HIG" = papel higiênico).
- "marca": a marca, se der para ler ("Tio João"), senão vazio.
- "qtd": a quantidade da linha (número). Produto pesado ("0,756 KG") = o peso.
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Pesado no caixa = "kg". Sem certeza, "un".
- "preco": preço de UMA unidade (o "vl unit"), em reais, número. Se a linha só tem o total, divida pela qtd.
- "duvida": true se a linha estava ilegível ou você não tem certeza do produto.
Desconto na linha seguinte ("DESC", "-2,00") abate do item de cima. Linha cancelada não entra.
Também devolva: "total": o valor total pago (número, 0 se não aparece), "emitente": o nome do mercado no topo, "chave": os 44 dígitos da chave de acesso, só números (vazio se não aparece inteira), "qtd_itens": o número da linha "Qtde. total de itens" do rodapé (0 se não aparece).
A foto pode ser só um PEDAÇO do cupom (o topo, o meio ou o rodapé): leia o que estiver nela, mesmo sem o começo ou o fim.
Não invente linha que não está na foto.`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: { type: "STRING" },
          marca: { type: "STRING" },
          qtd: { type: "NUMBER" },
          unidade: { type: "STRING" },
          preco: { type: "NUMBER" },
          duvida: { type: "BOOLEAN" },
        },
        required: ["nome", "qtd", "unidade", "preco"],
      },
    },
    total: { type: "NUMBER" },
    emitente: { type: "STRING" },
    chave: { type: "STRING" },
    qtd_itens: { type: "NUMBER" },
  },
  required: ["itens", "total", "emitente", "chave"],
};

const UNIDADES = new Set(["un", "kg", "g", "L", "ml", "pct", "cx", "dz"]);

export function normalizaCupom(bruto: unknown): Cupom {
  const j = (bruto ?? {}) as { itens?: unknown; total?: unknown; emitente?: unknown; chave?: unknown; qtd_itens?: unknown };
  const itens = (Array.isArray(j.itens) ? j.itens : [])
    .map((x) => {
      const i = (x ?? {}) as Record<string, unknown>;
      const u = String(i.unidade ?? "un").trim();
      const unidade = u.toLowerCase() === "l" ? "L" : UNIDADES.has(u.toLowerCase()) ? u.toLowerCase() : "un";
      const qtd = Number(i.qtd);
      const preco = Number(i.preco);
      return {
        nome: String(i.nome ?? "").trim().toLowerCase(),
        marca: String(i.marca ?? "").trim(),
        qtd: Number.isFinite(qtd) && qtd > 0 ? +qtd.toFixed(3) : 1,
        unidade,
        preco: Number.isFinite(preco) && preco >= 0 ? Math.round(preco * 100) / 100 : 0,
        duvida: i.duvida === true,
      };
    })
    .filter((i) => i.nome);
  const chave = String(j.chave ?? "").replace(/\D/g, "");
  const total = Number(j.total);
  return {
    itens,
    total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0,
    emitente: String(j.emitente ?? "").trim(),
    chave: chave.length === 44 ? chave : "",
    qtdItens: Number(j.qtd_itens) > 0 && Number(j.qtd_itens) < 1000 ? Math.round(Number(j.qtd_itens)) : 0,
  };
}

export async function lerCupom(fotos: string[]): Promise<({ ok: true } & Cupom) | Exclude<RespostaGemini, { ok: true }>> {
  // Varias fotos: uma chamada por foto, todas ao mesmo tempo (bem mais rapido que uma
  // chamada com todas). Se alguma falhar, cai na leitura unica de sempre.
  if (fotos.length > 1) {
    const partes = await Promise.all(fotos.map((f) => lerUma([f])));
    if (partes.every((p) => p.ok)) return { ok: true, ...juntarPartes(partes.map((p) => p as { ok: true } & Cupom)) };
  }
  return lerUma(fotos);
}

async function lerUma(fotos: string[]): Promise<({ ok: true } & Cupom) | Exclude<RespostaGemini, { ok: true }>> {
  const partes = fotos
    .map((f) => f.match(/^data:(image\/[a-z]+);base64,(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ inline_data: { mime_type: m[1], data: m[2] } }));
  if (!partes.length) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      contents: [{ parts: [...partes, { text: LER_CUPOM }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0 },
    },
    true, // cupom longo e abreviado: modelo forte na frente
    50000,
    55000, // cabe no limite de 60 s da rota
  );
  if (!g.ok) return g;
  try {
    return { ok: true, ...normalizaCupom(JSON.parse(g.texto)) };
  } catch {
    return { ok: false, erro: "ia_falhou" };
  }
}
