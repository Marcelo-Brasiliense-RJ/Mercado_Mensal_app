import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bloqueado, lerPaginaNfce, urlDeNota } from "./nfceRj";

const html = fs.readFileSync(path.join(__dirname, "__fixtures__/nfce-rj-sample.html"), "utf8");

describe("pagina da NFC-e (SEFAZ-RJ)", () => {
  it("le itens, emitente, chave e total da pagina real", () => {
    const n = lerPaginaNfce(html);
    expect(n.itens).toHaveLength(8);
    expect(n.itens[0]).toEqual({ desc_fiscal: "SALSICHA HOT DOG PERDIGAO RESF kg", qtd: 0.988, unidade: "kg", preco: 9.98, total_item: 9.86 });
    expect(n.emitente).toContain("CASAS GUANABARA");
    expect(n.chave).toHaveLength(44);
    expect(n.total_nota).toBe(173.78);
  });
  it("reconhece a pagina de bloqueio por IP", () => {
    expect(bloqueado("<body>As operadoras de telecomunicação do Brasil possuem...</body>")).toBe(true);
    expect(bloqueado(html)).toBe(false);
  });
  it("so aceita endereco de nota do governo", () => {
    expect(urlDeNota("http://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=1")).toBe(true);
    expect(urlDeNota("https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=1")).toBe(true);
    expect(urlDeNota("https://evil.com/fazenda.rj.gov.br/")).toBe(false);
  });
});
