// Nota fiscal pela FOTO do cupom, direto no Gemini: funciona com cupom de qualquer
// estado (o portal da SEFAZ-RJ bloqueia a leitura pelo QR, ver nfce-consulta). Cupom de
// compra do mes tem 50 a 100 itens e nao cabe numa foto: aceita varias fotos do MESMO
// cupom, em ordem, e a IA junta sem repetir o trecho que aparece em duas.
// So no servidor.
import { gemini, type RespostaGemini } from "./gemini";

import { consertarLinha, consistencia, descontoNaLinha, juntarPartes, provaReal, totalConfere, type Cupom, type ItemCupom } from "../cupomPartes";
export { juntarPartes, totalConfere, type Cupom, type ItemCupom };

export const LER_CUPOM = `Foto(s) de UM cupom fiscal (NFC-e) de supermercado brasileiro. Se vierem várias fotos, são partes do MESMO cupom, de cima para baixo: junte tudo e NÃO repita o item que aparece em duas fotos (a sobreposição entre uma foto e a próxima).
Leia TODAS as linhas de produto. Para cada uma:
- "nome": o produto genérico como se fala em casa, minúsculo, sem marca nem tamanho ("arroz", "leite", "papel higiênico", "detergente"). Decifre as abreviações do cupom ("ARR TP1 TIO JOAO 5KG" = arroz; "LT UHT INT ITALAC" = leite; "PAP HIG" = papel higiênico).
- "marca": a marca, se der para ler ("Tio João"), senão vazio.
- "qtd": a quantidade da linha (número). Produto pesado ("0,756 KG") = o peso.
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Pesado no caixa = "kg". Sem certeza, "un".
- "preco": preço de UMA unidade (o "vl unit"), em reais, número. Se a linha só tem o total, divida pela qtd.
- "duvida": true se a linha estava ilegível ou você não tem certeza do produto.
- "total_linha": o valor TOTAL impresso NA LINHA do produto ("Vl Total"), número.
- "desconto": o valor de "desconto sobre item" / "DESC" que vem na linha LOGO ABAIXO do produto e abate dele (número positivo; 0 se não tem).
Linha cancelada não entra.
Também devolva: "total": o "Valor a Pagar" (o que foi pago, DEPOIS dos descontos; número, 0 se não aparece), "emitente": o nome do mercado no topo, "chave": os 44 dígitos da chave de acesso, só números (vazio se não aparece inteira), "qtd_itens": o número da linha "Qtde. total de itens" do rodapé (0 se não aparece).
A foto pode ser só um PEDAÇO do cupom (o topo, o meio ou o rodapé): leia o que estiver nela, mesmo sem o começo ou o fim.
Não invente linha que não está na foto.`;

export const ESQUEMA = {
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
          total_linha: { type: "NUMBER" },
          desconto: { type: "NUMBER" },
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
        ...(Number(i.total_linha) > 0 ? { totalLinha: Math.round(Number(i.total_linha) * 100) / 100 } : {}),
        ...(Number(i.desconto) > 0 ? { desconto: Math.round(Number(i.desconto) * 100) / 100 } : {}),
      };
    })
    .filter((i) => i.nome)
    .map(consertarLinha)
    .map(descontoNaLinha);
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
    const partes = await Promise.all(fotos.map((f) => lerCorrida([f])));
    if (partes.every((p) => p.ok)) return { ok: true, ...juntarPartes(partes.map((p) => p as { ok: true } & Cupom)) };
  }
  return lerCorrida(fotos);
}

type Lido = ({ ok: true } & Cupom) | Exclude<RespostaGemini, { ok: true }>;

// Leitura confiavel sem precisar esperar a mais lenta: cada linha bate qtd x preco com o
// total impresso e, se o rodape apareceu, a soma bate com a "Qtde. total de itens".
function confiavel(c: Cupom): boolean {
  if (!c.itens.length || consistencia(c.itens) < 0.9) return false;
  return !c.qtdItens || provaReal(c.itens, c.qtdItens)?.bate === true;
}

