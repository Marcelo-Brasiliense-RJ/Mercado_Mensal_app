import { describe, expect, it } from "vitest";
import {
  checkDigitOk,
  isTypedBarcode,
  isValidBarcode,
  onlyDigits,
  prettyBarcode,
} from "./barcode";

describe("codigo de barras", () => {
  it("guarda so os digitos", () => {
    expect(onlyDigits(" 789-1234 567890 ")).toBe("7891234567890");
    expect(onlyDigits("abc")).toBe("");
    expect(onlyDigits("")).toBe("");
  });

  it("confere o digito verificador GS1", () => {
    expect(checkDigitOk("7891000315507")).toBe(true); // EAN-13 real (Nestle)
    expect(checkDigitOk("7891000315508")).toBe(false); // ultimo digito trocado
    expect(checkDigitOk("96385074")).toBe(true); // EAN-8
    expect(checkDigitOk("036000291452")).toBe(true); // UPC-A
    expect(checkDigitOk("123")).toBe(false); // curto demais
  });

  it("aceita da camera so o que tem tamanho e verificador de produto", () => {
    expect(isValidBarcode("789 1000 315507")).toBe(true);
    expect(isValidBarcode("7891000315507000")).toBe(false); // longo demais
    expect(isValidBarcode("7891000315508")).toBe(false); // verificador errado
    expect(isValidBarcode("")).toBe(false);
  });

  it("afrouxa no que foi digitado a mao", () => {
    expect(isTypedBarcode("201234")).toBe(true); // etiqueta de balanca
    expect(isTypedBarcode("12345")).toBe(false);
    expect(isTypedBarcode("123456789012345")).toBe(false);
  });

  it("formata o EAN-13 para conferir com a etiqueta", () => {
    expect(prettyBarcode("7891000315507")).toBe("789 1000 315507");
    expect(prettyBarcode("96385074")).toBe("96385074");
  });
});
