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

// Resultado de uma escrita. `erro` ja vem em portugues, pronto pro toast: quem
// chama nao precisa conhecer os slugs do banco.
export type RpcResult = { ok: true } | { ok: false; erro: string };

// Sugestao de nivel normal vinda do historico de compras (0025). `null` quando
// o banco nao tem base pra sugerir: dado insuficiente nao vira chute.
export type ParSugestao = { sugerido: number; base_compras: number };

// Slugs devolvidos pelas RPCs (grep "'erro'," em supabase/migrations).
const ERROS: Record<string, string> = {
  sem_familia: "Sua sessão expirou. Entre de novo.",
  nao_encontrado: "Item não encontrado. Atualize a tela.",
  produto_nao_encontrado: "Item não encontrado. Atualize a tela.",
  sem_nome: "Informe o nome do item.",
  valor_invalido: "Valor inválido.",
  ja_importada: "Essa nota já foi importada.",
  sem_compra_aberta: "Não há compra aberta.",
  sem_preco: "Informe o preço do item.",
};

// Uma escrita tem duas formas de falhar, e ate agora nenhuma das duas era lida:
// o `error` do supabase-js (rede, sessao, permissao) e o {ok:false,erro} que a
// propria RPC devolve. Este helper cobre as duas e sempre entrega texto exibivel.
async function callRpc(
  name: string,
  params?: Record<string, unknown>,
): Promise<RpcResult> {
  try {
    const { data, error } = await createClient().rpc(name, params);
    if (error) return { ok: false, erro: "Não deu para salvar. Tente de novo." };
    const res = data as { ok?: boolean; erro?: string } | null;
    if (res && res.ok === false) {
      return { ok: false, erro: ERROS[res.erro ?? ""] ?? "Não deu para salvar. Tente de novo." };
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

type Store = Data & {
  savingsTotal: number;
  dataLoading: boolean;
  toast: string | null;
  receiptOpen: boolean;
  reloadData: () => Promise<void>;
  zerarStock: (ids: string[]) => Promise<RpcResult>;
  baixaStock: (id: string, qty: number) => Promise<RpcResult>;
  addStock: (item: { name: string; qty: number; unit: string }) => Promise<RpcResult>;
  setPar: (id: string, par: number) => Promise<RpcResult>;
  parSugerido: (id: string) => Promise<ParSugestao | null>;
  deleteStock: (ids: string[]) => Promise<RpcResult>;
  stockToList: (ids: string[]) => Promise<RpcResult>;
  reloadTrip: () => Promise<void>;
  finalizeTrip: () => Promise<RpcResult>;
  removeTripItem: (id: string) => Promise<RpcResult>;
  addShopItem: (item: Omit<ShopItem, "id" | "status">) => Promise<RpcResult>;
  updateShopItem: (
    id: string,
    patch: { qty?: number; unit?: string; price?: number | null },
  ) => Promise<RpcResult>;
  addStockToList: (item: StockItem) => Promise<RpcResult>;
  buyItems: (ids: string[]) => Promise<RpcResult>;
  removeItems: (ids: string[]) => Promise<RpcResult>;
  setBudget: (total: number) => Promise<RpcResult>;
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
      const r = await callRpc("mercado_stock_zerar_web", { p_ids: ids });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const baixaStock = useCallback(
    async (id: string, qty: number) => {
      const r = await callRpc("mercado_stock_baixa_web", { p_id: id, p_qty: qty });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const addStock = useCallback(
    async (item: { name: string; qty: number; unit: string }) => {
      const r = await callRpc("mercado_stock_add_web", {
        p_name: item.name,
        p_qty: item.qty,
        p_unit: item.unit,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const setPar = useCallback(
    async (id: string, par: number) => {
      const r = await callRpc("mercado_stock_set_par_web", { p_id: id, p_par: par });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  // Leitura, nao escrita: o callRpc so devolve ok/erro e aqui o que importa e o
  // numero. Sem sugestao (menos de 2 compras na janela) devolve null, e a tela
  // simplesmente nao oferece nada.
  const parSugerido = useCallback(async (id: string) => {
    const { data } = await createClient().rpc("mercado_stock_par_sugerido_web", {
      p_id: id,
    });
    const r = data as { ok?: boolean; sugerido?: number | null; base_compras?: number } | null;
    if (!r?.ok || r.sugerido == null) return null;
    return { sugerido: Number(r.sugerido), base_compras: Number(r.base_compras ?? 0) };
  }, []);

  const deleteStock = useCallback(
    async (ids: string[]) => {
      const r = await callRpc("mercado_stock_delete_web", { p_ids: ids });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const stockToList = useCallback(
    async (ids: string[]) => {
      const r = await callRpc("mercado_stock_to_list_web", { p_ids: ids });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const reloadTrip = useCallback(async () => {
    const { data } = await createClient().rpc("mercado_trip_web");
    setData((d) => ({ ...d, trip: (data as Trip | null) ?? null }));
  }, []);

  const finalizeTrip = useCallback(async () => {
    const r = await callRpc("mercado_trip_finalize_web");
    // recarrega estoque/lista/economia repostos + limpa o carrinho
    if (r.ok) await reloadData();
    return r;
  }, [reloadData]);

  const removeTripItem = useCallback(
    async (id: string) => {
      const r = await callRpc("mercado_trip_remove_item_web", { p_id: id });
      if (r.ok) await reloadTrip();
      return r;
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
      const r = await callRpc("mercado_list_add_web", {
        p_name: item.name,
        p_qty: item.desired_quantity,
        p_unit: item.unit,
        p_price: item.estimated_price,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const updateShopItem = useCallback(
    async (
      id: string,
      patch: { qty?: number; unit?: string; price?: number | null },
    ) => {
      const r = await callRpc("mercado_list_update_web", {
        p_id: id,
        p_qty: patch.qty ?? null,
        p_unit: patch.unit ?? null,
        p_price: patch.price ?? null,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const addStockToList = useCallback(
    async (item: StockItem) => {
      const r = await callRpc("mercado_list_add_web", {
        p_name: item.name,
        p_qty: Math.max(1, Math.round(item.normal - item.current)),
        p_unit: item.unit,
        p_price: item.priceLast,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const buyItems = useCallback(
    async (ids: string[]) => {
      const r = await callRpc("mercado_list_buy_web", { p_ids: ids });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const removeItems = useCallback(
    async (ids: string[]) => {
      const r = await callRpc("mercado_list_remove_web", { p_ids: ids });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  // Ate a 0021 isto so mexia no estado em memoria: o orcamento sumia no reload.
  const setBudget = useCallback(async (total: number) => {
    const r = await callRpc("mercado_budget_set_web", { p_total: total });
    if (r.ok) setData((d) => ({ ...d, budget: { ...d.budget, total } }));
    return r;
  }, []);

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
      setPar,
      parSugerido,
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
      setPar,
      parSugerido,
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