// CORRIDA (dono: "nao pode ficar 5.000 anos processando"). Todas as leitoras comecam
// JUNTAS e vale a primeira que passar na conferencia (confiavel). Antes o Google tentava
// um modelo DEPOIS do outro: em 2026-11-12 o 3.5-flash dava 503 ou ficava 40 s mudo, o
// 2.5-flash (o unico que respondia) precisava de ~45 s e nunca sobrava prazo para ele;
// a foto falhava inteira. Correndo juntos, cada um tem o prazo todo.
// Leitoras: Google 3.5-flash, Google 2.5-flash, Google lite e, com OPENROUTER_API_KEY,
// Gemini 2.5 Flash pela OpenRouter (~6 s, cobra centavos; sem credito so falha).
const LEITORAS_GOOGLE = [["gemini-3.5-flash"], ["gemini-2.5-flash"], ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]];
const PRAZO_MS = 55000; // cabe no limite de 60 s da rota

// Nenhuma passou na conferencia: a melhor das que leram (prova real > linhas que batem >
// mais linhas).
function nota(c: Cupom): number {
  const pr = c.qtdItens ? provaReal(c.itens, c.qtdItens)?.bate : false;
  return (pr ? 1000 : 0) + consistencia(c.itens) * 100 + c.itens.length;
}

async function lerCorrida(fotos: string[]): Promise<Lido> {
  const corredores: Promise<Lido>[] = LEITORAS_GOOGLE.map((m) => lerUma(fotos, m));
  if (process.env.OPENROUTER_API_KEY) corredores.push(lerOpenRouter(fotos, "google/gemini-2.5-flash"));
  const feitos: Lido[] = [];
  return new Promise<Lido>((resolve) => {
    let restam = corredores.length;
    const melhor = () => {
      const oks = feitos.filter((x): x is { ok: true } & Cupom => x.ok && x.itens.length > 0);
      if (oks.length) return oks.sort((a, b) => nota(b) - nota(a))[0];
      // "limite" (espere N s) so se TODAS estao sem cota; senao e falha passageira
      const lim = feitos.filter((x): x is { ok: false; erro: "limite"; espera: number } => !x.ok && x.erro === "limite");
      if (feitos.length === corredores.length && lim.length === feitos.length) return lim.sort((a, b) => a.espera - b.espera)[0];
      return { ok: false, erro: "ia_falhou" } as Lido;
    };
    // prazo da rota: entrega o melhor que tiver (uma leitora lenta nao derruba a foto)
    const t = setTimeout(() => resolve(melhor()), PRAZO_MS);
    for (const c of corredores) {
      void c.then((r) => {
        feitos.push(r);
        restam--;
        if ((r.ok && confiavel(r)) || restam === 0) {
          clearTimeout(t);
          resolve(r.ok && confiavel(r) ? r : melhor());
        }
      });
    }
  });
}

async function lerOpenRouter(fotos: string[], modelo: string): Promise<Lido> {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        // 4000 cortava a resposta no meio no cupom do mes (32+ linhas em JSON identado =
        // ~3.000 tokens so de texto) e a leitura inteira falhava ("Unexpected end of JSON").
        max_tokens: 12000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${LER_CUPOM}\nResponda SOMENTE JSON compacto, numa linha so, sem espacos nem quebras: {"itens":[{"nome","marca","qtd","unidade","preco","duvida","total_linha","desconto"}],"total","emitente","chave","qtd_itens"}` },
              ...fotos.map((f) => ({ type: "image_url", image_url: { url: f } })),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(50000),
    });
    if (!r.ok) {
      console.error("cupom: openrouter", modelo, r.status, (await r.text().catch(() => "")).slice(0, 200));
      return { ok: false, erro: "ia_falhou" };
    }
    const j = (await r.json()) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
    if (j.choices?.[0]?.finish_reason === "length") console.error("cupom: openrouter", modelo, "resposta cortada (max_tokens)");
    let txt = (j.choices?.[0]?.message?.content ?? "").trim();
    if (txt.startsWith("```")) txt = txt.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
    return { ok: true, ...normalizaCupom(JSON.parse(txt)) };
  } catch (e) {
    console.error("cupom: openrouter", modelo, String(e).slice(0, 200));
    return { ok: false, erro: "ia_falhou" };
  }
}

