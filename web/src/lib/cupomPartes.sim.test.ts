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
