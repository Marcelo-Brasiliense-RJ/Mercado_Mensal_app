"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StockItem, ShopItem } from "./types";
import {
  stock as seedStock,
  shopping as seedShopping,
  budget as seedBudget,
  savings,
  savingsTotal,
  months,
  family,
  members,
} from "./seed";

// Estado mutavel compartilhado por todas as telas (mobile e desktop sao o mesmo
// app). Persistido em localStorage: dentro de um dispositivo, editar na Lista
// reflete no Estoque e sobrevive a reload.
// ponytail: localStorage e o stand-in de sincronizacao; a sincronizacao real
// entre dispositivos entra ao ligar o Supabase (RPCs _web).
type Mutable = {
  stock: StockItem[];
  shopping: ShopItem[];
  budget: { total: number; spent: number };
};

const SEED: Mutable = {
  stock: seedStock,
  shopping: seedShopping,
  budget: { ...seedBudget },
};

const STORAGE_KEY = "dispensa-data";

type Store = Mutable & {
  // dados de leitura (ainda estaticos)
  savings: typeof savings;
  savingsTotal: number;
  months: typeof months;
  family: typeof family;
  members: typeof members;
  toast: string | null;
  // acoes
  toggleBought: (id: string) => void;
  addShopItem: (item: Omit<ShopItem, "id" | "status">) => void;
  addStockToList: (item: StockItem) => void;
  setBudget: (total: number) => void;
  confirmReceipt: (items: { name: string; qty: number; price: number }[]) => void;
  showToast: (msg: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do AppStoreProvider");
  return s;
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Mutable>(SEED);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidrata do localStorage depois do primeiro render (evita mismatch de SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData({ ...SEED, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const persist = useCallback((next: Mutable) => {
    setData(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const toggleBought = useCallback(
    (id: string) =>
      persist({
        ...data,
        shopping: data.shopping.map((i) =>
          i.id === id
            ? { ...i, status: i.status === "bought" ? "pending" : "bought" }
            : i,
        ),
      }),
    [data, persist],
  );

  const addShopItem = useCallback(
    (item: Omit<ShopItem, "id" | "status">) =>
      persist({
        ...data,
        shopping: [
          ...data.shopping,
          { ...item, id: `l-${Date.now()}`, status: "pending" },
        ],
      }),
    [data, persist],
  );

  const addStockToList = useCallback(
    (item: StockItem) => {
      if (data.shopping.some((s) => s.name === item.name && s.status !== "removed"))
        return;
      persist({
        ...data,
        shopping: [
          ...data.shopping,
          {
            id: `l-${Date.now()}`,
            name: item.name,
            desired_quantity: Math.max(1, Math.round(item.normal - item.current)),
            unit: item.unit,
            estimated_price: item.priceLast,
            status: "pending",
          },
        ],
      });
    },
    [data, persist],
  );

  const setBudget = useCallback(
    (total: number) => persist({ ...data, budget: { ...data.budget, total } }),
    [data, persist],
  );

  const confirmReceipt = useCallback(
    (items: { name: string; qty: number; price: number }[]) => {
      const spent = items.reduce((a, i) => a + i.qty * i.price, 0);
      persist({ ...data, budget: { ...data.budget, spent: data.budget.spent + spent } });
    },
    [data, persist],
  );

  const value = useMemo<Store>(
    () => ({
      ...data,
      savings,
      savingsTotal,
      months,
      family,
      members,
      toast,
      toggleBought,
      addShopItem,
      addStockToList,
      setBudget,
      confirmReceipt,
      showToast,
    }),
    [
      data,
      toast,
      toggleBought,
      addShopItem,
      addStockToList,
      setBudget,
      confirmReceipt,
      showToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
