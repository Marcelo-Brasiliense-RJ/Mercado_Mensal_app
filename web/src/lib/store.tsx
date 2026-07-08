"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StockItem, ShopItem, SavingRow, MonthPoint, Trip } from "./types";
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
  trip: Trip | null; // compra em andamento (modo "No mercado"); null se nao houver
};

const EMPTY: Data = {
  stock: [],
  shopping: [],
  budget: { total: 0, spent: 0 },
  savings: [],
  months: [],
  trip: null,
};

type Store = Data & {
  savingsTotal: number;
  dataLoading: boolean;
  toast: string | null;
  reloadData: () => Promise<void>;
  zerarStock: (ids: string[]) => Promise<void>;
  deleteStock: (ids: string[]) => Promise<void>;
  stockToList: (ids: string[]) => Promise<void>;
  reloadTrip: () => Promise<void>;
  finalizeTrip: () => Promise<void>;
  removeTripItem: (id: string) => Promise<void>;
  addShopItem: (item: Omit<ShopItem, "id" | "status">) => Promise<void>;
  addStockToList: (item: StockItem) => Promise<void>;
  buyItems: (ids: string[]) => Promise<void>;
  removeItems: (ids: string[]) => Promise<void>;
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
      const [stockR, listR, ecoR, tripR] = await Promise.all([
        supabase.rpc("mercado_stock_web"),
        supabase.rpc("mercado_list_web"),
        supabase.rpc("mercado_economia_web"),
        supabase.rpc("mercado_trip_web"),
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
        trip: (tripR.data as Trip | null) ?? null,
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

  const reloadTrip = useCallback(async () => {
    const { data } = await createClient().rpc("mercado_trip_web");
    setData((d) => ({ ...d, trip: (data as Trip | null) ?? null }));
  }, []);

  const finalizeTrip = useCallback(async () => {
    await createClient().rpc("mercado_trip_finalize_web");
    await reloadData(); // recarrega estoque/lista/economia repostos + limpa o carrinho
  }, [reloadData]);

  const removeTripItem = useCallback(
    async (id: string) => {
      await createClient().rpc("mercado_trip_remove_item_web", { p_id: id });
      await reloadTrip();
    },
    [reloadTrip],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const addShopItem = useCallback(
    async (item: Omit<ShopItem, "id" | "status">) => {
      await createClient().rpc("mercado_list_add_web", {
        p_name: item.name,
        p_qty: item.desired_quantity,
        p_unit: item.unit,
        p_price: item.estimated_price,
      });
      await reloadData();
    },
    [reloadData],
  );

  const addStockToList = useCallback(
    async (item: StockItem) => {
      await createClient().rpc("mercado_list_add_web", {
        p_name: item.name,
        p_qty: Math.max(1, Math.round(item.normal - item.current)),
        p_unit: item.unit,
        p_price: item.priceLast,
      });
      await reloadData();
    },
    [reloadData],
  );

  const buyItems = useCallback(
    async (ids: string[]) => {
      await createClient().rpc("mercado_list_buy_web", { p_ids: ids });
      await reloadData();
    },
    [reloadData],
  );

  const removeItems = useCallback(
    async (ids: string[]) => {
      await createClient().rpc("mercado_list_remove_web", { p_ids: ids });
      await reloadData();
    },
    [reloadData],
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
      reloadTrip,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      addStockToList,
      buyItems,
      removeItems,
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
      reloadTrip,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      addStockToList,
      buyItems,
      removeItems,
      setBudget,
      confirmReceipt,
      showToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
