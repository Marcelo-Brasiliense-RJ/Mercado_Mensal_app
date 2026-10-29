// Categoria (corredor) de um item da casa, deduzida do nome.
//
// Por que existe: o produto da despensa nao tem categoria no banco (o bot e a nota
// so trazem o nome), e pedir para a pessoa classificar cada item fere a regra de
// nunca perguntar o que da para deduzir. Mesmas categorias dos encartes (aba Ofertas),
// entao Estoque, Economia e Ofertas falam a mesma lingua.
//
// Ordem: expressao exata ("creme dental") > "congelado" no nome > primeira palavra >
// qualquer palavra > categoria da oferta com o mesmo nome > Outros.
// ponytail: tabela literal. Se errar muito, o upgrade e guardar a correcao da pessoa
// numa coluna products.category, e esta tabela vira so o palpite inicial.
import { casaItem, padrao, type Oferta } from "./ofertas";

const EXPRESSAO: [string, string][] = [
  ["creme dental", "Perfumaria e Higiene"], ["fio dental", "Perfumaria e Higiene"],
  ["papel higienico", "Perfumaria e Higiene"], ["creme de leite", "Frios e Laticínios"],
  ["leite condensado", "Mercearia"], ["leite em po", "Mercearia"], ["doce de leite", "Doces e Biscoitos"],
  ["agua sanitaria", "Limpeza"], ["saco de lixo", "Limpeza"], ["papel toalha", "Limpeza"],
  ["peito de peru", "Frios e Laticínios"], ["batata palha", "Doces e Biscoitos"],
  ["batata chips", "Doces e Biscoitos"], ["barra de cereal", "Doces e Biscoitos"],
  ["papel aluminio", "Utilidades"], ["papel manteiga", "Utilidades"], ["filme plastico", "Utilidades"],
  ["filtro de cafe", "Utilidades"], ["pao de queijo", "Congelados"], ["batata frita", "Congelados"],
  ["leite de coco", "Mercearia"], ["agua oxigenada", "Perfumaria e Higiene"], ["alcool em gel", "Perfumaria e Higiene"],
  ["alcool gel", "Perfumaria e Higiene"], ["pasta de dente", "Perfumaria e Higiene"], ["lenco umedecido", "Bebê"], ["toalha umedecida", "Perfumaria e Higiene"], ["areia sanitaria", "Pet"],
];

