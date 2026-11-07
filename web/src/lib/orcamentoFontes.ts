// Orcamento montado por fontes ("VR Marcelo 600 + VR Bianca 500 + Dinheiro 150"):
// o total do mes e a soma. Partes puras aqui, com teste; a tela e o BudgetModal.

export type Fonte = { nome: string; valor: string }; // valor como a pessoa digitou

// Atalhos de um toque (regra 3: toque antes de teclado).
export const SUGESTOES = ["VR", "VA", "Dinheiro", "Cartão", "Pix"];

// "R$ 1.234,56", "800", "150,5", "1234.5" -> numero. Vazio ou lixo -> 0.
export function lerValor(txt: string): number {
  let t = (txt ?? "").replace(/[^\d,.]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? +n.toFixed(2) : 0;
}

export function somar(fontes: Fonte[]): number {
  return +fontes.reduce((s, f) => s + lerValor(f.valor), 0).toFixed(2);
}

// Nome livre para o atalho: "VR" ja existe -> "VR 2", e assim por diante.
export function nomeLivre(base: string, fontes: Fonte[]): string {
  const usados = new Set(fontes.map((f) => f.nome.trim().toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!usados.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

// O que vai para o banco: so o que tem valor.
export function paraSalvar(fontes: Fonte[]): { nome: string; valor: number }[] {
  return fontes
    .map((f) => ({ nome: f.nome.trim(), valor: lerValor(f.valor) }))
    .filter((f) => f.valor > 0);
}

// O que veio do banco vira linhas. Se o total foi mudado por outro caminho (bot,
// voz) e nao bate mais com a soma, as fontes estao velhas: mostra o total numa linha.
export function dasFontesSalvas(
  fontes: { nome?: unknown; valor?: unknown }[] | null | undefined,
  total: number,
): Fonte[] {
  const lidas = (Array.isArray(fontes) ? fontes : [])
    .map((f) => ({ nome: String(f?.nome ?? ""), valor: Number(f?.valor) || 0 }))
    .filter((f) => f.valor > 0);
  const soma = +lidas.reduce((s, f) => s + f.valor, 0).toFixed(2);
  if (lidas.length && Math.abs(soma - (total || 0)) < 0.01) {
    return lidas.map((f) => ({ nome: f.nome === "Orçamento" ? "" : f.nome, valor: valorTexto(f.valor) }));
  }
  return [{ nome: "", valor: total > 0 ? valorTexto(total) : "" }];
}

const milhar = (inteiro: string) => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// 600 -> "600", 1400 -> "1.400", 150.5 -> "150,50"
export function valorTexto(n: number): string {
  const [i, d] = (Number.isInteger(n) ? String(n) : n.toFixed(2)).split(".");
  return d ? `${milhar(i)},${d}` : milhar(i);
}

// Enquanto digita: so digitos e uma virgula, milhar com ponto, no maximo 2
// centavos. "1400" -> "1.400", "1400,5" -> "1.400,5". Ponto digitado no fim vira
// virgula (teclado de alguns aparelhos so tem ponto).
export function formatarDigitando(txt: string): string {
  // Ponto no meio e o milhar que o proprio campo pos (sai e e refeito; apagar um
  // digito de "1.400" da "140", nao "1,40"). Ponto no FIM e a pessoa pedindo decimal.
  const t = (txt ?? "").replace(/\.$/, ",").replace(/\./g, "");
  const limpo = t.replace(/[^\d,]/g, "");
  const [int, ...resto] = limpo.split(",");
  const inteiro = int.replace(/^0+(?=\d)/, "");
  if (!resto.length) return milhar(inteiro);
  return `${milhar(inteiro || "0")},${resto.join("").slice(0, 2)}`;
}
