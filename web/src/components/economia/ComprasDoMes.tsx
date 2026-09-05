"use client";

import { useCallback, useEffect, useState } from "react";
import { brl } from "@/lib/format";
import { unitFor } from "@/lib/defaults";
import { useStore, type Compra } from "@/lib/store";

// Compras ja registradas no mes, editaveis. Ate aqui nao havia como corrigir uma
// compra passada em lugar nenhum: duas bandejas de carne entraram com o preco por
// quilo em vez do valor da bandeja e o gasto do mes pulou de 191 para 477.
// Editar mexe no gasto E no estoque, e quem cuida disso e a 0033.
const campo =
  "h-11 min-w-0 rounded-[11px] border border-border bg-card-2 px-2.5 text-[14px]";

export function ComprasDoMes() {
  const { loadCompras, updateCompra, deleteCompra, addCompra, showToast } = useStore();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [qtd, setQtd] = useState("");
  const [preco, setPreco] = useState("");
  const [novo, setNovo] = useState(false);
  const [nNome, setNNome] = useState("");
  const [nQtd, setNQtd] = useState("1");
  const [nPreco, setNPreco] = useState("");
  const [busy, setBusy] = useState(false);

  const recarregar = useCallback(async () => {
    setCompras(await loadCompras());
  }, [loadCompras]);

  // setState no .then, nao no corpo do effect: chamada sincrona dispara a regra
  // react-hooks/set-state-in-effect e causa render em cascata.
  useEffect(() => {
    let vivo = true;
    loadCompras().then((cs) => {
      if (vivo) setCompras(cs);
    });
    return () => {
      vivo = false;
    };
  }, [loadCompras]);

  const num = (s: string) => Number(s.replace(",", "."));

  function abrirEdicao(c: Compra) {
    setEditando(c.id);
    setQtd(String(c.qty));
    setPreco(String(c.price));
  }

  async function salvar(c: Compra) {
    const q = num(qtd);
    const p = num(preco);
    if (!(q > 0) || !(p >= 0)) return showToast("Quantidade e preço precisam ser válidos.");
    setBusy(true);
    const r = await updateCompra(c.id, { qty: q, price: p });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditando(null);
    await recarregar();
    showToast(`${c.name} atualizado`);
  }

  async function excluir(c: Compra) {
    if (!confirm(`Excluir ${c.name} de ${brl(c.total)}? O estoque também é ajustado.`)) return;
    setBusy(true);
    const r = await deleteCompra(c.id);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    await recarregar();
    showToast(`${c.name} removido do mês`);
  }

  async function incluir() {
    const q = num(nQtd);
    const p = num(nPreco);
    if (!nNome.trim() || !(q > 0) || !(p >= 0))
      return showToast("Preencha nome, quantidade e preço.");
    setBusy(true);
    const r = await addCompra({
      name: nNome.trim(),
      qty: q,
      price: p,
      unit: unitFor(nNome),
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setNovo(false);
    setNNome("");
    setNQtd("1");
    setNPreco("");
    await recarregar();
    showToast("Compra incluída");
  }

  return (
    <div className="rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)] lg:p-[22px]">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="min-w-0 text-xs font-bold uppercase tracking-wide text-text-3">
          Compras do mês
          {compras.length > 0 && (
            // Quantas e quanto, na frente: e a pergunta que se faz olhando aqui.
            <span className="ml-2 font-extrabold normal-case tracking-normal text-text">
              {compras.length} {compras.length === 1 ? "compra" : "compras"} ·{" "}
              {brl(compras.reduce((a, c) => a + c.total, 0))}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setNovo((v) => !v)}
          className="h-11 text-[13px] font-bold text-brand"
        >
          {novo ? "Cancelar" : "+ Incluir"}
        </button>
      </div>
      <p className="mb-3 text-[12px] leading-snug text-text-3">
        Corrigir aqui ajusta o gasto do mês e o estoque junto.
      </p>

      {novo && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            incluir();
          }}
          className="mb-3 flex flex-wrap gap-2 rounded-[14px] bg-card-2 p-3"
        >
          <input
            value={nNome}
            onChange={(e) => setNNome(e.target.value)}
            placeholder="O que você comprou?"
            aria-label="Item"
            className={`${campo} w-full flex-1 bg-card`}
            autoFocus
          />
          <input
            value={nQtd}
            onChange={(e) => setNQtd(e.target.value)}
            inputMode="decimal"
            aria-label="Quantidade"
            className={`${campo} w-16 bg-card text-center`}
          />
          <input
            value={nPreco}
            onChange={(e) => setNPreco(e.target.value)}
            inputMode="decimal"
            placeholder="preço"
            aria-label="Preço por unidade"
            className={`${campo} w-24 bg-card text-right`}
          />
          <button
            type="submit"
            disabled={busy}
            className="h-11 shrink-0 rounded-[11px] bg-brand px-4 text-[14px] font-bold text-brand-ink disabled:opacity-50"
          >
            Incluir
          </button>
        </form>
      )}

      {compras.length === 0 ? (
        <p className="text-[14px] text-text-2">
          Nenhuma compra registrada neste mês ainda.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {compras.map((c) => (
            <div key={c.id} className="py-2.5">
              {editando === c.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">
                    {c.name}
                  </span>
                  <input
                    value={qtd}
                    onChange={(e) => setQtd(e.target.value)}
                    inputMode="decimal"
                    aria-label="Quantidade"
                    className={`${campo} w-16 text-center`}
                  />
                  <span className="text-[12px] text-text-3">{c.unit} ×</span>
                  <input
                    value={preco}
                    onChange={(e) => setPreco(e.target.value)}
                    inputMode="decimal"
                    aria-label="Preço por unidade"
                    className={`${campo} w-24 text-right`}
                  />
                  <button
                    type="button"
                    onClick={() => salvar(c)}
                    disabled={busy}
                    className="h-11 shrink-0 rounded-[11px] bg-brand px-3.5 text-[14px] font-bold text-brand-ink disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="h-11 shrink-0 px-2 text-[13px] font-bold text-text-2"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{c.name}</div>
                    <div className="text-[12px] text-text-3">
                      {c.qty} {c.unit} × {brl(c.price)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[15px] font-extrabold">
                    {brl(c.total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(c)}
                    className="h-11 shrink-0 px-2 text-[13px] font-bold text-brand"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(c)}
                    disabled={busy}
                    aria-label={`Excluir ${c.name}`}
                    className="grid h-11 w-9 shrink-0 place-items-center rounded-[11px] text-[18px] text-text-3 hover:bg-card-2 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}