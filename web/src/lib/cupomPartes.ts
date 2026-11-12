// Nota fiscal em partes (cupom do mes nao cabe numa foto). Parte pura, usada no servidor
// (lib/server/cupom.ts) e no celular (components/receipt/NotaEmPartes.tsx): o celular le
// cada parte assim que a foto e tirada e junta aqui.

export type ItemCupom = { nome: string; marca: string; qtd: number; unidade: string; preco: number; duvida: boolean; totalLinha?: number; desconto?: number };

const r2 = (v: number) => Math.round(v * 100) / 100;

// "desconto sobre item" logo abaixo da linha (nota real do dono, Atacadao 07/11: alcatra
// 198,11 com desconto 33,08 e hamburguer 22,44 com 7,48). O preco salvo tem que ser o
// PAGO: antes ficava o de antes do desconto e a compra registrava 615,06 com a nota de
// 574,52. Depois de consertarLinha (que usa o total impresso da linha).
export function descontoNaLinha<T extends Pick<ItemCupom, "qtd" | "preco" | "totalLinha" | "desconto">>(i: T): T {
  const d = i.desconto ?? 0;
  const bruto = i.totalLinha ?? i.qtd * i.preco;
  if (!(d > 0) || d >= bruto || !(i.qtd > 0)) return i;
  const liquido = r2(bruto - d);
  return { ...i, preco: r2(liquido / i.qtd), totalLinha: liquido };
}

// Fecha com o "Valor a Pagar": se a soma das linhas ainda passa do que foi pago (desconto
// que a leitura nao pos em linha nenhuma, desconto no rodape), a diferenca sai dos itens
// na proporcao do valor de cada um, e os centavos que sobram do arredondamento vao na
// linha de 1 unidade mais cara. Diferenca grande demais (> 20%) = total lido errado: nao mexe.
export function fecharComTotalPago<T extends { qtd: number; preco: number }>(itens: T[], totalPago: number): T[] {
  const soma = itens.reduce((t, i) => t + i.qtd * i.preco, 0);
  const d = soma - totalPago;
  if (!(totalPago > 0) || d <= 0.02 || d > soma * 0.2) return itens;
  const f = totalPago / soma;
  const out = itens.map((i) => ({ ...i, preco: r2(i.preco * f) }));
  const resto = r2(totalPago - out.reduce((t, i) => t + i.qtd * i.preco, 0));
  if (Math.abs(resto) >= 0.01) {
    let k = -1;
    out.forEach((i, j) => {
      if (i.qtd === 1 && (k < 0 || i.preco > out[k].preco)) k = j;
    });
    if (k >= 0) out[k] = { ...out[k], preco: r2(out[k].preco + resto) };
  }
  return out;
}

// Conserta a linha pelo TOTAL impresso (o dado mais firme do cupom). Visto na nota real
// do dono: "BEB LACTEA 27X200ML 1 CXA 29,43" lido como 27 cx (o 27 e o tamanho do pacote)
// e "ALCATRA 4,136 kg x 47,90" lido a R$ 7,90. Total/preco inteiro -> e a quantidade;
// senao o preco e total/quantidade.
export function consertarLinha<T extends Pick<ItemCupom, "qtd" | "preco" | "totalLinha">>(i: T): T {
  const t = i.totalLinha ?? 0;
  if (!(t > 0) || Math.abs(i.qtd * i.preco - t) <= Math.max(0.05, t * 0.01)) return i;
  if (i.preco > 0) {
    const q = Math.round(t / i.preco);
    if (q >= 1 && Math.abs(q * i.preco - t) <= 0.05) return { ...i, qtd: q };
  }
  if (i.qtd > 0) return { ...i, preco: Math.round((t / i.qtd) * 100) / 100 };
  return i;
}

// Conferencia de cada linha sem precisar do rodape: qtd x preco = total da linha impresso.
// IA rapida que le quantidade errada (6 pacotes como 1) falha aqui. 1 = todas batem.
export function consistencia(itens: Pick<ItemCupom, "qtd" | "preco" | "totalLinha">[]): number {
  const comTotal = itens.filter((i) => (i.totalLinha ?? 0) > 0);
  if (comTotal.length < 3) return 0;
  const boas = comTotal.filter((i) => Math.abs(i.qtd * i.preco - (i.totalLinha ?? 0)) <= Math.max(0.05, (i.totalLinha ?? 0) * 0.01));
  return boas.length / comTotal.length;
}
// qtdItens: a "Qtde. total de itens" do rodape (0 = nao apareceu na foto).
export type Cupom = { itens: ItemCupom[]; total: number; emitente: string; chave: string; qtdItens: number };

