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

    assert(r.itens.length > 0, "esperava itens");
    // TROCAR pelos valores REAIS lidos da fixture:
    // assertEquals(r.itens.length, 117);
    // assertEquals(r.total_nota, 1542.46);
    // assertEquals(r.itens[0].desc_fiscal, "SABONETE FRANCIS ...");
    // assertEquals(r.itens[0].qtd, 1);
    // assertEquals(r.itens[0].preco, 3.99);

    // Invariante: soma dos itens ~ total (tolerancia p/ desconto/arredondamento)
    const soma = r.itens.reduce((a, i) => a + i.qtd * i.preco, 0);
    assert(
      Math.abs(soma - r.total_nota) < Math.max(1, r.total_nota * 0.02),
      `soma ${soma} vs total ${r.total_nota}`,
    );
  },
});
