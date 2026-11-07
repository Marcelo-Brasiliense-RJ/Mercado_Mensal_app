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
// unidades: quantas tem dentro da embalagem (fardo de 12 leites = 12). Sem o campo = 1.
export type Achado = { box: Box; nome: string; rotulo: string; legivel: boolean; unidades?: number };
export type Cor = "verde" | "amarelo" | "vermelho";

export const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
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
  vizinhos?: string[]; // nomes dos outros quadrados da mesma foto
}): Cor {
  if (!p.nome) return "vermelho";
  const conferiu = p.conferido !== undefined && p.conferido !== null;
  if (conferiu && !mesmoProduto(p.conferido!, p.nome)) {
    // Produtos encostados (sachês sobrepostos): o recorte pega o vizinho. Se a segunda
    // olhada viu o nome de OUTRO quadrado da foto, e sobra do vizinho, nao erro: vale
    // a leitura do rotulo.
    const doVizinho = !!p.conferido && (p.vizinhos ?? []).some((v) => mesmoProduto(v, p.conferido!));
    if (doVizinho && p.legivel) return "verde";
    return p.legivel ? "amarelo" : "vermelho";
  }
  // Leu o rotulo E a segunda olhada no recorte concorda: e obvio, ja entra.
  if (p.legivel && conferiu) return "verde";
  if (p.daMemoria || p.conhecidos.some((k) => mesmoProduto(k, p.nome))) return p.legivel || conferiu ? "verde" : "amarelo";
  if (p.legivel || conferiu) return "amarelo";
  return "vermelho";
}

// O nome da casa para o que a IA leu: memoria primeiro ("pilao trad" -> "Café Pilão").
export function daMemoria(lido: string, memoria: Map<string, string>): string | null {
  return memoria.get(chaveLido(lido)) ?? null;
}

// Junta quadrados do mesmo produto em quantidade (3 Pilao lado a lado = 3; um fardo
// de 12 leites + 2 soltos = 14).
export const unidadesDe = (it: { unidades?: number }) => Math.max(1, Math.round(it.unidades ?? 1));
export function agrupar<T extends { nome: string; unidades?: number }>(itens: T[]): { nome: string; qtd: number; itens: T[] }[] {
  const grupos: { nome: string; qtd: number; itens: T[] }[] = [];
  for (const it of itens) {
    const n = it.nome.trim();
    if (!n) continue;
    const g = grupos.find((x) => chaveLido(x.nome) === chaveLido(n));
    if (g) {
      g.qtd += unidadesDe(it);
      g.itens.push(it);
    } else grupos.push({ nome: n, qtd: unidadesDe(it), itens: [it] });
  }
  return grupos;
}

// Qualidade do recorte para o banco de imagens: como a IA se saiu de primeira.
export const qualidadeDe = (corInicial: Cor): "bom" | "medio" | "ruim" =>
  corInicial === "verde" ? "bom" : corInicial === "amarelo" ? "medio" : "ruim";

// Foto do carrinho no mercado: o que ja esta no carrinho nao entra de novo. Os quadrados
// de um produto vao sendo "descontados" do que o carrinho ja tem; os que cabem inteiros
// viram cinza (🛒 ja no carrinho). O resto e novo.
export function marcarCarrinho<T extends { nome: string; unidades: number; carrinho?: boolean }>(lista: T[], noCarrinho: { name: string; quantity: number }[]): T[] {
  const resta = new Map<string, number>();
  return lista.map((c) => {
    if (!c.nome) return c;
    const item = noCarrinho.find((t) => mesmoProduto(t.name, c.nome));
    if (!item) return c;
    const k = item.name;
    const r = resta.has(k) ? resta.get(k)! : item.quantity;
    if (r >= c.unidades) {
      resta.set(k, r - c.unidades);
      return { ...c, carrinho: true };
    }
    resta.set(k, r);
    return c;
  });
}

// Mesmo produto em quadrados vizinhos (4 oleos lado a lado marcados um a um) vira UM
// quadrado com a soma das unidades. E um quadrado sem nome quase todo em cima de um
// grupo (a garrafa de tras, so a tampa aparecendo) entra nesse grupo como +1.
export function juntarIguais(achados: Achado[]): Achado[] {
  const encosta = (a: Box, b: Box) => {
    const vy = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const alt = Math.min(a[2] - a[0], b[2] - b[0]);
    const gap = Math.max(a[1], b[1]) - Math.min(a[3], b[3]); // <0 = se sobrepoem
    return vy > alt * 0.4 && gap < 0.03;
  };
  const uniao = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  let lista = achados.map((a) => ({ ...a, unidades: a.unidades ?? 1 }));
  for (let mudou = true; mudou; ) {
    mudou = false;
    fora: for (let i = 0; i < lista.length; i++)
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i];
        const b = lista[j];
        const iguais = a.nome && b.nome && mesmoProduto(a.nome, b.nome) && encosta(a.box, b.box);
        const semNome = (x: Achado, y: Achado) => !x.nome && y.nome && intersecao(x.box, y.box) / (area(x.box) || 1) > 0.5;
        if (!iguais && !semNome(a, b) && !semNome(b, a)) continue;
        const dono = a.nome ? a : b;
        lista[i] = {
          ...dono,
          box: uniao(a.box, b.box),
          nome: a.nome.length >= b.nome.length ? a.nome : b.nome,
          rotulo: a.rotulo || b.rotulo,
          legivel: a.legivel || b.legivel,
          unidades: (a.unidades ?? 1) + (b.unidades ?? 1),
        };
        lista = lista.filter((_, k) => k !== j);
        mudou = true;
        break fora;
      }
  }
  return lista;
}

