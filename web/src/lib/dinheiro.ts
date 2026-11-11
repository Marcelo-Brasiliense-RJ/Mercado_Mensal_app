// Campo de dinheiro como em app de banco: so numeros, sem virgula. Cada digito entra
// pelos centavos e empurra os outros: 1 -> 0,01; 17 -> 0,17; 1700 -> 17,00. O dono
// reclamou de ter que achar a virgula no teclado a cada preco no mercado.
// Sai com virgula e sem ponto de milhar: o Number(texto.replace(",", ".")) que as
// telas ja usam continua lendo certo.
export function mascaraDinheiro(texto: string): string {
  const d = texto.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
  if (!d) return "";
  const n = d.padStart(3, "0");
  return `${n.slice(0, -2)},${n.slice(-2)}`;
}

// Valor que ja existe (ultimo preco, 6.2) no formato do campo (6,20).
export function dinheiroCampo(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return n != null && Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(".", ",") : "";
}
