import { describe, expect, it } from "vitest";
import { isRjQrUrl, toReviewRows } from "./nfce";

describe("nfce helpers", () => {
  it("reconhece URL de QR do RJ", () => {
    expect(
      isRjQrUrl("https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=x"),
    ).toBe(true);
    expect(isRjQrUrl("https://google.com")).toBe(false);
    expect(isRjQrUrl("")).toBe(false);
  });

  it("mapeia resposta ok para linhas de revisao", () => {
    const rows = toReviewRows({
      ok: true,
      chave: "1",
      emitente: "X",
      total_nota: 10,
      total_itens: 10,
      total_confere: true,
      itens: [
        {
          nome: "arroz",
          marca: "tio joao",
          qtd: 2,
          preco: 5,
          unidade: "un",
          desc_fiscal: "ARROZ TJ",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nome: "arroz", qty: 2, price: 5, unit: "un" });
  });

  it("resposta de erro vira lista vazia", () => {
    expect(toReviewRows({ ok: false, erro: "parse_falhou" })).toEqual([]);
  });
});