// Nome que nao diz o produto ("bebida", "cereal"): uma palavra so de categoria.
// Medido na base de 235 fotos: "tempero", "lata", "molho", "pote", "conserva", "mantimento",
// "snack" e "pote de vidro" eram os nomes mais comuns e nao dizem o que comprar.
const GENERICOS = new Set(["bebida", "produto", "garrafa", "pacote", "alimento", "cereal", "tempero", "salgadinho", "biscoito", "doce", "lata", "caixa", "frasco", "vidro", "embalagem", "item", "pote", "conserva", "mantimento", "snack", "molho", "comida", "enlatado", "saco", "sacola", "mercadoria", "lanche", "condimento", "plastico", "pacotinho", "potinho", "garrafinha"]);
export const generico = (nome: string) => {
  const p = palavras(nome);
  return p.length === 0 || p.every((w) => GENERICOS.has(w)); // "pote de vidro" tambem
};

// Opcoes para a pessoa escolher: sem generico quando ha um nome de verdade, sem repetido.
export function opcoesDe(nomes: (string | null | undefined)[]): string[] {
  const unicos: string[] = [];
  for (const n of nomes) if (n && !unicos.some((u) => chaveLido(u) === chaveLido(n))) unicos.push(n);
  const bons = unicos.filter((n) => !generico(n));
  return bons.length ? bons : unicos;
}

// "Sao produtos diferentes": divide o quadrado em N, no sentido mais comprido.
export function dividir(b: Box, n: number): Box[] {
  const deitado = b[3] - b[1] >= b[2] - b[0];
  return Array.from({ length: n }, (_, i) =>
    deitado
      ? ([b[0], b[1] + ((b[3] - b[1]) * i) / n, b[2], b[1] + ((b[3] - b[1]) * (i + 1)) / n] as Box)
      : ([b[0] + ((b[2] - b[0]) * i) / n, b[1], b[0] + ((b[2] - b[0]) * (i + 1)) / n, b[3]] as Box),
  );
}

// ---- busca com zoom em faixas ----
// Numa foto cheia a IA para nos produtos grandes e legiveis. A mesma busca em tres
// faixas com zoom (sobrepostas, cortadas no lado maior) acha os pequenos, os de tras e
// os do canto; o que se repete com a foto inteira some em somarNovos. Na foto do
// carrinho do dono: 2 metades achavam 15-17, 3 faixas 19-23.
// (Pedir "so o que falta" com os quadrados desenhados nao funcionou: a IA respondia vazio.)

export function faixas(w: number, h: number): Box[] {
  const cortes: [number, number][] = [[0, 0.45], [0.275, 0.725], [0.55, 1]];
  return cortes.map(([a, b]) => (h >= w ? [a, 0, b, 1] : [0, a, 1, b]));
}

// Quadrado de dentro de uma regiao (0..1 da regiao) -> 0..1 da foto inteira.
export function paraFoto(b: Box, r: Box): Box {
  const h = r[2] - r[0];
  const w = r[3] - r[1];
  return [r[0] + b[0] * h, r[1] + b[1] * w, r[0] + b[2] * h, r[1] + b[3] * w];
}

// Vale a segunda olhada? Nao quando e um produto so, de perto (foto de produto na mao).
export const precisaFaltou = (achados: Achado[]) => !(achados.length === 1 && area(achados[0].box) > 0.3);

// So os novos de verdade: some o que cai quase todo (60%) dentro de um quadrado ja achado
// (a IA marcou de novo o mesmo produto) e o repetido entre as duas metades.
export function somarNovos(achados: Achado[], extras: Achado[]): Achado[] {
  const out = [...achados];
  for (const e of extras) {
    const a = area(e.box) || 1;
    if (out.some((o) => intersecao(e.box, o.box) / a > 0.6 || iou(e.box, o.box) > 0.5)) continue;
    out.push(e);
  }
  return out;
}

// Segunda opiniao sem chamada extra: o mesmo produto achado pela foto inteira E por uma
// faixa com zoom (quadrados quase iguais) e uma conferencia de graca. Devolve, para cada
// achado final, o nome que a OUTRA passada deu (undefined = so uma passada viu).
export function segundaOpiniao(finais: Achado[], foto: Achado[], faixa: Achado[]): (string | undefined)[] {
  const casa = (a: Box, b: Box) => iou(a, b) > 0.45 || intersecao(a, b) / (Math.min(area(a), area(b)) || 1) > 0.8;
  return finais.map((f) => {
    const daFoto = foto.filter((o) => casa(f.box, o.box));
    const daFaixa = faixa.filter((o) => casa(f.box, o.box));
    if (!daFoto.length || !daFaixa.length) return undefined;
    // As duas passadas concordam entre si: conferido. Senao, vale o nome diferente do
    // achado (a outra passada viu outra coisa ali: quadrado duvidoso).
    const acordo = daFaixa.find((q) => q.nome && daFoto.some((o) => o.nome && mesmoProduto(o.nome, q.nome)));
    if (acordo) return acordo.nome;
    return [...daFaixa, ...daFoto].find((o) => o.nome && !mesmoProduto(o.nome, f.nome))?.nome ?? "";
  });
}