const PALAVRAS: Record<string, string[]> = {
  Hortifruti: ["limao", "cebola", "mamao", "berinjela", "cenoura", "batata", "alho", "tomate", "ameixa", "gengibre",
    "banana", "maca", "laranja", "alface", "uva", "abacaxi", "melancia", "melao", "pepino", "abobrinha", "abobora",
    "pimentao", "couve", "repolho", "morango", "manga", "kiwi", "mandioca", "aipim", "beterraba", "brocolis",
    "chuchu", "quiabo", "jilo", "pera", "tangerina", "abacate", "salsa", "cebolinha", "coentro", "rucula", "agriao",
    "ovo", "ovos", "goiaba", "maracuja", "inhame", "vagem"],
  Padaria: ["pao", "paes", "bisnaguinho", "bisnaguinha", "torrada", "bolo", "croissant", "rosca", "broa"],
  Carnes: ["carne", "bisteca", "file", "frango", "peito", "sobrecoxa", "coxa", "coxinha", "asa", "linguica",
    "hamburguer", "acem", "patinho", "alcatra", "picanha", "costela", "maminha", "musculo", "cupim", "fraldinha",
    "lombo", "pernil", "peixe", "tilapia", "salmao", "camarao", "contrafile", "coxao", "paleta", "figado",
    "moela", "chester", "peru", "merluza", "pescada", "bife"],
  "Frios e Laticínios": ["queijo", "presunto", "mortadela", "salame", "salsicha", "bacon", "leite", "iogurte",
    "manteiga", "margarina", "requeijao", "ricota", "nata", "coalhada", "kani", "danone", "activia", "petit",
    "blanquet", "apresuntado"],
  Congelados: ["lasanha", "pizza", "nuggets", "waffle", "sorvete", "polpa", "empanado", "steak", "picole"],
  Mercearia: ["arroz", "feijao", "acucar", "sal", "farinha", "farofa", "macarrao", "oleo", "azeite", "vinagre",
    "cafe", "milho", "extrato", "molho", "maionese", "ketchup", "mostarda", "atum", "sardinha", "ervilha", "aveia",
    "granola", "cereal", "achocolatado", "fuba", "tempero", "caldo", "alga", "palmito", "azeitona", "gelatina",
    "fermento", "amido", "polvilho", "tapioca", "mel", "geleia", "cha", "pipoca", "lentilha", "grao", "massa",
    "creme", "pure", "canjica", "sopa", "neston", "nescau", "cuscuz", "trigo", "condimento", "oregano", "pimenta",
    "adocante", "sucralose", "stevia", "xilitol", "capsula", "coco", "castanha", "passas", "whey", "proteina",
    "chia", "linhaca", "quinoa", "sazon", "colorau", "cominho", "louro", "canela", "baunilha", "essencia"],
  "Doces e Biscoitos": ["biscoito", "bolacha", "cookie", "cookies", "wafer", "salgadinho", "chocolate", "bala",
    "pacoca", "doce", "chips", "amendoim", "pirulito", "chiclete", "bombom", "oreo", "trakinas", "goiabada",
    "brigadeiro", "marshmallow"],
  Bebidas: ["agua", "refrigerante", "suco", "cerveja", "vinho", "refresco", "energetico", "coca", "guarana",
    "isotonico", "xarope", "espumante", "vodka", "cachaca", "whisky", "kombucha"],
  Limpeza: ["detergente", "sabao", "amaciante", "desinfetante", "alvejante", "esponja", "limpador", "multiuso",
    "lustra", "cloro", "pinho", "lava", "veja", "vassoura", "rodo", "inseticida", "removedor", "tira",
    "sanitario", "sanitaria", "saponaceo", "difusor", "bloco", "pedra", "lustra", "alcool", "pano", "luva",
    "flanela", "palha", "odorizador", "desodorizador", "aromatizador", "naftalina", "limpa", "lixeira"],
  "Perfumaria e Higiene": ["shampoo", "xampu", "condicionador", "sabonete", "escova", "desodorante", "absorvente",
    "cotonete", "aparelho", "protetor", "hidratante", "creme", "barbear", "algodao", "enxaguante",
    "antisseptico", "enxaguatorio", "listerine", "colgate", "sorriso", "oral", "talco", "repelente", "acetona",
    "esmalte", "tintura", "pomada", "curativo", "band", "gilete", "lamina", "pente", "lenco", "perfume", "colonia",
    "gel", "fixador", "mascara", "batom", "remedio", "vitamina", "dipirona", "paracetamol", "termometro"],
  Bebê: ["fralda", "fraldas", "papinha", "mamadeira"],
  Pet: ["racao", "petisco", "areia"],
  Utilidades: ["pilha", "lampada", "guardanapo", "filme", "copo", "vela", "fosforo", "isqueiro", "prato", "talher",
    "palito", "saco", "sacola", "pote", "forma", "filtro", "carvao", "fita", "pregador", "extensao"],
};

const POR_PALAVRA = new Map<string, string>();
for (const [cat, ps] of Object.entries(PALAVRAS)) for (const p of ps) if (!POR_PALAVRA.has(p)) POR_PALAVRA.set(p, cat);

export function categoriaDe(nome: string, ofertas: Oferta[] = []): string {
  const n = padrao(nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return "Outros";
  for (const [e, cat] of EXPRESSAO) if (n.includes(e)) return cat;
  if (/\bcongelad/.test(n)) return "Congelados";
  const palavras = n.split(" ");
  const primeira = POR_PALAVRA.get(palavras[0]);
  if (primeira) return primeira;
  for (const p of palavras.slice(1)) {
    const c = POR_PALAVRA.get(p);
    if (c) return c;
  }
  // Ultimo recurso: como os encartes classificam produto com esse nome.
  const conta: Record<string, number> = {};
  for (const o of ofertas) if (o.categoria !== "Outros" && casaItem(o, nome)) conta[o.categoria] = (conta[o.categoria] ?? 0) + 1;
  const melhor = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
  return melhor?.[0] ?? "Outros";
}

export const ICONE: Record<string, string> = {
  Mercearia: "🥫", Bebidas: "🥤", Carnes: "🥩", "Frios e Laticínios": "🧀", Hortifruti: "🥦", Padaria: "🍞",
  Congelados: "🧊", "Doces e Biscoitos": "🍪", Limpeza: "🧽", "Perfumaria e Higiene": "🧴", Bebê: "🍼", Pet: "🐾",
  Utilidades: "🔦", Outros: "🛒",
};
