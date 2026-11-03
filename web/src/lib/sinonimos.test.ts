import { describe, expect, it } from "vitest";
import { interpretarLocal } from "./voz";
import { normalizarFala } from "./sinonimos";

// Cada um fala de um jeito; o resultado tem que ser o mesmo.
// [frase, [nome, acao][]] ; acao: lista | estoque | carrinho | remover:excesso | remover:ruim | remover:?
const CASOS: [string, [string, string][]][] = [
  // precisa comprar
  ["tá faltando arroz", [["arroz", "lista"]]],
  ["cabou o café", [["café", "lista"]]],
  ["o açúcar zerou", [["açúcar", "lista"]]],
  ["não tem mais detergente", [["detergente", "lista"]]],
  ["tô precisando de papel higiênico", [["papel higiênico", "lista"]]],
  ["bota na lista sabão em pó", [["sabão em pó", "lista"]]],
  ["não esquece de comprar pão", [["pão", "lista"]]],
  ["traz leite", [["leite", "lista"]]],
  ["o óleo tá acabando", [["óleo", "lista"]]],
  ["queria um queijo", [["queijo", "lista"]]],
  // o que tem em casa
  ["tô com 3 pacotes de macarrão", [["macarrão", "estoque"]]],
  ["ainda tem 2 latas de milho", [["milho", "estoque"]]],
  ["sobrou meio quilo de feijão", [["feijão", "estoque"]]],
  ["a gente tem 6 ovos", [["ovos", "estoque"]]],
  // nao comprar
  ["não carece de comprar leite", [["leite", "remover:?"]]],
  ["risca o leite", [["leite", "remover:?"]]],
  ["esquece o refrigerante", [["refrigerante", "remover:?"]]],
  ["nada de biscoito esse mês", [["biscoito", "remover:?"]]],
  ["deixa pra lá o iogurte", [["iogurte", "remover:?"]]],
  ["pode tirar a manteiga", [["manteiga", "remover:?"]]],
  // excesso
  ["tem um monte de fermento", [["fermento", "remover:excesso"]]],
  ["tá sobrando arroz", [["arroz", "remover:excesso"]]],
  ["a despensa tá cheia de macarrão", [["despensa", "?"], ["macarrão", "remover:excesso"]]],
  ["tenho bastante sabonete", [["sabonete", "remover:excesso"]]],
  // ruim
  ["esse café Melitta não presta", [["café melitta", "remover:ruim"]]],
  ["ninguém gostou do iogurte Batavo, não compra mais", [["iogurte batavo", "remover:ruim"]]],
  // carrinho
  ["joguei no carrinho 2 detergentes", [["detergentes", "carrinho"]]],
  ["levei um frango", [["frango", "carrinho"]]],
  // tudo junto, cada um de um jeito
  [
    "olha, tô com 5 quilos de arroz, cabou o café, risca o leite e tem um monte de fermento",
    [["arroz", "estoque"], ["café", "lista"], ["leite", "remover:?"], ["fermento", "remover:excesso"]],
  ],
];

const acaoDe = (i: { remover?: boolean; motivo?: string; destino?: string }) =>
  i.remover ? `remover:${i.motivo ?? "?"}` : (i.destino ?? "?");

describe("jeitos diferentes de dizer a mesma coisa (regra local)", () => {
  for (const [frase, esperado] of CASOS) {
    it(frase, () => {
      const r = interpretarLocal(frase).itens.map((i) => [i.nome, acaoDe(i)]);
      // "despensa" na frase e lugar, nao produto: so confere os produtos esperados
      const so = esperado.filter(([, a]) => a !== "?");
      expect(r.filter(([n]) => so.some(([e]) => e === n))).toEqual(so);
    });
  }

  it("troca o jeito de falar pela forma padrao", () => {
    expect(normalizarFala("ta faltando arroz")).toBe("acabou arroz");
    expect(normalizarFala("nao tem mais cafe")).toBe("acabou cafe");
    expect(normalizarFala("tem um monte de fermento")).toBe("ja tem muito de fermento");
    expect(normalizarFala("nao esquece o pao")).toBe("preciso o pao");
  });
});