// PROVA REAL: a "Qtde. total de itens" do rodape e a SOMA das quantidades (6 pacotes de
// wafer contam 6), e item pesado no caixa (kg/g) conta 1. Conferido no cupom do dono:
// 32 linhas, "Qtde. total de itens 46". Mesma conta aqui para comparar com o lido.
export function contarComoNoCupom(itens: Pick<ItemCupom, "qtd" | "unidade">[]): number {
  return itens.reduce((t, i) => t + (i.unidade === "kg" || i.unidade === "g" ? 1 : Math.max(1, Math.round(Number(i.qtd) || 1))), 0);
}

export function provaReal(itens: Pick<ItemCupom, "qtd" | "unidade">[], qtdItens: number): { lidos: number; noCupom: number; bate: boolean } | null {
  if (!(qtdItens > 0)) return null;
  const lidos = contarComoNoCupom(itens);
  return { lidos, noCupom: qtdItens, bate: lidos === qtdItens };
}

// Itens que cabem legiveis numa foto de perto (linhas do cupom tem ~4 mm).
export const ITENS_POR_FOTO = 15;

// Quantas fotos dos itens faltam, sabendo quantos itens o cupom tem e quantos a foto do
// rodape ja pegou. 0 = a foto do rodape ja pegou tudo (cupom pequeno).
export function partesNecessarias(qtdItens: number, jaLidos = 0, porFoto = ITENS_POR_FOTO): number {
  if (!(qtdItens > 0)) return 0;
  const faltam = qtdItens - jaLidos;
  if (faltam <= 1) return 0;
  return Math.max(1, Math.ceil(qtdItens / porFoto) - (jaLidos >= porFoto ? 1 : 0));
}

// Linhas aproximadas de cada parte, para orientar ("do item 16 ao 30").
export function faixaDaParte(k: number, n: number, qtdItens: number): { de: number; ate: number } {
  const por = Math.ceil(qtdItens / Math.max(1, n));
  return { de: (k - 1) * por + 1, ate: Math.min(qtdItens, k * por) };
}

// Soma dos itens bate com o total da nota? Folga de 2% ou R$ 1 (arredondamento e
// desconto no rodape que a IA nao pos em item nenhum).
export function totalConfere(c: Pick<Cupom, "itens" | "total">): boolean {
  if (!c.total) return true;
  const soma = c.itens.reduce((t, i) => t + i.qtd * i.preco, 0);
  return Math.abs(soma - c.total) <= Math.max(1, c.total * 0.02);
}

// Partes do mesmo cupom, de cima para baixo: junta e tira o que aparece em mais de uma
// foto. ALINHAMENTO (como o de comparar textos): cada foto nova e alinhada com o que ja
// foi lido, linha a linha, e o trecho em comum vira um so. Funciona com qualquer
// sobreposicao: a foto nova repetindo 3 linhas, metade, o cupom inteiro, ou comecando
// acima da anterior. Visto no uso real (2026-11-12): cupom de 110 itens em 9 fotos que
// pegavam 27 a 103 itens cada; a emenda antiga (fim de uma no comeco da outra) dava
// "Li 166 de 110". No alinhamento:
// - mesma linha = mesmo preco e quantidade (+ o comeco do nome, se bater);
// - a mesma posicao com leitura diferente (preco lido errado numa foto) e UMA linha so,
//   fica a leitura sem duvida;
// - linha que so uma das fotos leu entra (a outra pulou).
// semEmenda: indices i (>= 1) em que a parte i nao encaixou em nada do que ja tinha:
// ali provavelmente ficou um pedaco do cupom de fora.
const raizNome = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);

