import { describe, expect, it } from "vitest";
import { chatIdDaChave, chaveValida } from "./notaAtalho";

describe("nota pelo atalho", () => {
  const CH = "33261175315330210256551000031659410485791752";
  it("chat_id negativo, estavel e fora da faixa do Telegram", () => {
    const id = chatIdDaChave(CH);
    expect(id).toBe(chatIdDaChave(CH));
    expect(id).toBeLessThan(-8e15);
    expect(id).toBeGreaterThan(-9.1e15);
    expect(Number.isSafeInteger(id)).toBe(true);
    expect(chatIdDaChave("3".repeat(44))).not.toBe(id);
  });
  it("so aceita chave de 44 digitos", () => {
    expect(chaveValida(CH)).toBe(true);
    expect(chaveValida("123")).toBe(false);
  });
});
