// Defaults de entrada: o campo nasce preenchido e o usuario so corrige o que
// estiver errado. Regra do produto: nunca pedir o que da pra deduzir.

// Palavra-chave -> unidade. Cobre o que aparece numa compra de mes; o resto
// cai em "un". ponytail: tabela literal, sem IA e sem dependencia. Se passar de
// ~40 entradas, o caminho certo e aprender do historico da familia, nao crescer
// esta lista.
const UNIT_BY_KEYWORD: Record<string, string> = {
  // kg
  arroz: "kg", feijao: "kg", acucar: "kg", farinha: "kg", batata: "kg",
  cebola: "kg", tomate: "kg", carne: "kg", frango: "kg", banana: "kg",
  maca: "kg", laranja: "kg", cenoura: "kg", alho: "kg", sal: "kg",
  // litro
  leite: "L", oleo: "L", agua: "L", suco: "L", refrigerante: "L",
  amaciante: "L", detergente: "L", alcool: "L", vinagre: "L", cerveja: "L",
  // duzia
  ovo: "dz", ovos: "dz",
  // pacote
  macarrao: "pct", biscoito: "pct", bolacha: "pct", cafe: "pct", pao: "pct",
};

// Tira acento e caixa para o match funcionar com "feijão" e "feijao".
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Unidade sugerida a partir do nome do item. Default "un".
export function unitFor(name: string): string {
  const n = norm(name);
  if (!n) return "un";
  for (const word of n.split(/\s+/)) {
    const hit = UNIT_BY_KEYWORD[word];
    if (hit) return hit;
  }
  return "un";
}

// Passo do mais/menos. Meio a meio no que se compra fracionado (1,5 kg de carne,
// 0,5 L de leite); de um em um no resto, porque meio sabonete nao existe.
export function stepFor(unit: string): number {
  return ["kg", "l", "g", "ml"].includes(unit.trim().toLowerCase()) ? 0.5 : 1;
}

// Item ja cadastrado com esse nome (compara sem acento/caixa). Serve para
// avisar "voce ja tem X em casa" antes de criar duplicado, e para reaproveitar
// o ultimo preco conhecido.
export function findByName<T extends { name: string }>(
  name: string,
  items: T[],
): T | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return items.find((i) => norm(i.name) === n);
}
