"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { unitFor, findByName } from "@/lib/defaults";

// Primeiro nome do usuario logado (user_metadata.name/full_name ou prefixo do
// email), so pra personalizar o cabecalho do popup.
function useUserName() {
  const [nome, setNome] = useState("");
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const u = data.user;
        const meta = (u?.user_metadata ?? {}) as { name?: string; full_name?: string };
        const raw = meta.name || meta.full_name || u?.email?.split("@")[0] || "";
        setNome(raw.split(" ")[0]);
      });
  }, []);
  return nome;
}

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

export function AddItemModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addShopItem, showToast, stock } = useStore();
  const userName = useUserName();
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("un");
  const [preco, setPreco] = useState("");
  // Enquanto o usuario nao editar, unidade e preco acompanham o nome digitado.
  const [unidadeManual, setUnidadeManual] = useState(false);
  const [precoManual, setPrecoManual] = useState(false);

  const conhecido = findByName(nome, stock);

  // Ao digitar o nome, sugere unidade pela palavra-chave e preco pelo ultimo
  // pago naquele item. O usuario corrige; nao precisa preencher do zero.
  function onNome(v: string) {
    setNome(v);
    const item = findByName(v, stock);
    if (!unidadeManual) setUnidade(item?.unit ?? unitFor(v));
    if (!precoManual) setPreco(item?.priceLast != null ? String(item.priceLast) : "");
  }

  function close() {
    onClose();
    setNome("");
    setQtd("1");
    setUnidade("un");
    setPreco("");
    setUnidadeManual(false);
    setPrecoManual(false);
  }

  async function submit() {
    if (!nome.trim()) return;
    const r = await addShopItem({
      name: nome.trim(),
      desired_quantity: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
      estimated_price: preco ? Number(preco.replace(",", ".")) : null,
    });
    if (!r.ok) return showToast(r.erro);
    showToast(`${nome.trim()} adicionado à lista`);
    close();
  }

  const valid = nome.trim().length > 0;

  return (
    <Modal open={open} onClose={close} maxWidth={420}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="mb-[18px]">
        {userName && (
          <div className="text-[13px] font-bold text-brand">{userName}</div>
        )}
        <div className="text-[19px] font-extrabold">Adicionar item</div>
      </div>

      <label className={labelCls}>Nome</label>
      <input
        value={nome}
        onChange={(e) => onNome(e.target.value)}
        placeholder="Ex.: Arroz"
        className={`${field} ${conhecido ? "mb-1.5" : "mb-3.5"}`}
        autoFocus
      />
      {conhecido && (
        <p className="mb-3.5 text-[12px] text-text-2">
          {conhecido.current > 0
            ? `Você já tem ${conhecido.current} ${conhecido.unit} em casa.`
            : "Item já cadastrado, está zerado no estoque."}
          {conhecido.priceLast != null && " Preço preenchido com o da última compra."}
        </p>
      )}

      <div className="mb-3.5 flex gap-2">
        <div className="min-w-0 flex-1">
          <label className={labelCls}>Quantidade</label>
          <QtyStepper value={qtd} onChange={setQtd} unit={unidade} placeholder="1" />
        </div>
        <div className="w-[84px] shrink-0">
          <label className={labelCls}>Unidade</label>
          <select
            value={unidade}
            onChange={(e) => {
              setUnidade(e.target.value);
              setUnidadeManual(true);
            }}
            className={`${field} px-2.5`}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className={labelCls}>Preço estimado (unidade)</label>
      <input
        value={preco}
        onChange={(e) => {
          setPreco(e.target.value);
          setPrecoManual(true);
        }}
        inputMode="decimal"
        placeholder="R$ 0,00"
        className={`${field} mb-5`}
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={close}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
      </form>
    </Modal>
  );
}
