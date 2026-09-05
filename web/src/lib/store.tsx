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

// O que o banco sabe sobre um codigo de barras lido. `encontrado` false nao e erro:
// e a primeira vez que aquele codigo aparece nesta casa, e a tela pede o nome uma vez.
export type BarcodeInfo = {
  codigo: string;
  encontrado: boolean;
  nome: string;
  unidade: string;
  preco: number | null;
  estoque_atual: number;
  nivel_normal: number;
  // false quando a 0035 ainda nao foi aplicada no banco: o leitor continua
  // servindo (o item vai pro carrinho pelo caminho de sempre), so nao guarda o
  // vinculo codigo -> produto. Recurso pela metade e melhor do que tela travada.
  salvaVinculo: boolean;
};

// Uma compra ja registrada no mes, como a aba Economia lista para editar.
export type Compra = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  total: number;
  at: string;
};

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
  codigo_invalido: "Código de barras inválido.",
  codigo_desconhecido: "Código novo. Diga o nome do produto.",
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

// PostgREST devolve PGRST202 quando a funcao nao existe (migration nao aplicada).
// Nesse caso o app nao mostra erro: usa o caminho antigo, que sempre funcionou.
function rpcAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
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
  startTrip: () => Promise<RpcResult>;
  addTripItem: (item: {
    name: string;
    price: number | null;
    qty: number;
    unit: string;
  }) => Promise<RpcResult>;
  cancelTrip: () => Promise<RpcResult>;
  findBarcode: (code: string) => Promise<BarcodeInfo | null>;
  addTripItemByBarcode: (item: {
    code: string;
    name?: string;
    price: number | null;
    qty: number;
    unit?: string;
  }) => Promise<RpcResult>;
  updateTripItem: (
    id: string,
    patch: { qty?: number; price?: number },
  ) => Promise<RpcResult>;
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
  loadCompras: () => Promise<Compra[]>;
  updateCompra: (id: string, patch: { qty?: number; price?: number }) => Promise<RpcResult>;
  deleteCompra: (id: string) => Promise<RpcResult>;
  addCompra: (c: { name: string; qty: number; price: number; unit: string }) => Promise<RpcResult>;
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

  // Ate a 0026 o carrinho so podia ser aberto e alimentado pelo bot: o app lia,
  // finalizava e tirava item, mas nao tinha como comecar nem como pegar.
  const startTrip = useCallback(async () => {
    const r = await callRpc("mercado_trip_start_web");
    if (r.ok) await reloadTrip();
    return r;
  }, [reloadTrip]);

  const addTripItem = useCallback(
    async (item: { name: string; price: number | null; qty: number; unit: string }) => {
      const r = await callRpc("mercado_trip_add_web", {
        p_name: item.name,
        p_price: item.price,
        p_qty: item.qty,
        p_unit: item.unit,
      });
      if (r.ok) await reloadTrip();
      return r;
    },
    [reloadTrip],
  );

  // Item de carrinho nao mexe no estoque ate finalizar, entao editar aqui e barato:
  // basta recarregar o carrinho, sem tocar no resto dos dados.
  const updateTripItem = useCallback(
    async (id: string, patch: { qty?: number; price?: number }) => {
      const r = await callRpc("mercado_trip_update_item_web", {
        p_id: id,
        p_qty: patch.qty ?? null,
        p_price: patch.price ?? null,
      });
      if (r.ok) await reloadTrip();
      return r;
    },
    [reloadTrip],
  );

  const cancelTrip = useCallback(async () => {
    const r = await callRpc("mercado_trip_cancel_web");
    if (r.ok) await reloadTrip();
    return r;
  }, [reloadTrip]);

  // Leitura, nao escrita: interessa o conteudo da resposta, entao nao passa pelo
  // callRpc (que so devolve ok/erro). Codigo desconhecido volta com encontrado=false.
  const findBarcode = useCallback(async (code: string) => {
    const semVinculo: BarcodeInfo = {
      codigo: code,
      encontrado: false,
      nome: "",
      unidade: "un",
      preco: null,
      estoque_atual: 0,
      nivel_normal: 0,
      salvaVinculo: false,
    };
    try {
      const { data, error } = await createClient().rpc("mercado_barcode_find_web", {
        p_code: code,
      });
      if (rpcAusente(error)) return semVinculo;
      const r = data as
        | {
            ok?: boolean;
            encontrado?: boolean;
            codigo?: string;
            nome?: string;
            unidade?: string;
            preco?: number | null;
            estoque_atual?: number;
            nivel_normal?: number;
          }
        | null;
      if (!r?.ok) return null;
      return {
        codigo: r.codigo ?? code,
        encontrado: Boolean(r.encontrado),
        nome: r.nome ?? "",
        unidade: r.unidade ?? "un",
        preco: r.preco ?? null,
        estoque_atual: Number(r.estoque_atual ?? 0),
        nivel_normal: Number(r.nivel_normal ?? 0),
        salvaVinculo: true,
      } satisfies BarcodeInfo;
    } catch {
      return null;
    }
  }, []);

  // Uma chamada so: poe no carrinho e amarra o codigo ao item. O vinculo so e
  // gravado se o carrinho aceitar (ver 0035), entao aqui nao ha o que desfazer.
  const addTripItemByBarcode = useCallback(
    async (item: {
      code: string;
      name?: string;
      price: number | null;
      qty: number;
      unit?: string;
    }) => {
      const { data, error } = await createClient().rpc("mercado_barcode_add_web", {
        p_code: item.code,
        p_name: item.name ?? null,
        p_price: item.price,
        p_qty: item.qty,
        p_unit: item.unit ?? null,
      });
      // Banco sem a 0035: o item entra pelo caminho de sempre, so sem gravar o
      // vinculo do codigo. Quem esta no mercado nao pode ficar preso a isso.
      if (rpcAusente(error)) {
        const r = await callRpc("mercado_trip_add_web", {
          p_name: item.name ?? "",
          p_price: item.price,
          p_qty: item.qty,
          p_unit: item.unit ?? "un",
        });
        if (r.ok) await reloadTrip();
        return r;
      }
      if (error) return { ok: false as const, erro: "Não deu para salvar. Tente de novo." };
      const res = data as { ok?: boolean; erro?: string } | null;
      if (res && res.ok === false) {
        return {
          ok: false as const,
          erro: ERROS[res.erro ?? ""] ?? "Não deu para salvar. Tente de novo.",
        };
      }
      await reloadTrip();
      return { ok: true as const };
    },
    [reloadTrip],
  );

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

  // Compras ja registradas do mes. Editar mexe em duas coisas, o gasto e o estoque,
  // e quem cuida disso e a 0033; aqui so recarregamos tudo depois de cada escrita.
  const loadCompras = useCallback(async () => {
    const { data } = await createClient().rpc("mercado_compras_web");
    return (data as Compra[] | null) ?? [];
  }, []);

  const updateCompra = useCallback(
    async (id: string, patch: { qty?: number; price?: number }) => {
      const r = await callRpc("mercado_compra_update_web", {
        p_id: id,
        p_qty: patch.qty ?? null,
        p_price: patch.price ?? null,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const deleteCompra = useCallback(
    async (id: string) => {
      const r = await callRpc("mercado_compra_delete_web", { p_id: id });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
  );

  const addCompra = useCallback(
    async (c: { name: string; qty: number; price: number; unit: string }) => {
      const r = await callRpc("mercado_compra_add_web", {
        p_name: c.name,
        p_qty: c.qty,
        p_price: c.price,
        p_unit: c.unit,
      });
      if (r.ok) await reloadData();
      return r;
    },
    [reloadData],
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
      setPar,
      parSugerido,
      deleteStock,
      stockToList,
      reloadTrip,
      startTrip,
      addTripItem,
      cancelTrip,
      findBarcode,
      addTripItemByBarcode,
      updateTripItem,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      updateShopItem,
      addStockToList,
      buyItems,
      removeItems,
      setBudget,
      loadCompras,
      updateCompra,
      deleteCompra,
      addCompra,
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
      startTrip,
      addTripItem,
      cancelTrip,
      findBarcode,
      addTripItemByBarcode,
      updateTripItem,
      finalizeTrip,
      removeTripItem,
      addShopItem,
      updateShopItem,
      addStockToList,
      buyItems,
      removeItems,
      setBudget,
      loadCompras,
      updateCompra,
      deleteCompra,
      addCompra,
      confirmReceipt,
      showToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