async function lerUma(fotos: string[], modelos: string[]): Promise<({ ok: true } & Cupom) | Exclude<RespostaGemini, { ok: true }>> {
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
    true,
    PRAZO_MS - 2000,
    PRAZO_MS - 2000,
    modelos,
  );
  if (!g.ok) return g;
  try {
    return { ok: true, ...normalizaCupom(JSON.parse(g.texto)) };
  } catch {
    return { ok: false, erro: "ia_falhou" };
  }
}

// ---------------------------------------------------------------------------------
// ONDE ESTA O QUE FALTOU (dono, 2026-11-12: "45 de 46: voce sabe mais ou menos onde nao
// foi captado, para a pessoa olhar na nota e bater o alvo exato"). Segunda olhada na
// foto, agora com a lista do que JA foi lido, em ordem, numerada: a IA so precisa achar
// a diferenca. Devolve a linha que ficou de fora (com o texto como esta impresso e entre
// quais linhas da lista ela fica) ou a linha da lista com a quantidade lida errada.
export type Faltante = {
  tipo: "linha" | "quantidade" | "repetida";
  texto: string; // como esta impresso no cupom ("DESINF.BUFALO 1X2L")
  nome: string;
  marca: string;
  qtd: number;
  unidade: string;
  preco: number;
  depoisDe: number; // n da linha da lista logo acima (0 = antes da primeira)
  indice: number; // tipo quantidade: n da linha da lista com a quantidade errada
};
export type LidoResumo = { nome: string; qtd: number; unidade: string; preco: number };

const ESQUEMA_FALTA = {
  type: "OBJECT",
  properties: {
    faltam: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["linha", "quantidade", "repetida"] },
          texto: { type: "STRING" },
          nome: { type: "STRING" },
          marca: { type: "STRING" },
          qtd: { type: "NUMBER" },
          unidade: { type: "STRING" },
          preco: { type: "NUMBER" },
          depois_de: { type: "NUMBER" },
          indice: { type: "NUMBER" },
        },
        required: ["tipo", "texto", "nome", "qtd", "preco", "depois_de"],
      },
    },
  },
  required: ["faltam"],
};

export function promptFalta(lidos: LidoResumo[], qtdItens: number, contados: number): string {
  const lista = lidos.map((l, i) => `${i + 1}. ${l.nome} | ${String(l.qtd).replace(".", ",")} ${l.unidade} | R$ ${l.preco.toFixed(2).replace(".", ",")}`).join("\n");
  return `Foto(s) de UM cupom fiscal de supermercado (se várias, partes do mesmo cupom, de cima para baixo). O rodapé diz "Qtde. total de itens ${qtdItens}" (a soma das quantidades; produto pesado em kg conta 1).
Já li estas linhas, NA ORDEM do cupom (n. nome | qtd | preço unitário):
${lista}
${
    contados < qtdItens
      ? `Elas somam ${contados}; faltam ${qtdItens - contados}. Olhe o cupom LINHA POR LINHA, comparando com a lista, e ache o que ficou de fora:
- tipo "linha": uma linha de produto do cupom que NÃO está na lista. "texto" = a descrição como está impressa; "nome" = o produto genérico em minúsculo (como na lista); "marca"; "qtd"; "unidade" (un, kg, g, L, ml, pct, cx, dz); "preco" = preço unitário; "depois_de" = o número da linha da lista que fica LOGO ACIMA dela no cupom (0 se ela é a primeira).
- tipo "quantidade": uma linha da lista cuja quantidade foi lida errada. "indice" = o número dela na lista; "qtd" = a quantidade certa; "texto" = como está impressa; "depois_de" = o mesmo número.`
      : `Elas somam ${contados}; SOBRAM ${contados - qtdItens}. Olhe o cupom LINHA POR LINHA, comparando com a lista, e ache o que está a mais na lista:
- tipo "repetida": uma linha da lista que entrou duas vezes ou que não existe no cupom. "indice" = o número dela na lista (a cópia a mais); "texto" = como está impressa (ou vazio se não existe); "nome", "qtd", "preco" = os da lista; "depois_de" = o mesmo número.
- tipo "quantidade": uma linha da lista com a quantidade lida A MAIS. "indice" = o número dela na lista; "qtd" = a quantidade certa; "texto" = como está impressa; "depois_de" = o mesmo número.`
  }
Devolva só o que você VÊ no cupom; não invente. Nada que dê para ver: "faltam" vazio.`;
}

