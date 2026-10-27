// Preco de um produto no mercado onde a pessoa esta: o do encarte (promocao daquele
// mercado) ou o ultimo que a casa viu la. Puro, para testar.
import { nomeCompleto, padrao, prazo, type Oferta } from "./ofertas";

export type PrecoVisto = { item: string; barcode: string | null; preco: number; visto_em: string };
export type Sugestao = { preco: number; origem: "encarte" | "visto"; texto: string };

const palavras = (s: string) =>
  padrao(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !/^\d/.test(p));

// Mesma oferta do produto lido? A primeira palavra tem que bater e 70% das palavras
// do nome da oferta tem que estar no nome do codigo ("Desodorizador Sanitario Inspira
// Citrus" casa "Desodorizador Sanitário Limppano Inspira Citrus 42g").
export function semelhanca(nomeProduto: string, o: Oferta): number {
  const a = new Set(palavras(nomeProduto));
  const b = palavras(nomeCompleto(o));
  if (!a.size || !b.length || !a.has(b[0])) return 0;
  return b.filter((p) => a.has(p)).length / b.length;
}

export function precoNoMercado(
  nome: string,
  barcode: string | null,
  mercado: string | null,
  ofertas: Oferta[],
  vistos: PrecoVisto[],
  nomeMercado: (m: string) => string,
): Sugestao | null {
  if (!mercado || !nome.trim()) return null;
  const doMercado = ofertas
    .filter((o) => o.mercado === mercado)
    .map((o) => ({ o, s: semelhanca(nome, o) }))
    .filter((x) => x.s >= 0.7)
    .sort((x, y) => y.s - x.s || x.o.preco_por - y.o.preco_por);
  if (doMercado[0]) {
    const o = doMercado[0].o;
    const p = prazo(o);
    return { preco: o.preco_por, origem: "encarte", texto: `Preço do encarte do ${nomeMercado(mercado)}${p ? ` · ${p.texto.toLowerCase()}` : ""}` };
  }
  const n = nome.trim().toLowerCase();
  const v = vistos.find((x) => barcode && x.barcode === barcode) ?? vistos.find((x) => x.item === n);
  if (v) {
    const d = new Date(v.visto_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return { preco: Number(v.preco), origem: "visto", texto: `Último preço no ${nomeMercado(mercado)} (${d})` };
  }
  return null;
}
