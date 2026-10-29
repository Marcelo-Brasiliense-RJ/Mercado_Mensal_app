import { describe, expect, it, vi } from "vitest";
import { reconhecerEmEtapas, type Etapas } from "./etapasReconhecer";

const vex = { nome: "Álcool 46° Vex 1L", marca: "Vex", tamanho: "1L", codigo: "" };

function etapas(p: Partial<Etapas>): Etapas {
  return {
    codigoLocal: vi.fn(async () => ""),
    produto: vi.fn(async () => null),
    ia: vi.fn(async () => null),
    ...p,
  };
}

describe("reconhecerEmEtapas", () => {
  it("codigo lido na foto resolve sem chamar a IA", async () => {
    const e = etapas({
      codigoLocal: async () => "7891000315507",
      produto: async () => ({ nome: "Leite Ninho 380g", marca: "Nestlé" }),
    });
    const r = await reconhecerEmEtapas(e);
    expect(r).toMatchObject({ ok: true, nome: "Leite Ninho 380g", codigo: "7891000315507", fonte: "codigo" });
    expect(e.ia).not.toHaveBeenCalled();
  });

  it("codigo da foto fora das bases: segue para a IA, guardando o codigo", async () => {
    const e = etapas({ codigoLocal: async () => "7898725540573", ia: async () => vex });
    const r = await reconhecerEmEtapas(e);
    expect(r).toMatchObject({ ok: true, nome: vex.nome, codigo: "7898725540573", fonte: "ia" });
  });

  it("IA leu um codigo: o nome vem da base, nao da IA", async () => {
    const e = etapas({
      ia: async () => ({ ...vex, nome: "Alcool Vex", codigo: "7898725540573" }),
      produto: async () => ({ nome: "Álcool Líquido Vex 46 INPM 1L" }),
    });
    const r = await reconhecerEmEtapas(e);
    expect(r).toMatchObject({ ok: true, nome: "Álcool Líquido Vex 46 INPM 1L", marca: "Vex", codigo: "7898725540573" });
  });

  it("IA rapida nao soube: tenta a forte", async () => {
    const ia = vi.fn(async (forte: boolean) => (forte ? vex : null));
    const r = await reconhecerEmEtapas(etapas({ ia }));
    expect(ia).toHaveBeenCalledTimes(2);
    expect(ia).toHaveBeenLastCalledWith(true);
    expect(r).toMatchObject({ ok: true, nome: vex.nome });
  });

  it("nenhuma etapa reconheceu", async () => {
    const r = await reconhecerEmEtapas(etapas({}));
    expect(r).toEqual({ ok: false, motivo: "nao_reconheceu", codigo: "" });
  });

  it("servidor sem chave da IA: nao insiste na forte", async () => {
    const ia = vi.fn(async () => "sem_ia" as const);
    const r = await reconhecerEmEtapas(etapas({ ia }));
    expect(ia).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, motivo: "sem_ia" });
  });

  it("IA sem resposta (rede/cota)", async () => {
    const r = await reconhecerEmEtapas(etapas({ ia: async () => undefined }));
    expect(r).toMatchObject({ ok: false, motivo: "ia_falhou" });
  });

  it("etapa que quebra nao derruba a linha", async () => {
    const r = await reconhecerEmEtapas(
      etapas({
        codigoLocal: async () => {
          throw new Error("sem camera");
        },
        ia: async () => vex,
      }),
    );
    expect(r).toMatchObject({ ok: true, nome: vex.nome });
  });
});
