// Nota fiscal em partes (cupom do mes nao cabe numa foto). Parte pura, usada no servidor
// (lib/server/cupom.ts) e no celular (components/receipt/NotaEmPartes.tsx): o celular le
// cada parte assim que a foto e tirada e junta aqui.

export type ItemCupom = { nome: string; marca: string; qtd: number; unidade: string; preco: number; duvida: boolean; totalLinha?: number };

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

// Partes do mesmo cupom, de cima para baixo: junta na ordem e tira o trecho repetido na
// emenda (o fim de uma foto aparece no comeco da proxima). A foto do rodape vem por
// ultimo e pode repetir varias linhas da parte anterior, por isso a emenda olha ate 20.
// Total, chave e quantidade: o que aparecer, de baixo para cima (ficam no pe do cupom).
// semEmenda: indices i (>= 1) em que a parte i NAO repetiu nada do fim da parte i-1: ali
// provavelmente ficou um pedaco do cupom de fora (e o lugar para mostrar a pessoa).
export function juntarComEmendas(partes: Cupom[]): { cupom: Cupom; semEmenda: number[] } {
  // A mesma linha lida em duas fotos (as vezes por IAs diferentes) vem com o nome um pouco
  // diferente ("biscoito piraque wafer" x "bisc. piraque wafer"): vale preco + quantidade +
  // o comeco do nome.
  const raiz = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
  const igual = (a: ItemCupom, b: ItemCupom) =>
    Math.abs(a.preco - b.preco) < 0.015 && Math.abs(a.qtd - b.qtd) < 0.001 && (a.nome === b.nome || raiz(a.nome) === raiz(b.nome));
  const chaves = (l: ItemCupom[]) => l.map((i) => `${i.preco.toFixed(2)}|${+i.qtd.toFixed(3)}`).sort();
  const itens: ItemCupom[] = [];
  const semEmenda: number[] = [];
  partes.forEach((p, idx) => {
    let pular = 0;
    const fim = itens.slice(-20);
    for (let k = Math.min(20, p.itens.length, fim.length); k > 0; k--) {
      const ini = p.itens.slice(0, k);
      const cauda = fim.slice(fim.length - k);
      // 2+ linhas: o mesmo CONJUNTO de preco x quantidade (a IA troca a ordem e o nome de
      // uma linha ou outra: "catchup" x "ketchup", wafer 6 e 3 invertidos na nota real).
      // 1 linha so: tem que ser a mesma linha, nome incluido.
      const bate =
        k >= 2
          ? chaves(ini).join() === chaves(cauda).join()
          : igual(ini[0], cauda[0]);
      if (bate) {
        pular = k;
        break;
      }
    }
    if (idx > 0 && pular === 0 && p.itens.length && itens.length) semEmenda.push(idx);
    itens.push(...p.itens.slice(pular));
  });
  const ultimo = <T,>(f: (c: Cupom) => T) => [...partes].reverse().map(f).find(Boolean) ?? f(partes[0]);
  return {
    cupom: {
      itens,
      total: ultimo((c) => c.total) || 0,
      emitente: partes.map((c) => c.emitente).find(Boolean) ?? "",
      chave: ultimo((c) => c.chave) || "",
      qtdItens: ultimo((c) => c.qtdItens) || 0,
    },
    semEmenda,
  };
}

export function juntarPartes(partes: Cupom[]): Cupom {
  return juntarComEmendas(partes).cupom;
}
