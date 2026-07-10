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
  receiptOpen: boolean;
  reloadData: () => Promise<void>;
  zerarStock: (ids: string[]) => Promise<void>;
  baixaStock: (id: string, qty: number) => Promise<void>;
  addStock: (item: { name: string; qty: number; unit: string }) => Promise<void>;
  deleteStock: (ids: string[]) => Promise<void>;
  stockToList: (ids: string[]) => Promise<void>;
  reloadTrip: () => Promise<void>;
  finalizeTrip: () => Promise<void>;
  removeTripItem: (id: string) => Promise<void>;
  addShopItem: (item: Omit<ShopItem, "id" | "status">) => Promise<void>;
  updateShopItem: (
    id: string,
    patch: { qty?: number; unit?: string; price?: number | null },
  ) => Promise<void>;
  addStockToList: (item: StockItem) => Promise<void>;
  buyItems: (ids: string[]) => Promise<void>;
  removeItems: (ids: string[]) => Promise<void>;
  setBudget: (total: number) => void;
  openReceipt: () => void;
  closeReceipt: () => void;
  confirmReceipt: (
    items: { nome: string; marca?: string; qtd: number; preco: number; unidade: string }[],
    meta?: { chave: string; emitente?: string; total?: number },
  ) => Promise<{ ok: boolean; erro?: string; itens?: number }>;
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
  const [receiptOpen, setReceiptOpen] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openReceipt = useCallback(() => setReceiptOpen(true), []);
  const closeReceipt = useCallback(() => setReceiptOpen(false), []);

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

  const baixaStock = useCallback(
    async (id: string, qty: number) => {
      await createClient().rpc("mercado_stock_baixa_web", { p_id: id, p_qty: qty });
      await reloadData();
    },
    [reloadData],
  );

  const addStock = useCallback(
    async (item: { name: string; qty: number; unit: string }) => {
      await createClient().rpc("mercado_stock_add_web", {
        p_name: item.name,
        p_qty: item.qty,
        p_unit: item.unit,
      });
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

  const updateShopItem = useCallback(
    async (
      id: string,
      patch: { qty?: number; unit?: string; price?: number | null },
    ) => {
      await createClient().rpc("mercado_list_update_web", {
        p_id: id,
        p_qty: patch.qty ?? null,
        p_unit: patch.unit ?? null,
        p_price: patch.price ?? null,
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
    async (
      items: { nome: string; marca?: string; qtd: number; preco: number; unidade: string }[],
      meta?: { chave: string; emitente?: string; total?: number },
    ) => {
      // Com chave (nota lida por QR/SEFAZ) usa a sobrecarga com dedup (0015);
      // sem chave (OCR por foto) usa a versao simples (0014).
      const params = meta?.chave
        ? {
            p_items: items,
            p_chave: meta.chave,
            p_emitente: meta.emitente ?? null,
            p_total: meta.total ?? 0,
          }
        : { p_items: items };
      const { data } = await createClient().rpc("mercado_apply_receipt_web", params);
      const res = (data ?? { ok: true }) as { ok: boolean; erro?: string; itens?: number };
      if (res.ok) await reloadData(); // estoque/economia refletem a nota gravada
      return res;
    },
    [reloadData],
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
      receiptOpen,
      openReceipt,
      closeReceipt,
      reloadData,
      zerarStock,
      baixaStock,
      addStock,
      deleteStock,
      stockToList,
      reloadTrip,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      updateShopItem,
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
      receiptOpen,
      openReceipt,
      closeReceipt,
      reloadData,
      zerarStock,
      baixaStock,
      addStock,
      deleteStock,
      stockToList,
      reloadTrip,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      updateShopItem,
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