export function normalizaFalta(bruto: unknown, lidos: LidoResumo[]): Faltante[] {
  const nLidos = lidos.length;
  const arr = Array.isArray((bruto as { faltam?: unknown })?.faltam) ? (bruto as { faltam: unknown[] }).faltam : [];
  return arr
    .map((x) => {
      const i = (x ?? {}) as Record<string, unknown>;
      const u = String(i.unidade ?? "un").trim();
      const tipo: Faltante["tipo"] = i.tipo === "quantidade" ? "quantidade" : i.tipo === "repetida" ? "repetida" : "linha";
      const qtd = Number(i.qtd);
      const preco = Number(i.preco);
      const dep = Math.round(Number(i.depois_de));
      const ind = Math.round(Number(i.indice ?? i.depois_de));
      return {
        tipo,
        texto: String(i.texto ?? "").trim(),
        nome: String(i.nome ?? "").trim().toLowerCase(),
        marca: String(i.marca ?? "").trim(),
        qtd: Number.isFinite(qtd) && qtd > 0 ? +qtd.toFixed(3) : 1,
        unidade: u.toLowerCase() === "l" ? "L" : UNIDADES.has(u.toLowerCase()) ? u.toLowerCase() : "un",
        preco: Number.isFinite(preco) && preco >= 0 ? Math.round(preco * 100) / 100 : 0,
        depoisDe: Number.isFinite(dep) ? Math.min(Math.max(0, dep), nLidos) : 0,
        indice: Number.isFinite(ind) && ind >= 1 && ind <= nLidos ? ind : 0,
      };
    })
    // "quantidade" com a mesma quantidade que ja foi lida nao corrige nada (visto no teste)
    .filter((f) =>
      f.tipo === "linha" ? !!f.nome : f.tipo === "repetida" ? f.indice > 0 : f.indice > 0 && Math.abs(f.qtd - lidos[f.indice - 1].qtd) > 0.001,
    )
    .slice(0, 5);
}

export async function acharFaltantes(fotos: string[], lidos: LidoResumo[], qtdItens: number, contados: number): Promise<Faltante[] | null> {
  const texto = promptFalta(lidos, qtdItens, contados);
  const partes = fotos
    .map((f) => f.match(/^data:(image\/[a-z]+);base64,(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ inline_data: { mime_type: m[1], data: m[2] } }));
  if (!partes.length) return null;
  const google = (modelos: string[]) =>
    gemini(
      { contents: [{ parts: [...partes, { text: texto }] }], generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_FALTA, temperature: 0 } },
      true,
      PRAZO_MS - 2000,
      PRAZO_MS - 2000,
      modelos,
    ).then((g) => (g.ok ? normalizaFalta(JSON.parse(g.texto), lidos) : Promise.reject(g)));
  const corredores = LEITORAS_GOOGLE.map((m) => google(m));
  if (process.env.OPENROUTER_API_KEY) corredores.push(faltaOpenRouter(fotos, texto, lidos));
  // a primeira que ACHAR algo; se todas acharem nada, nada; se todas falharem, null
  return new Promise((resolve) => {
    let restam = corredores.length;
    let vazio = false;
    const t = setTimeout(() => resolve(vazio ? [] : null), PRAZO_MS);
    for (const c of corredores) {
      c.then(
        (r) => {
          if (r.length) {
            clearTimeout(t);
            return resolve(r);
          }
          vazio = true;
        },
        () => {},
      ).finally(() => {
        if (--restam === 0) {
          clearTimeout(t);
          resolve(vazio ? [] : null);
        }
      });
    }
  });
}

async function faltaOpenRouter(fotos: string[], texto: string, lidos: LidoResumo[]): Promise<Faltante[]> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${texto}\nResponda SOMENTE JSON compacto: {"faltam":[{"tipo","texto","nome","marca","qtd","unidade","preco","depois_de","indice"}]}` },
            ...fotos.map((f) => ({ type: "image_url", image_url: { url: f } })),
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  let txt = (j.choices?.[0]?.message?.content ?? "").trim();
  if (txt.startsWith("```")) txt = txt.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
  return normalizaFalta(JSON.parse(txt), lidos);
}
