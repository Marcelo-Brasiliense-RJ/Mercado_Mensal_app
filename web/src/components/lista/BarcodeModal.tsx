"use client";

import { useCallback, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { BarcodeIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { unitFor, findByName } from "@/lib/defaults";
import { isTypedBarcode, onlyDigits, prettyBarcode } from "@/lib/barcode";
import { BarcodeScanner } from "./BarcodeScanner";

// Ler o codigo, dizer a quantidade, pronto: o item cai no carrinho.
//
// Por que existe: dentro do mercado, digitar o nome do produto e a parte cara da
// entrada (regra 1 da secao 0.1 do tarefas.md, nunca perguntar duas vezes). A
// embalagem ja diz qual e o produto. Da primeira vez que um codigo aparece, o app
// pergunta o nome UMA vez e guarda o vinculo; da segunda em diante so a quantidade.
//
// O leitor nao fecha depois de cada item: fecha o ciclo e volta a ler, porque no
// mercado se pega um produto atras do outro.

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field = "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

type Fase = "ler" | "confirmar";

export function BarcodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { findBarcode, addTripItemByBarcode, showToast, trip, stock } = useStore();

  const [fase, setFase] = useState<Fase>("ler");
  const [codigo, setCodigo] = useState("");
  const [conhecido, setConhecido] = useState(false);
  // Banco sem a 0035: o leitor segue servindo, so nao guarda o codigo.
  const [guardaCodigo, setGuardaCodigo] = useState(true);
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("un");
  const [preco, setPreco] = useState("");
  const [digitado, setDigitado] = useState("");
  const [semCamera, setSemCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  // O que ja entrou nesta sessao de leitura, so pra dar retorno visivel sem
  // precisar fechar o leitor e conferir o carrinho.
  const [lidos, setLidos] = useState<string[]>([]);

  const resolver = useCallback(
    async (code: string) => {
      setBusy(true);
      const info = await findBarcode(code);
      setBusy(false);
      setCodigo(code);
      setFase("confirmar");
      setQtd("1");
      setGuardaCodigo(info?.salvaVinculo !== false);
      if (info?.encontrado) {
        setConhecido(true);
        setNome(info.nome);
        setUnidade(info.unidade || unitFor(info.nome));
        setPreco(info.preco != null ? String(info.preco) : "");
      } else {
        // Codigo novo (ou consulta que falhou): nome em branco, o resto se deduz
        // sozinho quando a pessoa digitar.
        setConhecido(false);
        setNome("");
        setUnidade("un");
        setPreco("");
      }
    },
    [findBarcode],
  );

  // Nome digitado na primeira leitura: unidade pela palavra e preco da ultima
  // compra, se a casa ja tem esse item (regra 2, campo nasce preenchido).
  function onNome(v: string) {
    setNome(v);
    if (conhecido) return;
    const item = findByName(v, stock);
    setUnidade(item?.unit ?? unitFor(v));
    setPreco(item?.priceLast != null ? String(item.priceLast) : "");
  }

  function voltarALer() {
    setFase("ler");
    setCodigo("");
    setNome("");
    setPreco("");
    setQtd("1");
    setUnidade("un");
    setConhecido(false);
    setDigitado("");
  }

  function fechar() {
    onClose();
    voltarALer();
    setLidos([]);
    setSemCamera(false);
  }

  function buscarDigitado() {
    const code = onlyDigits(digitado);
    if (!isTypedBarcode(code)) return showToast("Código de barras inválido.");
    resolver(code);
  }

  async function pegar() {
    if (!nome.trim()) return showToast("Diga o nome do produto.");
    setBusy(true);
    const r = await addTripItemByBarcode({
      code: codigo,
      name: nome.trim(),
      // Sem preco digitado o banco cai no ultimo pago; se o item nunca foi
      // comprado, ele responde sem_preco e o toast pede o valor.
      price: preco.trim() === "" ? null : Number(preco.replace(",", ".")) || 0,
      qty: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setLidos((l) => [nome.trim(), ...l]);
    showToast(`${nome.trim()} no carrinho`);
    voltarALer();
  }

  const total = trip?.total ?? 0;

  return (
    <Modal open={open} onClose={fechar} maxWidth={440}>
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
            <BarcodeIcon size={18} />
            Leitor de código
          </div>
          <div className="text-[19px] font-extrabold">
            {fase === "ler" ? "Leia o código do produto" : "Quanto você pegou?"}
          </div>
        </div>
        {trip && (
          <div className="shrink-0 text-right">
            <div className="text-[18px] font-extrabold leading-none">{brl(total)}</div>
            <div className="mt-1 text-[12px] text-text-3">no carrinho</div>
          </div>
        )}
      </div>

      {fase === "ler" ? (
        <>
          {!semCamera && (
            <div className="mb-3.5">
              <BarcodeScanner onResult={resolver} onError={() => setSemCamera(true)} />
            </div>
          )}
          {semCamera && (
            <p className="mb-3.5 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug text-text-2">
              Não consegui abrir a câmera. Digite os números que ficam embaixo do
              código de barras.
            </p>
          )}

          <label className={labelCls}>Ou digite o código</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              buscarDigitado();
            }}
            className="mb-4 flex gap-2"
          >
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              inputMode="numeric"
              placeholder="7891234567890"
              aria-label="Código de barras"
              className={field}
            />
            <button
              type="submit"
              disabled={busy || !digitado.trim()}
              className="h-12 shrink-0 rounded-[13px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              Buscar
            </button>
          </form>

          {lidos.length > 0 && (
            <div className="mb-4 rounded-[13px] border border-border bg-card-2 p-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-3">
                Nesta leitura
              </div>
              <div className="text-[13px] leading-relaxed text-text-2">
                {lidos.join(" · ")}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={fechar}
            className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
          >
            {lidos.length > 0 ? "Concluir" : "Fechar"}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pegar();
          }}
        >
          <div className="mb-3.5 rounded-[13px] border border-border bg-card-2 p-3">
            <div className="text-[12px] font-bold uppercase tracking-wide text-text-3">
              Código
            </div>
            <div className="font-mono text-[15px] font-bold">{prettyBarcode(codigo)}</div>
            <div className="mt-1 text-[12px] leading-snug text-text-2">
              {!guardaCodigo
                ? "Diga o nome do produto e ele vai pro carrinho. Por enquanto este código não fica guardado, então na próxima vez pergunto de novo."
                : conhecido
                  ? "Produto reconhecido. Corrigir o nome aqui religa o código a outro item."
                  : "Primeira vez com esse código. Diga o nome uma vez e ele fica gravado."}
            </div>
          </div>

          <label className={labelCls}>Produto</label>
          <input
            value={nome}
            onChange={(e) => onNome(e.target.value)}
            placeholder="Ex.: Arroz"
            className={`${field} mb-3.5`}
            autoFocus={!conhecido}
          />

          <div className="mb-3.5 flex gap-2">
            <div className="min-w-0 flex-1">
              <label className={labelCls}>Quantidade</label>
              <QtyStepper
                value={qtd}
                onChange={setQtd}
                unit={unidade}
                autoFocus={conhecido}
              />
            </div>
            <div className="w-[84px] shrink-0">
              <label className={labelCls}>Unidade</label>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
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

          <label className={labelCls}>Preço (unidade)</label>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="R$ 0,00"
            className={`${field} mb-1.5`}
          />
          <p className="mb-5 text-[12px] text-text-3">
            Em branco, usamos o preço da última compra desse item.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={voltarALer}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
            >
              Ler outro
            </button>
            <button
              type="submit"
              disabled={busy || !nome.trim()}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {busy ? "Colocando…" : "Colocar no carrinho"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
