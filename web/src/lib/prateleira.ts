// Foto da prateleira, a parte pura (testada): limpar os quadrados que a IA devolveu,
// decidir a cor de cada um pela BASE DA CASA (nao pela IA) e juntar iguais em
// quantidade. A tela (PrateleiraModal) so desenha e grava.
//
// Cor, do jeito que o dono pediu (nao pode ficar tudo amarelo):
// - verde: a IA leu, o recorte confere, e a casa ja conhece o produto (memoria de
//   correcoes ou estoque). Ja entra.
// - amarelo: leu e confere, mas e a primeira vez desse produto. Um toque confirma.
// - vermelho: nao leu, ou o recorte nao bate com o nome (quadrado no produto errado).
//   A pessoa diz o nome.

export type Box = [number, number, number, number]; // ymin, xmin, ymax, xmax em 0..1
export type Achado = { box: Box; nome: string; rotulo: string; legivel: boolean };
export type Cor = "verde" | "amarelo" | "vermelho";

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function intersecao(a: Box, b: Box): number {
  const y0 = Math.max(a[0], b[0]);
  const x0 = Math.max(a[1], b[1]);
  const y1 = Math.min(a[2], b[2]);
  const x1 = Math.min(a[3], b[3]);
  return Math.max(0, y1 - y0) * Math.max(0, x1 - x0);
}
export function iou(a: Box, b: Box): number {
  const i = intersecao(a, b);
  return i / (area(a) + area(b) - i || 1);
}

// Descarta o que nao pode ser um produto da foto: fora dela (corta na borda), minusculo,
// gigante (a prateleira inteira) e repetido (dois quadrados no mesmo produto).
// Gigante so conta quando ha outros produtos: um produto so, fotografado de perto,
// ocupa quase a foto toda e e valido.
export function limpar(achados: Achado[]): Achado[] {
  const bons = achados
    .map((a) => ({ ...a, box: a.box.map((v) => Math.min(1, Math.max(0, v))) as Box }))
    .filter((a) => {
      const h = a.box[2] - a.box[0];
      const w = a.box[3] - a.box[1];
      return h > 0.02 && w > 0.01 && area(a.box) > 0.0008 && area(a.box) < 0.97;
    })
    .filter((a, _, todos) => todos.length === 1 || area(a.box) < 0.6)
    // legivel e maior primeiro: no empate, fica o quadrado melhor
    .sort((a, b) => Number(b.legivel) - Number(a.legivel) || area(b.box) - area(a.box));
  const fica: Achado[] = [];
  for (const a of bons) {
    const repetido = fica.some((f) => {
      if (iou(a.box, f.box) > 0.6) return true;
      // um dentro do outro (85%) com o mesmo nome: e o mesmo produto marcado duas vezes
      return intersecao(a.box, f.box) / (area(a.box) || 1) > 0.85 && mesmoProduto(a.nome, f.nome);
    });
    if (!repetido) fica.push(a);
  }
  return fica;
}

const VAZIAS = new Set(["de", "do", "da", "com", "sem", "e", "o", "a", "tipo", "pct", "un", "pacote", "garrafa", "lata", "caixa"]);
export function palavras(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\d+[.,]?\d*\s*(kg|g|ml|l|lt|un)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ""))
    .filter((w) => w.length > 1 && !VAZIAS.has(w));
}

// "leite" e "leite italac" sao o mesmo produto para a casa; "cafe pilao" e
// "cafe melitta" nao. Regra: as palavras do nome mais curto estao todas no outro.
export function mesmoProduto(a: string, b: string): boolean {
  const pa = palavras(a);
  const pb = palavras(b);
  if (!pa.length || !pb.length) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return curto.every((w) => longo.includes(w));
}

export const chaveLido = (s: string) => palavras(s).join(" ");

export function corDe(p: {
  nome: string; // o que a IA leu (ja com a memoria aplicada)
  legivel: boolean;
  conferido: string | null | undefined; // undefined = conferencia nao rodou; "" = recorte sem produto
  daMemoria: boolean;
  conhecidos: string[]; // nomes do estoque e da memoria
}): Cor {
  if (!p.nome || !p.legivel) return "vermelho";
  if (p.conferido !== undefined && p.conferido !== null && !mesmoProduto(p.conferido, p.nome)) return "vermelho";
  if (p.daMemoria || p.conhecidos.some((k) => mesmoProduto(k, p.nome))) return "verde";
  return "amarelo";
}

// O nome da casa para o que a IA leu: memoria primeiro ("pilao trad" -> "Café Pilão").
export function daMemoria(lido: string, memoria: Map<string, string>): string | null {
  return memoria.get(chaveLido(lido)) ?? null;
}

// Junta quadrados do mesmo produto em quantidade (3 Pilao lado a lado = 3).
export function agrupar<T extends { nome: string }>(itens: T[]): { nome: string; qtd: number; itens: T[] }[] {
  const grupos: { nome: string; qtd: number; itens: T[] }[] = [];
  for (const it of itens) {
    const n = it.nome.trim();
    if (!n) continue;
    const g = grupos.find((x) => chaveLido(x.nome) === chaveLido(n));
    if (g) {
      g.qtd += 1;
      g.itens.push(it);
    } else grupos.push({ nome: n, qtd: 1, itens: [it] });
  }
  return grupos;
}

// Qualidade do recorte para o banco de imagens: como a IA se saiu de primeira.
export const qualidadeDe = (corInicial: Cor): "bom" | "medio" | "ruim" =>
  corInicial === "verde" ? "bom" : corInicial === "amarelo" ? "medio" : "ruim";
