// Compras do mes (0055): cada compra junta os itens que entraram juntos (o carrinho
// finalizado, a nota importada, o item avulso). Aqui so tipos e contas puras; as telas
// sao components/economia/ComprasLista.tsx e CompraDetalhe.tsx.

export type CompraResumo = {
  id: string;
  data: string; // YYYY-MM-DD (competencia)
  momento: string;
  origem: "carrinho" | "nota" | "avulsa";
  mercado: string | null;
  nota_total: number | null;
  sem_nota_ok: boolean;
  tem_nota: boolean;
  pendente: boolean;
  itens: number;
  total: number;
};

export type ComprasMes = {
  ok: boolean;
  mes: string;
  compras: CompraResumo[];
  pendentes: { id: string; data: string; total: number }[];
};

// Avisa as telas que mostram compras (Gastos) que algo mudou fora delas (a nota trocada
// pelo leitor de nota, que e um popup global).
export const EVENTO_COMPRAS = "compras-mudaram";
export function avisarComprasMudaram() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_COMPRAS));
}

// "11/11" (dia/mes), sem depender do fuso do aparelho: a data ja vem como dia.
export function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function diaDaSemana(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

export function rotuloOrigem(c: Pick<CompraResumo, "origem" | "mercado" | "itens">): string {
  const base = c.mercado?.trim() || (c.origem === "carrinho" ? "No mercado" : c.origem === "nota" ? "Nota fiscal" : c.itens === 1 ? "Item avulso" : "Lançamento avulso");
  return base;
}

// Estado da nota numa palavra, para o selo do card.
export function estadoNota(c: Pick<CompraResumo, "tem_nota" | "pendente" | "sem_nota_ok">): "com_nota" | "pendente" | "sem_nota" | "nenhum" {
  if (c.tem_nota) return "com_nota";
  if (c.pendente) return "pendente";
  if (c.sem_nota_ok) return "sem_nota";
  return "nenhum";
}
