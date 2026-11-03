// Jeitos diferentes de dizer a mesma coisa. Cada pessoa fala de um jeito ("ta
// faltando", "cabou", "risca o leite", "tem um monte de fermento", "nao carece"),
// e o app tem que entender todos. Um vocabulario so, usado em dois lugares:
// - a regra local (sem IA) troca cada variacao pela forma padrao antes de ler;
// - o prompt da IA recebe a mesma tabela, para as duas entenderem igual.
// Para ensinar um jeito novo de falar: acrescente aqui e um caso no teste.

type Sentido = { padrao: string; quer_dizer: string; jeitos: string[] };

// Tudo sem acento e minusculo (a regra roda sobre o texto ja normalizado).
export const SENTIDOS: Sentido[] = [
  {
    padrao: "ja tem muito",
    quer_dizer: "tem demais em casa, NAO comprar (excesso)",
    jeitos: [
      "tem muito", "tem muita", "tem muitos", "tem muitas", "tem demais", "tem um monte", "tem monte",
      "tem pra caramba", "tem horrores", "tem bastante", "tem de sobra", "de sobra", "ta sobrando",
      "esta sobrando", "sobrando", "ta cheio de", "cheio de", "ta cheia de", "cheia de", "ta lotado de",
      "ta lotada de", "lotado de", "lotada de", "abarrotado", "estocado", "entupido",
      "tenho muito", "tenho muita", "tenho bastante", "tenho um monte", "temos muito", "temos bastante",
      "temos um monte", "ja tem muito", "ja tem bastante", "ja tem um monte",
    ],
  },
  {
    padrao: "acabou",
    quer_dizer: "acabou, precisa comprar (lista)",
    jeitos: [
      "cabou", "acabaram", "acabando", "terminou", "terminaram", "zerou", "ja era", "nao tem mais",
      "nao tenho mais", "nao temos mais", "nao tem nada de", "nao sobrou", "ta no fim", "no finalzinho",
      "ta acabando", "quase acabando", "quase no fim", "ta faltando", "esta faltando", "faltando",
      "faltou", "falta", "nao tenho", "nao temos", "sem estoque de",
    ],
  },
  {
    padrao: "nao quero",
    quer_dizer: "NAO comprar / tirar da lista",
    jeitos: [
      "nao precisa", "nao precisamos", "nao preciso", "nao carece", "nao compra", "nao comprar",
      "nao compre", "nao traz", "nao traga", "nao trazer", "nao pega", "nao pegue", "nao pegar",
      "nao bota", "nao coloca", "nao poe", "nem precisa", "nem compra", "nem traz", "pode tirar",
      "tira", "tirar", "tire", "risca", "riscar", "risque", "corta", "cortar", "cancela", "cancelar",
      "esquece", "esquecer", "deixa pra la", "deixa de lado", "segura o", "segura a",
      "nada de", "remove", "remover", "nao quero", "nao vou comprar", "nao vamos comprar",
    ],
  },
  {
    padrao: "preciso",
    quer_dizer: "precisa comprar (lista)",
    jeitos: [
      "to precisando", "ta precisando", "estou precisando", "estamos precisando", "precisando de",
      "precisa de", "precisamos de", "precisamos", "tem que comprar", "tem que pegar", "temos que comprar",
      "vou precisar", "vai precisar", "bota na lista", "coloca na lista", "poe na lista", "anota ai",
      "anota", "lembra de comprar", "nao esquece de comprar", "nao esquece", "nao esquecer", "traz",
      "trazer", "traga", "pega pra mim", "compra", "comprar", "manda vir", "repor", "repoe", "quero",
      "queria", "vou querer",
    ],
  },
  {
    padrao: "tenho",
    quer_dizer: "o que TEM em casa agora (estoque)",
    jeitos: [
      "to com", "tou com", "estou com", "estamos com", "a gente tem", "nos temos", "temos", "ainda tem",
      "ainda temos", "ainda tenho", "sobrou", "restou", "resta", "tem aqui", "aqui tem", "contei",
      "conferi", "guardado", "na despensa tem", "no armario tem", "na geladeira tem", "tem",
    ],
  },
  {
    padrao: "comprei",
    quer_dizer: "acabou de pegar/comprar (carrinho)",
    jeitos: [
      "peguei", "levei", "botei no carrinho", "coloquei no carrinho", "ta no carrinho", "joguei no carrinho",
      "paguei", "custou", "saiu por", "comprado",
    ],
  },
  {
    padrao: "ruim",
    quer_dizer: "produto ruim, nunca mais comprar essa marca",
    jeitos: [
      "nao presta", "nao prestou", "porcaria", "horrivel", "pessimo", "pessima", "nao gostei",
      "nao gostamos", "ninguem gostou", "ninguem come", "fraco", "aguado", "aguada", "vagabundo",
      "vagabunda", "intragavel", "sem gosto", "zoado", "deu ruim", "qualidade ruim", "e ruim",
    ],
  },
];

// Longest first: "nao tem mais" antes de "tem", "tem muito" antes de "tem".
const PARES: [string, string][] = SENTIDOS.flatMap((s) => s.jeitos.map((j) => [j, s.padrao] as [string, string])).sort(
  (a, b) => b[0].length - a[0].length,
);
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE = new RegExp(`\\b(${PARES.map(([j]) => escapar(j).replace(/ /g, "\\s+")).join("|")})\\b`, "g");
const PARA = new Map(PARES.map(([j, p]) => [j, p]));

// Troca cada jeito de falar pela forma padrao. Recebe texto sem acento e minusculo.
// Uma passada so (regex com tudo, maior primeiro): uma troca nao desfaz a outra.
export function normalizarFala(t: string): string {
  return t.replace(RE, (m) => PARA.get(m.replace(/\s+/g, " ")) ?? m);
}

// A mesma tabela, para o prompt da IA.
export function vocabularioParaIA(): string {
  return SENTIDOS.map((s) => `- ${s.quer_dizer}: ${s.jeitos.slice(0, 18).map((j) => `"${j}"`).join(", ")}…`).join("\n");
}
