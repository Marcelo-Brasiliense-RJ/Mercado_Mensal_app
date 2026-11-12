// Nota fiscal em partes (cupom do mes nao cabe numa foto). Parte pura, usada no servidor
// (lib/server/cupom.ts) e no celular (components/receipt/NotaEmPartes.tsx): o celular le
// cada parte assim que a foto e tirada e junta aqui.

export type ItemCupom = { nome: string; marca: string; qtd: number; unidade: string; preco: number; duvida: boolean };
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
  const igual = (a: ItemCupom, b: ItemCupom) => a.nome === b.nome && a.preco === b.preco && a.qtd === b.qtd;
  const itens: ItemCupom[] = [];
  const semEmenda: number[] = [];
  partes.forEach((p, idx) => {
    let pular = 0;
    const fim = itens.slice(-20);
    for (let k = Math.min(20, p.itens.length, fim.length); k > 0; k--) {
      if (p.itens.slice(0, k).every((it, i) => igual(it, fim[fim.length - k + i]))) {
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
