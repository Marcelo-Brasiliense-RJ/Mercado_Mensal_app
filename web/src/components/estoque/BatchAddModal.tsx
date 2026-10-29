"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ItemGrid, type GridItem, type GridField } from "@/components/receipt/ItemGrid";
import { unitFor, findByName } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import { DestinoSwitch, type Destino } from "@/components/ui/Destino";
import { quantoPedir, TambemNaLista } from "@/components/ui/TambemNaLista";

// Cadastrar a despensa inteira numa tela so. Antes eram 8 passos e dois modais
// empilhados POR ITEM, com o modal fechando a cada um. A grade e a mesma da
// revisao da nota fiscal (ItemGrid), sem preco: adicionar ao estoque nao e
// registrar compra.
const vazia = (): GridItem => ({ nome: "", qtd: 1, preco: 0, unidade: "un" });

export function BatchAddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addStock, addShopItem, showToast, stock } = useStore();
  // Aberto do Estoque, vai para o estoque; a chave manda a mesma grade para a lista.
  const [destino, setDestino] = useState<Destino>("estoque");
  const paraLista = destino === "lista";
  const [items, setItems] = useState<GridItem[]>([vazia(), vazia(), vazia()]);
  const [saving, setSaving] = useState(false);
  const [tambem, setTambem] = useState(false);

  function patch(i: number, field: GridField, value: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? {
              ...it,
              ...(field === "nome"
                ? { nome: value, unidade: unitFor(value) }
                : { [field]: Number(value.replace(",", ".")) || 0 }),
            }
          : it,
      ),
    );
  }

  function remove(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [vazia()]));
  }

  // Mesmo aviso do modal de item unico: duplicado so aparecia depois de salvar.
  function avisoDe(nome: string) {
    const jaTem = findByName(nome, stock);
    if (!jaTem) return null;
    if (paraLista) return jaTem.current > 0 ? `Você já tem ${jaTem.current} ${jaTem.unit} em casa.` : null;
    return `Você já tem ${jaTem.current} ${jaTem.unit} em casa. Vamos somar.`;
  }

  function close() {
    onClose();
    setItems([vazia(), vazia(), vazia()]);
    setSaving(false);
    setDestino("estoque");
    setTambem(false);
  }

  const preenchidos = items.filter((i) => i.nome.trim());

  // ponytail: um addStock por linha, em serie. Cada um recarrega os dados, entao
  // 10 itens custam 10 idas. O upgrade e uma RPC de lote (tarefa C1, mercado_lote),
  // que ainda nao existe; ate la o laco resolve e mantem o erro por item visivel.
  async function confirmar() {
    if (!preenchidos.length) return;
    setSaving(true);
    for (const it of preenchidos) {
      const r = paraLista
        ? await addShopItem({
            name: it.nome.trim(),
            desired_quantity: Number(it.qtd) || 1,
            unit: it.unidade,
            estimated_price: findByName(it.nome, stock)?.priceLast ?? null,
          })
        : await addStock({
            name: it.nome.trim(),
            qty: Number(it.qtd) || 1,
            unit: it.unidade,
          });
      if (!r.ok) {
        setSaving(false);
        return showToast(r.erro);
      }
      if (!paraLista && tambem) {
        const q = Number(it.qtd) || 1;
        const pedir = quantoPedir(it.nome, q, stock);
        await addShopItem({ name: it.nome.trim(), desired_quantity: pedir.qtd, unit: it.unidade, estimated_price: pedir.preco });
      }
    }
    showToast(
      preenchidos.length === 1
        ? `${preenchidos[0].nome.trim()} ${paraLista ? "na lista" : tambem ? "no estoque e na lista" : "adicionado ao estoque"}`
        : `${preenchidos.length} itens ${paraLista ? "na lista" : tambem ? "no estoque e na lista" : "adicionados ao estoque"}`,
    );
    close();
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="mb-3 text-[20px] font-extrabold">
        {paraLista ? "Pôr na lista" : "Adicionar ao estoque"}
      </div>
      <DestinoSwitch valor={destino} opcoes={["estoque", "lista"]} onChange={setDestino} />
      <p className="mb-3.5 text-[14px] leading-relaxed text-text-2">
        Escreva um item por linha. A unidade vem do nome e as linhas em branco são
        ignoradas.
      </p>

      <ItemGrid
        items={items}
        onPatch={patch}
        onRemove={remove}
        onAddRow={() => setItems((prev) => [...prev, vazia()])}
        precos={false}
        avisoDe={avisoDe}
      />
      {!paraLista && <TambemNaLista valor={tambem} onChange={setTambem} />}

      <div data-rodape className="flex gap-3">
        <button
          type="button"
          onClick={close}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={saving || preenchidos.length === 0}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {saving
            ? "Salvando..."
            : `Adicionar${preenchidos.length ? ` (${preenchidos.length})` : ""}`}
        </button>
      </div>
    </Modal>
  );
}
