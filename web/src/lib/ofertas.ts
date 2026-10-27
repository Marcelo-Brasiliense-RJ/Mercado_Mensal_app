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

// Oferta melhor que o preco que a pessoa esta pagando agora (carrinho) ou espera pagar.
// Compara por kg/L quando o item e vendido assim e a oferta tem a medida no nome;
// senao, preco contra preco. So avisa com folga (2% e 10 centavos): aviso que nao
// muda a decisao so atrapalha no corredor.
export function melhorQue(
  ofertas: Oferta[],
  nome: string,
  preco: number | null,
  unidade = "un",
): { oferta: Oferta; economia: number } | null {
  if (!nome.trim()) return null;
  const opcoes = ofertas.filter((o) => casaItem(o, nome)).sort(maisBarato);
  if (!opcoes.length) return null;
  if (preco == null || !(preco > 0)) return null;
  const u = unidade.toLowerCase();
  const porPeso = u === "kg" || u === "l";
  for (const o of opcoes) {
    const pu = porUnidade(o);
    const valor = porPeso && pu && pu.u.toLowerCase() === u ? pu.valor : porPeso ? null : o.preco_por;
    if (valor == null) continue;
    const economia = preco - valor;
    if (economia >= 0.1 && economia / preco >= 0.02) return { oferta: o, economia };
    return null; // a melhor comparavel nao ganha: as outras tambem nao
  }
  return null;
}

// O mais barato agora para um item da lista, sem preco de referencia (selo na Lista).
export function maisBarataPara(ofertas: Oferta[], nome: string): Oferta | null {
  return ofertas.filter((o) => casaItem(o, nome)).sort(maisBarato)[0] ?? null;
}

// Preco bem acima do que a casa pagou da ultima vez: 15% e R$ 0,50 de folga, para nao
// apitar por centavo. null quando nao ha compra anterior ou o preco esta normal.
export function precoSubiu(preco: number | null, ultimo: number | null | undefined): number | null {
  if (preco == null || !(preco > 0) || ultimo == null || !(ultimo > 0)) return null;
  const alta = (preco - ultimo) / ultimo;
  return alta >= 0.15 && preco - ultimo >= 0.5 ? alta : null;
}

// Ordem dos corredores de um supermercado tipico: entrada pelo hortifruti, limpeza no fundo.
export const CORREDOR = [
  "Hortifruti", "Padaria", "Carnes", "Frios e Laticínios", "Congelados", "Mercearia",
  "Doces e Biscoitos", "Bebidas", "Limpeza", "Perfumaria e Higiene", "Bebê", "Pet", "Utilidades", "Outros",
];
export const corredor = (categoria?: string | null) => {
  const i = CORREDOR.indexOf(categoria ?? "");
  return i < 0 ? CORREDOR.length : i;
};

// Itens da lista que valem comprar em cada mercado (onde esta a oferta mais barata deles).
export function porMercado<T extends { name: string }>(itens: T[], ofertas: Oferta[]) {
  const melhor = new Map<T, Oferta>();
  const conta: Record<string, number> = {};
  for (const i of itens) {
    const o = maisBarataPara(ofertas, i.name);
    if (!o) continue;
    melhor.set(i, o);
    conta[o.mercado] = (conta[o.mercado] ?? 0) + 1;
  }
  return { melhor, conta };
}

// ============ De olho (0039) ============
export type Desejo = {
  id: number;
  termo: string;
  nome: string;
  tem_foto: boolean;
  // historico guardado pelo monitor (0042): ultima promocao vista e a menor de todas
  ultimo_preco?: number | null;
  ultimo_mercado?: string | null;
  ultimo_fim?: string | null;
  ultimo_visto?: string | null;
  menor_preco?: number | null;
  menor_mercado?: string | null;
  menor_em?: string | null;
};

const PEQUENAS = new Set(["de", "da", "do", "em", "com", "e", "c/", "s/", "para", "tipo"]);

// O que vigiar a partir de uma oferta: as duas primeiras palavras do produto ("Acém em
// Bife" -> "acem bife"). Curto o bastante para pegar o mesmo produto no encarte de outro
// mercado, que escreve diferente, e longo o bastante para nao virar "qualquer acem".
export function termoDe(o: Oferta): string {
  return padrao(o.produto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !PEQUENAS.has(p) && !/^\d/.test(p))
    .slice(0, 2)
    .join(" ");
}

