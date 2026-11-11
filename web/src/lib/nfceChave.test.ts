import { describe, expect, it } from "vitest";
import { chaveDoQr, ufDaChave } from "./nfce";

const CH = "33261175315330210256551000031659410485791752";
describe("chave da NFC-e pelo QR ou link", () => {
  it("le a chave do QR de qualquer estado", () => {
    expect(chaveDoQr(`http://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${CH}|2|1|1|ABC`)).toBe(CH);
    expect(chaveDoQr(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CH}%7C2%7C1%7C1%7Cabc`)).toBe(CH);
    expect(chaveDoQr(`https://x.gov.br/consulta?chNFe=${CH}&nVersao=100`)).toBe(CH);
    expect(chaveDoQr("https://exemplo.com/oferta")).toBe("");
  });
  it("estado pelos dois primeiros digitos", () => {
    expect(ufDaChave(CH)).toBe("RJ");
    expect(ufDaChave("35" + CH.slice(2))).toBe("SP");
  });
});
