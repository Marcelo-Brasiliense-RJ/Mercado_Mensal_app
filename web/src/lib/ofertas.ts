// Aba Ofertas: cruza as ofertas dos mercados (0038) com o que falta em casa (0037).
// Tudo aqui e funcao pura para poder testar sem tela nem banco.

export type Oferta = {
  id: number;
  mercado: string;
  produto: string;
  marca: string;
  tamanho: string;
  categoria: string;
  preco_por: number;
  preco_de: number | null;
  condicao: string | null;
  fim: string | null;
  tem_foto: boolean;
};

export type ItemFalta = {
  nome: string;
  unidade: string;
  origem: "lista" | "repor";
  quantidade: number;
  ultimo_preco: number | null;
  ultima_marca: string | null;
};

export const MERCADOS: Record<string, { nome: string; cor: string }> = {
  mundial: { nome: "Mundial", cor: "#C8352B" },
  guanabara: { nome: "Guanabara", cor: "#2559B0" },
  supermarket: { nome: "Supermarket", cor: "#157A45" },
  superbom: { nome: "Superbom", cor: "#B0600E" },
  economia: { nome: "Rede Economia", cor: "#7340B8" },
};
export const nomeMercado = (m: string) => MERCADOS[m]?.nome ?? m;
export const corMercado = (m: string) => MERCADOS[m]?.cor ?? "#6B5E55";

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "1 Litro", "1L" e "1 l" viram "1l"; "5 kg" vira "5kg". O termo casa com qualquer grafia.
export function padrao(s: string): string {
  return semAcento(s)
    .replace(/(\d)[\s,.]*(litros?|lt)\b/g, "$1l")
    .replace(/(\d)\s+(kg|g|ml|l|un)\b/g, "$1$2");
}

export const nomeCompleto = (o: Oferta) =>
  [o.produto, o.marca, o.tamanho].filter(Boolean).join(" ");

// A primeira palavra do item abre o nome da oferta ("leite" casa "Leite em Po", nao
// "Sabonete Leite de Cabra"); as outras podem estar em qualquer lugar ("leite integral").
export function casaItem(o: Oferta, termo: string): boolean {
  const nome = padrao(nomeCompleto(o));
  const [primeira, ...resto] = padrao(termo).split(/\s+/).filter(Boolean);
  return !!primeira && nome.startsWith(primeira) && resto.every((p) => nome.includes(p));
}

// Busca livre: todas as palavras, em qualquer ordem ("arroz 5kg" acha "Arroz Rei do Sul 5kg").
export function casaBusca(o: Oferta, busca: string): boolean {
  const nome = padrao(`${nomeCompleto(o)} ${o.categoria} ${nomeMercado(o.mercado)}`);
  return padrao(busca).split(/\s+/).filter(Boolean).every((p) => nome.includes(p));
}

// Tamanho da embalagem lido do nome, para comparar 1 kg com 5 kg pelo preco por kg.
export function medida(o: Oferta): { q: number; u: "kg" | "L" } | null {
  const m = padrao(nomeCompleto(o)).match(/(\d+(?:[.,]\d+)?)(kg|g|ml|l)\b/);
  if (!m) return null;
  const q = parseFloat(m[1].replace(",", "."));
  if (!q) return null;
  if (m[2] === "g") return { q: q / 1000, u: "kg" };
  if (m[2] === "ml") return { q: q / 1000, u: "L" };
  return { q, u: m[2] === "l" ? "L" : "kg" };
}

export function porUnidade(o: Oferta): { valor: number; u: "kg" | "L" } | null {
  const t = medida(o);
  return t ? { valor: o.preco_por / t.q, u: t.u } : null;
}

// Mais barato primeiro: por kg/L quando da para medir; sem medida vai para o fim.
export function maisBarato(a: Oferta, b: Oferta): number {
  const x = porUnidade(a);
  const y = porUnidade(b);
  if (x && y && x.u === y.u) return x.valor - y.valor;
  if (x && !y) return -1;
  if (!x && y) return 1;
  return a.preco_por - b.preco_por;
}

export const desconto = (o: Oferta) =>
  o.preco_de && o.preco_de > o.preco_por ? Math.round((1 - o.preco_por / o.preco_de) * 100) : 0;

export type Resumo = {
  itens: { item: ItemFalta; opcoes: Oferta[] }[];
  // Por mercado: o mais barato de cada item dentro dele.
  mercados: { mercado: string; itens: number; total: number }[];
  comOferta: number;
  melhorTotal: number;
  lojasMelhor: number;
  achados: Oferta[];
};

const CASA = ["Mercearia", "Frios e Laticínios", "Carnes", "Hortifruti", "Padaria", "Bebidas", "Limpeza", "Congelados"];

export function resumir(ofertas: Oferta[], lista: ItemFalta[]): Resumo {
  const itens = lista.map((item) => ({
    item,
    opcoes: ofertas.filter((o) => casaItem(o, item.nome)).sort(maisBarato),
  }));
  const com = itens.filter((x) => x.opcoes.length);
  const lojas = [...new Set(ofertas.map((o) => o.mercado))];
  const mercados = lojas
    .map((mercado) => {
      const achados = com.map((x) => x.opcoes.find((o) => o.mercado === mercado)).filter(Boolean) as Oferta[];
      return { mercado, itens: achados.length, total: achados.reduce((t, o) => t + o.preco_por, 0) };
    })
    .sort((a, b) => b.itens - a.itens || a.total - b.total);

  // Achados: maior desconto de verdade em comida e limpeza, fora do que ja falta, 1 por produto.
  const naLista = new Set(com.flatMap((x) => x.opcoes.map((o) => o.id)));
  const vistos = new Set<string>();
  const achados = ofertas
    .filter((o) => desconto(o) >= 15 && CASA.includes(o.categoria) && !naLista.has(o.id))
    .sort((a, b) => desconto(b) - desconto(a))
    .filter((o) => {
      const k = padrao(o.produto).split(" ").slice(0, 3).join(" ");
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, 8);

  return {
    itens: [...com, ...itens.filter((x) => !x.opcoes.length)],
    mercados,
    comOferta: com.length,
    melhorTotal: com.reduce((t, x) => t + x.opcoes[0].preco_por, 0),
    lojasMelhor: new Set(com.map((x) => x.opcoes[0].mercado)).size,
    achados,
  };
}

// "ate ter 27/10", "termina hoje", ou nada (preco do site, sem validade).
export function prazo(o: Oferta, agora = new Date()): { texto: string; urgente: boolean } | null {
  if (!o.fim) return null;
  const fim = new Date(o.fim);
  const dia = (d: Date) => Math.floor(new Date(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })).getTime() / 864e5);
  const dias = dia(fim) - dia(agora);
  if (dias <= 0) return { texto: "Termina hoje", urgente: true };
  if (dias === 1) return { texto: "Termina amanhã", urgente: true };
  const d = fim.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return { texto: `Até ${d.replace(".", "")}`, urgente: false };
}