// Encarte junta produtos num preco so: "Paleta, Peito ou Acém Bovino". Cada pedaco conta
// como inicio de nome, entao quem vigia "acem" acha essa oferta (e "leite" continua sem
// pegar "Sabonete Leite de Cabra").
const pedacos = (produto: string) => produto.split(/,|\s+ou\s+|\s+e\s+|\//i).map((p) => p.trim()).filter(Boolean);

export function casaDesejo(o: Oferta, termo: string): boolean {
  const nome = padrao(nomeCompleto(o));
  // pontuacao fora: desejo antigo gravado como "paleta, peito" ainda casa
  const [primeira, ...resto] = padrao(termo).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (
    !!primeira &&
    pedacos(o.produto).some((p) => padrao(p).startsWith(primeira)) &&
    resto.every((p) => nome.includes(p))
  );
}

// Nome com a grafia do encarte: "acem" vira "Acém" quando ha oferta com essa palavra.
export function nomeBonito(termo: string, ofertas: Oferta[]): string {
  const t = termo.trim();
  const n = t.split(/\s+/).length;
  for (const o of ofertas) {
    if (!casaDesejo(o, t)) continue;
    for (const p of pedacos(o.produto)) {
      const pedaco = p.split(/\s+/).slice(0, n).join(" ");
      if (padrao(pedaco) === padrao(t)) return pedaco.charAt(0).toUpperCase() + pedaco.slice(1);
    }
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// As ofertas de um desejo, mais barata primeiro.
export const ofertasDo = (d: Desejo, ofertas: Oferta[]) =>
  ofertas.filter((o) => casaDesejo(o, d.termo)).sort(maisBarato);

// Desejos que esta oferta atende (a estrela do card acende).
export const desejosDa = (o: Oferta, desejos: Desejo[]) => desejos.filter((d) => casaDesejo(o, d.termo));

// O que falta em casa, montado na hora com o que o app ja tem carregado: lista de
// compras pendente + Repor do estoque (mesmo corte da 0037: nivel normal definido e
// abaixo da metade). Antes vinha da RPC junto com as ofertas e ficava 10 min em cache:
// tirar item da lista nao mudava a conta da aba Ofertas.
export function faltaEmCasa(
  shopping: { name: string; unit: string; desired_quantity: number; estimated_price: number | null; status: string }[],
  stock: { name: string; unit: string; current: number; normal: number; priceLast: number | null }[],
): ItemFalta[] {
  const preco = new Map(stock.map((s) => [s.name.trim().toLowerCase(), s.priceLast]));
  const vistos = new Set<string>();
  const out: ItemFalta[] = [];
  for (const i of shopping) {
    const nome = i.name.trim().toLowerCase();
    if (i.status !== "pending" || !nome || vistos.has(nome)) continue;
    vistos.add(nome);
    out.push({ nome, unidade: i.unit, origem: "lista", quantidade: i.desired_quantity,
      ultimo_preco: preco.get(nome) ?? null, ultima_marca: null });
  }
  for (const s of stock) {
    const nome = s.name.trim().toLowerCase();
    if (!(s.normal > 0 && s.current < s.normal * 0.5) || vistos.has(nome)) continue;
    vistos.add(nome);
    out.push({ nome, unidade: s.unit, origem: "repor", quantidade: Math.max(s.normal - s.current, 0),
      ultimo_preco: s.priceLast, ultima_marca: null });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

// Bate o olho e sabe se esta caro: compara a melhor oferta de agora com o que a casa
// pagou da ultima vez, com a menor promocao ja vista e com o "de" do encarte.
export type Veredito = { tom: "bom" | "normal" | "caro"; texto: string };

export function veredito(o: Oferta | undefined, d: Desejo, ultimoPago: number | null): Veredito | null {
  if (!o) return null;
  const p = o.preco_por;
  const menor = d.menor_preco != null ? Number(d.menor_preco) : null;
  if (ultimoPago && p > ultimoPago * 1.05) return { tom: "caro", texto: `Mais caro que sua última compra (${brlCurto(ultimoPago)})` };
  if (menor != null && p <= menor + 0.01 && (d.ultimo_visto || ultimoPago)) return { tom: "bom", texto: "Menor preço já visto" };
  if (ultimoPago && p <= ultimoPago * 0.95)
    return { tom: "bom", texto: `${brlCurto(ultimoPago - p)} a menos que sua última compra` };
  const off = desconto(o);
  if (off >= 15) return { tom: "bom", texto: `${off}% abaixo do preço normal` };
  if (menor != null && p > menor * 1.1) return { tom: "normal", texto: `Já esteve por ${brlCurto(menor)}` };
  return { tom: "normal", texto: "Preço comum" };
}

const brlCurto = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
