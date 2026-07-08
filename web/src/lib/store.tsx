"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StockItem, ShopItem, SavingRow, MonthPoint } from "./types";
import { createClient } from "./supabase/client";

// Estado das telas do app. Os dados vem do Supabase (RPCs _web, leitura por
// familia). As acoes de edicao (marcar comprado, adicionar item, orcamento) sao
// otimistas em memoria; a fonte de escrita hoje e o bot. Ao recarregar, reloadData
// busca de novo do banco.
type Data = {
  stock: StockItem[];
  shopping: ShopItem[];
  budget: { total: number; spent: number };
  savings: SavingRow[];
  months: MonthPoint[];
};

const EMPTY: Data = {
  stock: [],
  shopping: [],
  budget: { total: 0, spent: 0 },
  savings: [],
  months: [],
};

type Store = Data & {
  savingsTotal: number;
  dataLoading: boolean;
  toast: string | null;
  reloadData: () => Promise<void>;
  zerarStock: (ids: string[]) => Promise<void>;
  deleteStock: (ids: string[]) => Promise<void>;
  stockToList: (ids: string[]) => Promise<void>;
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
  const [data, setData] = useState<Data>(EMPTY);
  const [dataLoading, setDataLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const supabase = createClient();
      const [stockR, listR, ecoR] = await Promise.all([
        supabase.rpc("mercado_stock_web"),
        supabase.rpc("mercado_list_web"),
        supabase.rpc("mercado_economia_web"),
      ]);
      const eco = (ecoR.data ?? {}) as {
        budget?: { total: number; spent: number };
        months?: MonthPoint[];
        savings?: SavingRow[];
      };
      setData({
        stock: (stockR.data as StockItem[] | null) ?? [],
        shopping: (listR.data as ShopItem[] | null) ?? [],
        budget: eco.budget ?? { total: 0, spent: 0 },
        months: eco.months ?? [],
        savings: eco.savings ?? [],
      });
    } catch {
      // Falha de rede/sessao: mantem o que tinha. O gate ja cuida de sessao.
    } finally {
      setDataLoading(false);
    }
  }, []);

  const zerarStock = useCallback(
    async (ids: string[]) => {
      await createClient().rpc("mercado_stock_zerar_web", { p_ids: ids });
      await reloadData();
    },
    [reloadData],
  );

  const deleteStock = useCallback(
    async (ids: string[]) => {
      await createClient().rpc("mercado_stock_delete_web", { p_ids: ids });
      await reloadData();
    },
    [reloadData],
  );

  const stockToList = useCallback(
    async (ids: string[]) => {
      await createClient().rpc("mercado_stock_to_list_web", { p_ids: ids });
      await reloadData();
    },
    [reloadData],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const toggleBought = useCallback(
    (id: string) =>
      setData((d) => ({
        ...d,
        shopping: d.shopping.map((i) =>
          i.id === id
            ? { ...i, status: i.status === "bought" ? "pending" : "bought" }
            : i,
        ),
      })),
    [],
  );

  const addShopItem = useCallback(
    (item: Omit<ShopItem, "id" | "status">) =>
      setData((d) => ({
        ...d,
        shopping: [
          ...d.shopping,
          { ...item, id: `l-${Date.now()}`, status: "pending" },
        ],
      })),
    [],
  );

  const addStockToList = useCallback(
    (item: StockItem) =>
      setData((d) => {
        if (d.shopping.some((s) => s.name === item.name && s.status !== "removed"))
          return d;
        return {
          ...d,
          shopping: [
            ...d.shopping,
            {
              id: `l-${Date.now()}`,
              name: item.name,
              desired_quantity: Math.max(1, Math.round(item.normal - item.current)),
              unit: item.unit,
              estimated_price: item.priceLast,
              status: "pending",
            },
          ],
        };
      }),
    [],
  );

  const setBudget = useCallback(
    (total: number) => setData((d) => ({ ...d, budget: { ...d.budget, total } })),
    [],
  );

  const confirmReceipt = useCallback(
    (items: { name: string; qty: number; price: number }[]) =>
      setData((d) => {
        const spent = items.reduce((a, i) => a + i.qty * i.price, 0);
        return { ...d, budget: { ...d.budget, spent: d.budget.spent + spent } };
      }),
    [],
  );

  const savingsTotal = useMemo(
    () => data.savings.reduce((a, s) => a + s.saved, 0),
    [data.savings],
  );

  const value = useMemo<Store>(
    () => ({
      ...data,
      savingsTotal,
      dataLoading,
      toast,
      reloadData,
      zerarStock,
      deleteStock,
      stockToList,
      toggleBought,
      addShopItem,
      addStockToList,
      setBudget,
      confirmReceipt,
      showToast,
    }),
    [
      data,
      savingsTotal,
      dataLoading,
      toast,
      reloadData,
      zerarStock,
      deleteStock,
      stockToList,
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
