// Testes do parser. Os testes de parseBrNumber rodam sempre. O teste da fixture
// so roda quando existir um HTML real em ./fixtures/nfce-rj-sample.html (Task 2
// do plano). Sem a fixture, ele e ignorado (nao falha o suite).
//
// Depois de salvar a fixture real, ABRA-A, anote os valores reais (qtd de itens,
// total, 1o item) e substitua os asserts marcados com TROCAR.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseBrNumber, parseNfceHtml } from "./parse.ts";

const FIXTURE = new URL("./fixtures/nfce-rj-sample.html", import.meta.url);

async function fixtureExists(): Promise<boolean> {
  try {
    await Deno.stat(FIXTURE);
    return true;
  } catch {
    return false;
  }
}

Deno.test("parseBrNumber lida com milhar e virgula", () => {
  assertEquals(parseBrNumber("1.542,46"), 1542.46);
  assertEquals(parseBrNumber("5,49"), 5.49);
  assertEquals(parseBrNumber("12"), 12);
  assertEquals(parseBrNumber(""), 0);
  assertEquals(parseBrNumber("R$ 3,99"), 3.99);
});

Deno.test({
  name: "parseNfceHtml extrai itens e total da fixture RJ",
  ignore: !(await fixtureExists()),
  fn: async () => {
    const html = await Deno.readTextFile(FIXTURE);
    const r = parseNfceHtml(html);

    // Valores reais lidos da fixture (recorte de 8 linhas do cupom da Casas Guanabara).
    assertEquals(r.itens.length, 8);
    assertEquals(r.emitente, "CASAS GUANABARA COMESTIVEIS LTDA-FL19");
    assertEquals(r.chave.length, 44, `chave: ${r.chave}`);

    // Item com quantidade fracionada (peso, kg) e o mais sensivel a parsing de numero.
    assertEquals(r.itens[0].desc_fiscal, "SALSICHA HOT DOG PERDIGAO RESF kg");
    assertEquals(r.itens[0].qtd, 0.988);
    assertEquals(r.itens[0].unidade, "kg");
    assertEquals(r.itens[0].preco, 9.98);
    assertEquals(r.itens[0].total_item, 9.86);

    // Total: tem que ser o "Valor a pagar" (.totalNumb.txtMax), NAO a contagem 117.
    assertEquals(r.total_nota, 173.78);

    // Invariante: soma dos itens ~ total (tolerancia p/ desconto/arredondamento)
    const soma = r.itens.reduce((a, i) => a + i.qtd * i.preco, 0);
    assert(
      Math.abs(soma - r.total_nota) < Math.max(1, r.total_nota * 0.02),
      `soma ${soma} vs total ${r.total_nota}`,
    );
  },
});
