const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function brl(n: number): string {
  return brlFmt.format(n ?? 0);
}

export type ListItemLike = {
  desired_quantity: number;
  estimated_price: number | null;
  status: string;
};

export function listTotal(items: ListItemLike[]): number {
  return items
    .filter((i) => i.status === "pending")
    .reduce((acc, i) => acc + i.desired_quantity * (i.estimated_price ?? 0), 0);
}

export function pendingCount(items: ListItemLike[]): number {
  return items.filter((i) => i.status === "pending").length;
}

export function stockRatio(current: number, par: number): number {
  return par > 0 ? current / par : 1;
}

export function stockStatus(current: number, par: number): "repor" | "ok" {
  return stockRatio(current, par) < 0.5 ? "repor" : "ok";
}

export type BudgetStatus = {
  pct: number;
  over: boolean;
  saldo: number;
  tone: "brand" | "warn" | "neg";
};

export function budgetStatus(spent: number, total: number): BudgetStatus {
  const pct = total > 0 ? (spent / total) * 100 : 0;
  const over = spent > total;
  const saldo = total - spent;
  const tone: BudgetStatus["tone"] = over ? "neg" : pct > 85 ? "warn" : "brand";
  return { pct, over, saldo, tone };
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

// Segundos de espera em texto curto: "45 s", "12 min", "16 h". Mostrar "59047s" no
// aviso da IA (visto no print do dono) nao diz nada a ninguem.
export function tempoCurto(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}
