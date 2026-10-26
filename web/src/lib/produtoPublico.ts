// Nome do produto a partir do codigo de barras, usando a base publica Open Food
// Facts (gratis, sem chave, com bastante produto brasileiro).
//
// Por que existe: ler o codigo e ainda ter que digitar "refrigerante" quebra a
// promessa do leitor. A base devolve "REFRIGERANTE SUKITA UVA 2L"; o que o app
// precisa e do nome GENERICO ("refrigerante"), porque o estoque e por produto, e
// marca e detalhe da compra (secao 2 do CONTEXTO.md).
// ponytail: so Open Food Facts, que cobre comida e bebida. Limpeza e higiene
// quase nao estao la; nesses o campo volta vazio e a pessoa digita, como antes.

export type ProdutoPublico = {
  nome: string; // como esta no rotulo, legivel: "Refrigerante Sukita Uva 2L"
  generico: string; // sem marca e sem tamanho: "refrigerante"
  unidade: string | null;
  marca: string;
};

// "2l" -> L, "500ml" -> ml, "100 g" -> g, "1,5kg" -> kg
export function unidadeDe(quantidade: string | undefined | null): string | null {
  const q = (quantidade ?? "").toLowerCase().replace(",", ".").trim();
  if (!q) return null;
  const m = q.match(/([\d.]+)\s*(kg|g|l|ml|un|unidades?)\b/);
  if (!m) return null;
  const u = m[2];
  if (u === "l") return "L";
  if (u.startsWith("un")) return "un";
  return u;
}

function limpa(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Tira a marca e o tamanho da embalagem do nome, que e o que sobra de util:
// "REFRIGERANTE SUKITA UVA 2L" + marca "SUKITA UVA" -> "refrigerante".
// Se a limpeza comer o nome inteiro, devolve o nome so sem o tamanho, porque
// sugestao ruim ainda e melhor do que campo vazio.
export function nomeGenerico(bruto: string, marcas = ""): string {
  let nome = limpa(bruto);
  if (!nome) return "";

  // tamanho da embalagem em qualquer posicao: 2l, 500 ml, 1,5kg, 12x350ml
  const semTamanho = limpa(
    nome.replace(/\b\d+[\d.,]*\s*(x\s*\d+[\d.,]*\s*)?(kg|g|l|ml|lt|litros?|gramas?)\b/g, ""),
  );
  nome = semTamanho || nome;

  // Comparacao por palavra inteira, nao por regex com \b: em JS o \b so conhece
  // [A-Za-z0-9_], entao "nescafé" nunca casava (o acento ja nao e word char).
  const marcaTokens = new Set(
    limpa(marcas)
      .split(/[\s,]+/)
      .filter((t) => t.length > 2),
  );
  const semMarca = limpa(
    nome
      .split(" ")
      .filter((t) => !marcaTokens.has(t))
      .join(" "),
  );

  return semMarca || nome;
}

// O rotulo vem gritado da base ("REFRIGERANTE SUKITA UVA 2L"). Na tela isso
// parece erro, e caixa alta e mais dificil de ler de relance no corredor do
// mercado. Vira "Refrigerante Sukita Uva 2L", mantendo 2L, 500ml e afins.
export function nomeExibicao(bruto: string): string {
  const base = (bruto ?? "").replace(/\s+/g, " ").trim();
  if (!base) return "";
  if (base !== base.toUpperCase()) return base; // ja veio com caixa normal

  return base
    .toLowerCase()
    .split(" ")
    .map((palavra) => {
      // 2l, 500ml, 1,5kg: unidade em caixa certa, nao "2L" virando "2l"
      const medida = palavra.match(/^([\d.,]+)\s*(kg|g|ml|l)$/);
      if (medida) return medida[1] + (medida[2] === "l" ? "L" : medida[2]);
      if (palavra.length <= 2) return palavra;
      return palavra[0].toUpperCase() + palavra.slice(1);
    })
    .join(" ");
}

export function mapearOpenFoodFacts(json: unknown): ProdutoPublico | null {
  const p = (json as { status?: number; product?: Record<string, unknown> })?.product;
  if (!p) return null;
  const bruto = String(p.product_name_pt || p.product_name || "").trim();
  if (!bruto) return null;
  const marca = String(p.brands ?? "");
  return {
    nome: nomeExibicao(bruto),
    generico: nomeGenerico(bruto, marca),
    unidade: unidadeDe(String(p.quantity ?? "")),
    marca: marca.split(",")[0]?.trim() ?? "",
  };
}
