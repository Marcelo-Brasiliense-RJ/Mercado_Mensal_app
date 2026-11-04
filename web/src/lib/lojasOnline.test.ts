import { describe, expect, it } from "vitest";
import { casaBusca, chaveProduto, chipDoDepto, fimCampanha, lojaDe, marcaDe, melhorOnline, produtosVtex } from "./lojasOnline";

describe("melhor loja online", () => {
  it("mesmo preco: ganha a que da mais pontos", () => {
    const m = melhorOnline(
      [
        { loja: "ECO", preco: 10, pts: 1 },
        { loja: "CRM", preco: 10, pts: 3 },
      ],
      0.03,
    );
    expect(m?.loja).toBe("CRM");
  });
  it("mais barato no caixa ganha se os pontos nao compensam", () => {
    const m = melhorOnline(
      [
        { loja: "CRM", preco: 12, pts: 3 },
        { loja: "DPC", preco: 9, pts: 1 },
      ],
      0.03,
    );
    expect(m?.loja).toBe("DPC");
  });
  it("sem nada: null", () => expect(melhorOnline([], 0.03)).toBeNull());
});

describe("fim da campanha", () => {
  it("pega a ultima data", () => {
    expect(fimCampanha("Campanha válida de 03 a 05/11/2026. Ganhe 3 pontos")).toBe("05/11");
    expect(fimCampanha("Consulte o regulamento")).toBeNull();
    expect(fimCampanha(null)).toBeNull();
  });
});

describe("vitrine", () => {
  const sams = lojaDe("ECO")!;
  const vtex = (nome: string, preco: number, de: number, cat = "/Limpeza/Sabão/") => ({
    productId: nome,
    productName: nome,
    linkText: "x",
    categories: [cat],
    items: [{ images: [{ imageUrl: "https://a/ids/12/f.jpg" }], sellers: [{ commertialOffer: { Price: preco, ListPrice: de, AvailableQuantity: 5 } }] }],
  });
  it("normaliza, calcula desconto e separa por departamento", () => {
    const [p] = produtosVtex([vtex("Sabão Omo 3kg", 30, 40)], sams);
    expect(p).toMatchObject({ loja: "ECO", preco: 30, de: 40, chip: "limpeza", foto: "https://a/ids/12-300-300/f.jpg" });
    expect(p.desconto).toBeCloseTo(0.25);
  });
  it("tira erro de cadastro e preco de centavos", () => {
    expect(produtosVtex([vtex("Parafuso", 0.09, 59.9), vtex("Kit", 5, 100)], sams)).toHaveLength(0);
  });
  it("departamentos", () => {
    expect(chipDoDepto("Eletroportáteis")).toBe("casa");
    expect(chipDoDepto("Esporte e Lazer")).toBe("casa");
    expect(chipDoDepto("Cama Mesa e Banho")).toBe("casa");
    expect(chipDoDepto("Mercearia Doce")).toBe("mercado");
    expect(chipDoDepto("Moda")).toBeNull();
  });
  it("destaca o que e da casa", () => {
    expect(marcaDe("Arroz Camil 5kg", ["arroz"], [])).toBe("lista");
    expect(marcaDe("Café Pilão 500g", ["arroz"], ["café"])).toBe("estoque");
    expect(marcaDe("Air Fryer Midea", ["arroz"], ["café"])).toBeNull();
    expect(marcaDe("Filé de Peito de Frango Congelado Seara 1kg", [], ["frango sadia"])).toBe("estoque");
    expect(marcaDe("Contra Filé Resfriado Maturatta", [], ["contra filé"])).toBe("estoque");
    expect(marcaDe("Feijão Carioca Camil 1kg", [], [])).toBe("basico");
    expect(marcaDe("Óleo de Arroz Pazze", ["arroz"], [])).not.toBe("lista");
  });
});

describe("busca", () => {
  it("todas as palavras, sem acento", () => {
    expect(casaBusca("Iogurte Grego Vigor 500g", "iogurte grego")).toBe(true);
    expect(casaBusca("Café Pilão", "cafe")).toBe(true);
    expect(casaBusca("Iogurte Natural", "iogurte grego")).toBe(false);
  });
});

describe("mesmo produto em outra loja", () => {
  it("chave com as 3 primeiras palavras", () => {
    expect(chaveProduto("Filé de Peito de Frango Corte Congelado Seara 1kg")).toBe("file peito frango");
  });
});
