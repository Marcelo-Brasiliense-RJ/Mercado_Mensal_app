import type { StockItem, ShopItem, SavingRow, MonthPoint, Member } from "./types";

// Dados de exemplo (seed) para a demo visual. Substituidos por leitura real do Supabase.

export const family = {
  name: "Casa da Praia",
  code: "K7M2Q5",
  botHandle: "@Mercado_cellks_bot",
};

export const members: Member[] = [
  { name: "Marcelo", role: "Admin", telegram: true },
  { name: "Ana", role: "Membro", telegram: true },
  { name: "Joao", role: "Membro", telegram: false },
];

export const stock: StockItem[] = [
  { id: "arroz", name: "Arroz", category: "Graos", unit: "kg", current: 1, normal: 5, priceLast: 5.49, priceAvg: 5.9, trend: -0.07 },
  { id: "feijao", name: "Feijao", category: "Graos", unit: "kg", current: 0.5, normal: 3, priceLast: 8.9, priceAvg: 8.2, trend: 0.08 },
  { id: "cafe", name: "Cafe", category: "Mercearia", unit: "pacote", current: 1, normal: 4, priceLast: 15.9, priceAvg: 16.5, trend: -0.03 },
  { id: "leite", name: "Leite", category: "Laticinios", unit: "L", current: 6, normal: 8, priceLast: 4.29, priceAvg: 4.5, trend: -0.04 },
  { id: "acucar", name: "Acucar", category: "Mercearia", unit: "kg", current: 3, normal: 4, priceLast: 4.19, priceAvg: 3.99, trend: 0.05 },
  { id: "sabao", name: "Sabao em po", category: "Limpeza", unit: "pacote", current: 2, normal: 2, priceLast: 22.9, priceAvg: 24.0, trend: -0.05 },
  { id: "papel", name: "Papel higienico", category: "Higiene", unit: "pacote", current: 8, normal: 8, priceLast: 25.9, priceAvg: 25.9, trend: 0 },
];

export const shopping: ShopItem[] = [
  { id: "l1", name: "Arroz", desired_quantity: 2, unit: "kg", estimated_price: 5.49, status: "pending" },
  { id: "l2", name: "Feijao", desired_quantity: 2, unit: "kg", estimated_price: 8.9, status: "pending" },
  { id: "l3", name: "Cafe", desired_quantity: 1, unit: "pacote", estimated_price: 15.9, status: "pending" },
  { id: "l4", name: "Detergente", desired_quantity: 3, unit: "un", estimated_price: 2.79, status: "pending" },
  { id: "l5", name: "Leite", desired_quantity: 6, unit: "L", estimated_price: 4.29, status: "bought" },
];

export const savings: SavingRow[] = [
  { name: "Arroz", oldPrice: 5.9, newPrice: 5.49, saved: 0.82 },
  { name: "Cafe", oldPrice: 16.5, newPrice: 15.9, saved: 0.6 },
  { name: "Sabao em po", oldPrice: 24.0, newPrice: 22.9, saved: 2.2 },
  { name: "Leite", oldPrice: 4.5, newPrice: 4.29, saved: 1.26 },
];

export const budget = {
  total: 900,
  spent: 642.35,
};

export const months: MonthPoint[] = [
  { label: "Fev", value: 820, current: false },
  { label: "Mar", value: 910, current: false },
  { label: "Abr", value: 760, current: false },
  { label: "Mai", value: 880, current: false },
  { label: "Jun", value: 705, current: false },
  { label: "Jul", value: 642, current: true },
];

export const savingsTotal = savings.reduce((a, s) => a + s.saved, 0);
