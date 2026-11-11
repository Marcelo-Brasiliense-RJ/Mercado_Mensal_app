// NFC-e do RJ pelo QR, no servidor do app.
//
// O portal da SEFAZ-RJ bloqueia acesso de servidor (bloqueio por IP de datacenter e de
// listas de reputacao; confirmado em 2026-11-11, devolve a pagina "As operadoras de
// telecomunicacao..."). Por isso a busca da pagina pode passar por um INTERMEDIARIO
// com IP brasileiro comum (o n8n da casa ou um computador em casa, ver relay/README.md):
//   NFCE_RELAY_URL    = endereco do intermediario (POST {url} -> {html})
//   NFCE_RELAY_SECRET = segredo combinado (cabecalho x-relay-secret)
// Sem intermediario, tenta direto (vale se um dia o portal liberar).
// So no servidor.
import { gemini } from "./gemini";

export type ItemSefaz = { desc_fiscal: string; qtd: number; unidade: string; preco: number; total_item: number };
export type NotaSefaz = { emitente: string; chave: string; total_nota: number; itens: ItemSefaz[] };

export function numeroBr(s: string): number {
  const n = parseFloat((s || "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const semTags = (s: string) =>
  s.replace(/<strong>[\s\S]*?<\/strong>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
const campo = (bloco: string, classe: string) => {
  const m = bloco.match(new RegExp(`<span[^>]*class="${classe}"[^>]*>([\\s\\S]*?)</span>`, "i"));
  return m ? semTags(m[1]) : "";
};

// Pagina padrao "consultaNFCe" (RJ e outros estados que usam a mesma webapp).
export function lerPaginaNfce(html: string): NotaSefaz {
  const itens: ItemSefaz[] = [];
  for (const m of html.matchAll(/<tr[^>]*id="Item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const b = m[1];
    const desc = campo(b, "txtTit");
    if (!desc) continue;
    itens.push({
      desc_fiscal: desc,
      qtd: numeroBr(campo(b, "Rqtd")) || 1,
      unidade: (campo(b, "RUN") || "un").toLowerCase(),
      preco: numeroBr(campo(b, "RvlUnit")),
      total_item: numeroBr(campo(b, "valor")),
    });
  }
  const emitente = semTags(html.match(/class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
  const chave = (html.match(/class="chave"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "").replace(/\D/g, "");
  const total = html.match(/class="totalNumb txtMax"[^>]*>([^<]*)</i)?.[1] ?? "";
  return { emitente, chave: chave.length === 44 ? chave : "", total_nota: numeroBr(total), itens };
}

// Bloqueio por IP ("operadoras...") ou o antirrobo F5 ("humano ou robo", codigo da imagem).
export const bloqueado = (html: string) =>
  /operadoras de telecomunica/i.test(html) || (/captcha|humano ou rob|c[oó]digo da imagem/i.test(html) && !/tabResult/i.test(html));

// So endereco de consulta de NFC-e do governo: o intermediario nao vira proxy aberto.
export const urlDeNota = (u: string) => /^https?:\/\/([a-z0-9-]+\.)*fazenda\.[a-z]{2}\.gov\.br\//i.test(u);

export async function buscarPagina(url: string): Promise<{ ok: true; html: string } | { ok: false; erro: string }> {
  const relay = process.env.NFCE_RELAY_URL;
  try {
    const r = relay
      ? await fetch(relay, {
          method: "POST",
          headers: { "content-type": "application/json", "x-relay-secret": process.env.NFCE_RELAY_SECRET ?? "" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(15000),
        })
      : await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { ok: false, erro: "sefaz_indisponivel" };
    const texto = await r.text();
    let html = texto;
    if (relay) {
      try {
        html = (JSON.parse(texto) as { html?: string }).html ?? texto;
      } catch {
        /* o intermediario devolveu o HTML puro */
      }
    }
    if (bloqueado(html)) return { ok: false, erro: "sefaz_bloqueou" };
    return { ok: true, html };
  } catch {
    return { ok: false, erro: "sefaz_indisponivel" };
  }
}

// Descricao fiscal -> produto generico + marca, pela IA (o mesmo vocabulario do
// carrinho, senao "ARR TP1 TIO JOAO" nao casa com "arroz" na conferencia).
// Sem IA, fica a descricao em minusculo.
export async function normalizar(itens: ItemSefaz[]): Promise<{ nome: string; marca: string }[]> {
  const cru = itens.map((i) => ({ nome: i.desc_fiscal.toLowerCase(), marca: "" }));
  if (!itens.length) return cru;
  const lista = itens.map((it, i) => `${i}: ${it.desc_fiscal}`).join("\n");
  const g = await gemini({
    systemInstruction: {
      parts: [
        {
          text: `Normalize descricoes fiscais de cupom (NFC-e) brasileiro. Para cada linha devolva o produto generico como se fala em casa (minusculo, singular, sem marca nem gramatura: "ARR TP1 TIO JOAO 5KG" -> "arroz"; "CRE DEN COLGATE" -> "creme dental"; "PAP HIG NEVE 12UN" -> "papel higienico") e a marca (minusculo, "" se nao houver). Responda so JSON: {"itens":[{"i":0,"nome":"","marca":""}]}`,
        },
      ],
    },
    contents: [{ parts: [{ text: lista }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  if (!g.ok) return cru;
  try {
    const j = JSON.parse(g.texto) as { itens?: { i: number; nome: string; marca: string }[] };
    const por = new Map((j.itens ?? []).map((x) => [Number(x.i), x]));
    return itens.map((it, i) => ({
      nome: (por.get(i)?.nome || it.desc_fiscal).toLowerCase().trim(),
      marca: (por.get(i)?.marca || "").trim(),
    }));
  } catch {
    return cru;
  }
}
