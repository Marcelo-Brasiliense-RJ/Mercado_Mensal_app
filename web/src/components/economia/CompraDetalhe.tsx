"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { dinheiroCampo } from "@/lib/dinheiro";
import { diaDaSemana, diaMes, estadoNota, rotuloOrigem, type CompraResumo } from "@/lib/compras";
import type { CompraMes } from "@/lib/economia";

// Uma compra aberta: a nota (subir, trocar, "nao tenho"), a data e o mercado, os itens
// (editar e tirar) e excluir tudo. Itens em linhas densas com busca: compra do mes tem
// 50 a 100 itens (regra de UX do CLAUDE.md).
export function CompraDetalhe({
  compra,
  onClose,
  onMudou,
}: {
  compra: CompraResumo;
  onClose: () => void;
  onMudou: () => Promise<void> | void;
}) {
  const { abrirNotaDaCompra, updateCompra, deleteCompra, showToast, reloadData } = useStore();
  const [itens, setItens] = useState<CompraMes[] | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [qtd, setQtd] = useState("");
  const [preco, setPreco] = useState("");
  const [editarCompra, setEditarCompra] = useState(false);
  const [data, setData] = useState(compra.data);
  const [mercado, setMercado] = useState(compra.mercado ?? "");
  const [busy, setBusy] = useState(false);

  const carregarItens = useCallback(async () => {
    const { data: d } = await createClient().rpc("mercado_compra_itens_web", { p_id: compra.id });
    setItens(((d as { itens?: CompraMes[] } | null)?.itens ?? []) as CompraMes[]);
  }, [compra.id]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (vivo) await carregarItens();
    })();
    return () => {
      vivo = false;
    };
  }, [carregarItens, compra.total]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [itens, busca]);

  const nota = estadoNota(compra);
  // "12,50" e "1.234,50" (virgula decimal) ou "12.50" (ponto decimal, sem virgula)
  const num = (s: string) => Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);

  async function rpc(nome: string, params: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { data: d, error } = await createClient().rpc(nome, params);
    setBusy(false);
    const r = d as { ok?: boolean; erro?: string } | null;
    if (error || !r?.ok) {
      showToast(r?.erro === "data_invalida" ? "Data inválida." : "Não deu para salvar. Tente de novo.");
      return false;
    }
    showToast(ok);
    await reloadData();
    await onMudou();
    return true;
  }

  async function salvarCompra() {
    const okk = await rpc(
      "mercado_compra_editar_web",
      { p_id: compra.id, p_data: data !== compra.data ? data : null, p_mercado: mercado },
      data !== compra.data ? `Compra movida para ${diaMes(data)}` : "Compra atualizada",
    );
    if (okk) {
      setEditarCompra(false);
      if (data.slice(0, 7) !== compra.data.slice(0, 7)) onClose(); // saiu deste mes
    }
  }

  async function excluirCompra() {
    if (!confirm(`Excluir a compra de ${diaMes(compra.data)} (${brl(compra.total)}, ${compra.itens} itens)? O gasto sai do mês e o estoque volta ao que era.`)) return;
    if (await rpc("mercado_compra_excluir_web", { p_id: compra.id }, "Compra excluída")) onClose();
  }

  async function salvarItem(i: CompraMes) {
    const q = num(qtd);
    const p = num(preco);
    if (!(q > 0) || !(p >= 0)) return showToast("Quantidade e preço precisam ser válidos.");
    setBusy(true);
    const r = await updateCompra(i.id, { qty: q, price: p });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditando(null);
    await carregarItens();
    await onMudou();
  }

  async function tirarItem(i: CompraMes) {
    if (!confirm(`Tirar ${i.name} (${brl(i.total)}) desta compra? O estoque também é ajustado.`)) return;
    setBusy(true);
    const r = await deleteCompra(i.id);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditando(null);
    await carregarItens();
    await onMudou();
  }

  return (
    <Modal open onClose={onClose} maxWidth={520}>
      {/* Cabecalho: quando, onde, quanto, e a nota */}
      <div className="mb-2 pr-12">
        <div className="text-[13px] font-bold text-text-2">
          {diaDaSemana(compra.data)}, {diaMes(compra.data)} · {compra.itens} {compra.itens === 1 ? "item" : "itens"}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[18px] font-extrabold">{rotuloOrigem(compra)}</span>
          <span className="shrink-0 text-[22px] font-extrabold tabular-nums">{brl(compra.total)}</span>
        </div>
      </div>

      <div
        className={`mb-2 rounded-[12px] px-3 py-2 text-[13px] leading-snug ${
          nota === "com_nota" ? "bg-pos-soft text-text" : nota === "pendente" ? "bg-warn-soft text-text" : "bg-card-2 text-text-2"
        }`}
      >
        {nota === "com_nota" && (
          <>✓ Nota anexada{compra.nota_total ? ` (nota de ${brl(Number(compra.nota_total))})` : ""}. Se subiu a nota errada, troque abaixo.</>
        )}
        {nota === "pendente" && <>🧾 Sem nota fiscal: a nota acerta itens e preços pelo que o caixa cobrou.</>}
        {nota === "sem_nota" && <>Marcada como sem nota.</>}
        {nota === "nenhum" && <>Lançamento sem nota. Se tiver o cupom, dá para subir.</>}
      </div>

      {/* Acoes da compra */}
      <button
        type="button"
        onClick={() => {
          abrirNotaDaCompra(compra);
          onClose();
        }}
        disabled={busy}
        className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--barra)] text-[15px] font-extrabold text-white disabled:opacity-50"
      >
        <span aria-hidden>🧾</span>
        {compra.tem_nota ? "Trocar a nota (refazer a compra)" : "Subir a nota desta compra"}
      </button>
      <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {nota === "pendente" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void rpc("mercado_compra_sem_nota_web", { p_id: compra.id, p_ok: true }, "Ok, sem nota")}
            className="h-9 shrink-0 rounded-full bg-card-2 px-3 text-[13px] font-bold"
          >
            Não tenho nota
          </button>
        )}
        {nota === "sem_nota" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void rpc("mercado_compra_sem_nota_web", { p_id: compra.id, p_ok: false }, "Voltou para as pendências")}
            className="h-9 shrink-0 rounded-full bg-card-2 px-3 text-[13px] font-bold"
          >
            Ainda vou subir a nota
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditarCompra((v) => !v)}
          className="h-9 shrink-0 rounded-full bg-card-2 px-3 text-[13px] font-bold"
        >
          Data/mercado
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void excluirCompra()}
          className="h-9 shrink-0 rounded-full bg-neg-soft px-3 text-[13px] font-bold text-neg"
        >
          Excluir
        </button>
      </div>

      {editarCompra && (
        <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-2 rounded-[14px] bg-card-2 p-3">
          <label htmlFor="compra-data" className="text-[13px] font-bold text-text-2">Data</label>
          <input
            id="compra-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-11 rounded-[11px] border border-border bg-card px-2.5 text-[15px]"
          />
          <label htmlFor="compra-mercado" className="text-[13px] font-bold text-text-2">Mercado</label>
          <input
            id="compra-mercado"
            value={mercado}
            onChange={(e) => setMercado(e.target.value)}
            placeholder="Ex.: Guanabara"
            maxLength={60}
            className="h-11 rounded-[11px] border border-border bg-card px-2.5 text-[15px]"
          />
          <div className="col-span-2 text-[12px] text-text-3">
            A data decide em que mês a compra conta no gasto.
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void salvarCompra()}
            className="col-span-2 h-11 rounded-full bg-brand text-[14px] font-bold text-brand-ink disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      )}

      {/* Itens: densos, com busca presa no topo */}
      <div className="sticky top-0 z-10 -mx-1 mb-1 bg-card px-1 pb-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold uppercase tracking-[0.05em] text-text-3">Itens</span>
          {itens && itens.length > 8 && (
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item"
              aria-label="Buscar item da compra"
              className="h-9 w-[55%] rounded-full border border-border bg-card-2 px-3 text-[14px]"
            />
          )}
        </div>
      </div>
      {itens === null ? (
        <p className="py-4 text-center text-[13px] text-text-3">Carregando…</p>
      ) : (
        <ul className="divide-y divide-border">
          {visiveis.map((i) => (
            <li key={i.id}>
              {editando === i.id ? (
                <div className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-full truncate text-[14px] font-bold">{i.name}</span>
                  <input
                    value={qtd}
                    onChange={(e) => setQtd(e.target.value)}
                    inputMode="decimal"
                    aria-label="Quantidade"
                    className="h-10 w-16 rounded-[10px] border border-border bg-card-2 px-2 text-[14px]"
                  />
                  <span className="text-[13px] text-text-2">{i.unit} ×</span>
                  <input
                    value={preco}
                    onChange={(e) => setPreco(e.target.value)}
                    inputMode="decimal"
                    aria-label="Preço"
                    className="h-10 w-24 rounded-[10px] border border-border bg-card-2 px-2 text-[14px]"
                  />
                  <button type="button" disabled={busy} onClick={() => void salvarItem(i)} className="h-10 rounded-full bg-brand px-3 text-[13px] font-bold text-brand-ink">
                    Salvar
                  </button>
                  <button type="button" disabled={busy} onClick={() => void tirarItem(i)} className="h-10 rounded-full px-2 text-[13px] font-bold text-neg">
                    Tirar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="h-10 px-1 text-[13px] text-text-3">
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditando(i.id);
                    setQtd(String(i.qty).replace(".", ","));
                    setPreco(dinheiroCampo(i.price));
                  }}
                  className="flex h-11 w-full items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">{i.name}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-text-3">
                    {String(+Number(i.qty).toFixed(3)).replace(".", ",")} {i.unit}
                  </span>
                  <span className="w-[76px] shrink-0 text-right text-[14px] font-bold tabular-nums">{brl(Number(i.total))}</span>
                </button>
              )}
            </li>
          ))}
          {visiveis.length === 0 && <li className="py-4 text-center text-[13px] text-text-3">Nada com esse nome.</li>}
        </ul>
      )}
    </Modal>
  );
}