export function alinhar(a: ItemCupom[], b: ItemCupom[]): { itens: ItemCupom[]; encaixou: boolean } {
  if (!a.length || !b.length) return { itens: [...a, ...b], encaixou: false };
  const mesma = (x: ItemCupom, y: ItemCupom) => Math.abs(x.preco - y.preco) < 0.005 && Math.abs(x.qtd - y.qtd) < 0.001;
  const pontos = (x: ItemCupom, y: ItemCupom) => (mesma(x, y) ? (raizNome(x.nome) === raizNome(y.nome) ? 4 : 3) : raizNome(x.nome) === raizNome(y.nome) ? -1 : -3);
  const GAP = -2;
  const n = a.length, m = b.length;
  // H: melhor alinhamento terminando em (i, j). Sobreposicao: o comeco e livre so na BORDA
  // (uma das fotos comeca no meio da outra), nunca solto no meio das duas; senao a
  // primeira linha lida errada de uma foto sobrava como item extra no topo.
  const H = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const T = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 cima (so a), 3 esq (so b), 0 inicio
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const d = H[i - 1][j - 1] + pontos(a[i - 1], b[j - 1]);
      const c = H[i - 1][j] + GAP;
      const e = H[i][j - 1] + GAP;
      let v = d, t = 1;
      if (c > v) {
        v = c;
        t = 2;
      }
      if (e > v) {
        v = e;
        t = 3;
      }
      H[i][j] = v;
      T[i][j] = t;
    }
  // fim livre: termina onde uma das duas acaba (ultima linha ou coluna)
  let bi = 0, bj = 0, best = 0;
  for (let i = 1; i <= n; i++)
    if (H[i][m] > best) {
      best = H[i][m];
      bi = i;
      bj = m;
    }
  for (let j = 1; j <= m; j++)
    if (H[n][j] > best) {
      best = H[n][j];
      bi = n;
      bj = j;
    }
  // volta: pares do trecho em comum
  const pares: [number, number][] = [];
  let i = bi, j = bj, iguais = 0;
  while (i > 0 && j > 0) {
    const t = T[i][j];
    if (t === 1) {
      pares.push([i - 1, j - 1]);
      if (mesma(a[i - 1], b[j - 1])) iguais++;
      i--;
      j--;
    } else if (t === 2) pares.push([--i, -1]);
    else pares.push([-1, --j]);
  }
  // so encaixa com 2+ linhas iguais (1 so pode ser coincidencia de preco), ou 1 so se for
  // a mesma linha, nome incluido, na ponta (o fim de uma foto no comeco da outra)
  const umaNaPonta = iguais === 1 && pares.length === 1 && raizNome(a[pares[0][0]]?.nome ?? "") === raizNome(b[pares[0][1]]?.nome ?? "-");
  if (iguais < 2 && !umaNaPonta) return { itens: [...a, ...b], encaixou: false };
  pares.reverse();
  const a0 = i, b0 = j; // inicio do trecho em comum
  // No trecho em comum, linha que so uma foto tem: se a outra tem a MESMA linha logo ali
  // (ate 3 posicoes), e a IA trocando a ordem de duas vizinhas (wafer 6 e wafer 3 na nota
  // real): e a mesma linha, entra uma vez so.
  const meio: { it: ItemCupom; de: "a" | "b" | "ab" }[] = pares.map(([x, y]) =>
    x >= 0 && y >= 0 ? { it: a[x].duvida && !b[y].duvida ? b[y] : a[x], de: "ab" } : x >= 0 ? { it: a[x], de: "a" } : { it: b[y], de: "b" },
  );
  const fora = new Set<number>();
  meio.forEach((e, k) => {
    if (e.de !== "b") return;
    for (let d = -3; d <= 3; d++) {
      const o = meio[k + d];
      if (o && o.de === "a" && !fora.has(k + d) && mesma(o.it, e.it)) {
        fora.add(k);
        break;
      }
    }
  });
  const out: ItemCupom[] = [
    ...b.slice(0, b0), // o que vem antes (so uma das duas tem)
    ...a.slice(0, a0),
    ...meio.filter((_, k) => !fora.has(k)).map((e) => e.it),
    ...a.slice(bi), // o que vem depois (so uma das duas tem)
    ...b.slice(bj),
  ];
  return { itens: out, encaixou: true };
}

export function juntarComEmendas(partes: Cupom[]): { cupom: Cupom; semEmenda: number[] } {
  let itens: ItemCupom[] = [];
  const semEmenda: number[] = [];
  partes.forEach((p, idx) => {
    if (!p.itens.length) return;
    if (!itens.length) {
      itens = [...p.itens];
      return;
    }
    const r = alinhar(itens, p.itens);
    if (!r.encaixou && idx > 0) semEmenda.push(idx);
    itens = r.itens;
  });

  const ultimo = <T,>(f: (c: Cupom) => T) => [...partes].reverse().map(f).find(Boolean) ?? f(partes[0]);
  const cupom: Cupom = {
    itens,
    total: ultimo((c) => c.total) || 0,
    emitente: partes.map((c) => c.emitente).find(Boolean) ?? "",
    chave: ultimo((c) => c.chave) || "",
    qtdItens: ultimo((c) => c.qtdItens) || 0,
  };
  // Uma foto sozinha ja fecha a prova real (pegou o cupom inteiro legivel) e a juncao nao?
  // Fica com ela: a juncao so pode ter repetido ou perdido linha.
  const q = cupom.qtdItens;
  if (q > 0 && contarComoNoCupom(itens) !== q) {
    const inteira = partes.find((p) => p.itens.length && contarComoNoCupom(p.itens) === q);
    if (inteira) return { cupom: { ...cupom, itens: inteira.itens }, semEmenda: [] };
  }
  return { cupom, semEmenda };
}

export function juntarPartes(partes: Cupom[]): Cupom {
  return juntarComEmendas(partes).cupom;
}
