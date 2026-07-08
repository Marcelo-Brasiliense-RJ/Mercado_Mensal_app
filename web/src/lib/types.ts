export type StockItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  current: number;
  normal: number;
  priceLast: number | null;
  priceAvg: number | null;
  trend: number; // fracao, negativo = queda de preco
};

export type ShopItem = {
  id: string;
  name: string;
  desired_quantity: number;
  unit: string;
  estimated_price: number | null;
  status: "pending" | "bought" | "removed";
};

export type SavingRow = {
  name: string;
  oldPrice: number;
  newPrice: number;
  saved: number;
};

export type MonthPoint = {
  label: string;
  value: number;
  current: boolean;
};
