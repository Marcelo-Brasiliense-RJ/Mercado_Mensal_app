import { expect, it } from "vitest";
import { juntarComEmendas, contarComoNoCupom, type Cupom, type ItemCupom } from "./cupomPartes";

// gerador deterministico
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
const NOMES = ["arroz","feijao","leite","biscoito","wafer","sabao","detergente","cafe","acucar","oleo","macarrao","molho","queijo","presunto","iogurte","pao","manteiga","refri","agua","suco"];
function simular(seed: number, nLinhas = 80, nFotos = 9) {
  const r = rng(seed);
  const verdade: ItemCupom[] = Array.from({ length: nLinhas }, () => {
    const preco = [2.97, 4.99, 5.49, 7.99, 9.9, 12.5, 3.29][Math.floor(r() * 7)] + (r() < 0.6 ? Math.floor(r() * 30) : 0);
    return { nome: NOMES[Math.floor(r() * NOMES.length)], marca: "", qtd: r() < 0.15 ? 2 + Math.floor(r() * 4) : 1, unidade: "un", preco: Math.round(preco * 100) / 100, duvida: false };
  });
  const qtd = contarComoNoCupom(verdade);
  // fotos: janelas que andam de cima para baixo com sobreposicao grande e irregular
  const partes: Cupom[] = [];
  for (let f = 0; f < nFotos; f++) {
    const centro = Math.round(((f + 0.5) / nFotos) * nLinhas);
    const meia = 6 + Math.floor(r() * nLinhas * 0.35);
    const ini = Math.max(0, centro - meia), fim = Math.min(nLinhas, centro + meia + (f === nFotos - 1 ? nLinhas : 0));
    const itens = verdade.slice(f === 0 ? 0 : ini, fim).flatMap((it) => {
      const x = r();
      if (x < 0.03) return []; // linha nao lida
      if (x < 0.06) return [{ ...it, preco: Math.round((it.preco + 1) * 100) / 100, duvida: r() < 0.5 }]; // preco lido errado
      if (x < 0.1) return [{ ...it, nome: it.nome + " x" }];
      return [it];
    });
    partes.push({ itens, total: 0, emitente: "", chave: "", qtdItens: f === nFotos - 1 ? qtd : 0 });
  }
  return { verdade, qtd, partes };
}

// Cupom grande em 9 fotos que se sobrepoem muito e de forma irregular, com leitura
// imperfeita (linha pulada, preco lido errado, nome diferente), como no uso real
// (2026-11-12: 110 itens, 9 fotos, a emenda antiga dava "Li 166 de 110").
// Medido: emenda antiga 0 de 30 exatas (erro medio 22 itens); alinhamento 26 de 30
// (erro medio 0,2: o que resta e linha que nenhuma foto leu).
it("cupom grande em 9 fotos: a juncao chega na Qtde. do rodape", () => {
  let soma = 0, exatos = 0;
  const res: string[] = [];
  for (let s = 1; s <= 30; s++) {
    const { qtd, partes } = simular(s);
    const j = juntarComEmendas(partes);
    const lidos = contarComoNoCupom(j.cupom.itens);
    soma += Math.abs(lidos - qtd);
    if (lidos === qtd) exatos++;
    res.push(`${lidos}/${qtd}`);
  }
  expect(exatos, res.join(" ")).toBeGreaterThanOrEqual(24);
  expect(soma / 30).toBeLessThanOrEqual(0.5);
});

// Como o dono faz na pratica (2026-11-12): "fiquei com medo de nao aparecer, fui tirando
// fotos dos pormenores": alem das fotos em sequencia, fotos de DETALHE de pedacos ja
// fotografados (curtas, repetidas, fora de ordem), no meio das outras.
function comDetalhes(seed: number, extras: number, nLinhas = 80, nFotos = 9) {
  const base = simular(seed, nLinhas, nFotos);
  const r = rng(seed * 7 + 3);
  const n = base.verdade.length;
  const partes = [...base.partes];
  for (let k = 0; k < extras; k++) {
    const tam = 4 + Math.floor(r() * 12);
    const ini = Math.floor(r() * (n - tam));
    const itens = base.verdade.slice(ini, ini + tam).flatMap((it) => {
      const x = r();
      if (x < 0.03) return [];
      if (x < 0.06) return [{ ...it, preco: Math.round((it.preco + 1) * 100) / 100 }];
      return [it];
    });
    // entra numa posicao qualquer (antes da ultima, que traz o rodape)
    partes.splice(Math.floor(r() * (partes.length - 1)), 0, { itens, total: 0, emitente: "", chave: "", qtdItens: 0 });
  }
  return { ...base, partes };
}

it("fotos de detalhe a mais, repetidas e fora de ordem, nao duplicam itens", () => {
  let soma = 0, exatos = 0;
  const res: string[] = [];
  for (let s = 1; s <= 30; s++) {
    const { qtd, partes } = comDetalhes(s, 5);
    const lidos = contarComoNoCupom(juntarComEmendas(partes).cupom.itens);
    soma += Math.abs(lidos - qtd);
    if (lidos === qtd) exatos++;
    res.push(`${lidos}/${qtd}`);
  }
  console.log("DETALHES exatos", exatos, "/30 | erro medio", (soma / 30).toFixed(2), "|", res.join(" "));
  expect(exatos, res.join(" ")).toBeGreaterThanOrEqual(22);
  expect(soma / 30).toBeLessThanOrEqual(1);
});

it("pior caso: cupom de 110 linhas, 9 fotos + 6 de detalhe, rapido", () => {
  let exatos = 0, soma = 0, pior = 0;
  for (let s = 1; s <= 10; s++) {
    const { qtd, partes } = comDetalhes(s, 6, 110, 9);
    const t = performance.now();
    const lidos = contarComoNoCupom(juntarComEmendas(partes).cupom.itens);
    pior = Math.max(pior, performance.now() - t);
    soma += Math.abs(lidos - qtd);
    if (lidos === qtd) exatos++;
  }
  console.log("PIOR exatos", exatos, "/10 | erro medio", (soma / 10).toFixed(2), "| ms", pior.toFixed(0));
  expect(exatos).toBeGreaterThanOrEqual(7);
  expect(pior).toBeLessThan(1500);
});
