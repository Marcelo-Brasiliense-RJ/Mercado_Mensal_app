"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { DestinoSwitch } from "@/components/ui/Destino";
import { quantoPedir, TambemNaLista } from "@/components/ui/TambemNaLista";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { findByName, unitFor } from "@/lib/defaults";
import { reverFoto, tirarDaFila, useFilaFotos, type FotoFila } from "@/lib/filaFotos";

// O que volta da fila de fotos: um aviso no topo enquanto a IA trabalha e, com o
// leitor fechado, um popup por produto reconhecido: "e isso mesmo?" -> quantidade e
// valor -> pronto. Fica no AppShell, entao aparece em qualquer tela.
const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];

export function FilaFotos() {
  const { fila, leitorAberto } = useFilaFotos();
  const trabalhando = fila.filter((x) => x.estado === "preparando" || x.estado === "esperando" || x.estado === "reconhecendo").length;
  const prontos = fila.filter((x) => x.estado === "pronto" || x.estado === "falhou");
  // "Depois": fecha os popups ate a pessoa tocar no aviso (ou o app abrir de novo).
  const [depois, setDepois] = useState(false);
  const atual = !leitorAberto && !depois ? prontos[0] : undefined;
  const clicavel = !leitorAberto && depois && prontos.length > 0;

  return (
    <>
      {/* No leitor o proprio leitor mostra a fila; com popup aberto, o popup diz quantas faltam. */}
      {!leitorAberto && !atual && (trabalhando > 0 || prontos.length > 0) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+160px)] z-30 lg:bottom-8 flex justify-center px-4">
          <button
            type="button"
            disabled={!clicavel}
            onClick={() => setDepois(false)}
            className={`flex items-center gap-2 rounded-full bg-text px-4 py-2 text-[13px] font-bold text-bg shadow-lg ${clicavel ? "pointer-events-auto" : ""}`}
          >
            {trabalhando > 0 && <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
            {trabalhando > 0 ? `📷 Reconhecendo ${trabalhando} ${trabalhando > 1 ? "fotos" : "foto"}` : ""}
            {trabalhando > 0 && prontos.length > 0 ? " · " : ""}
            {prontos.length > 0 ? `✓ ${prontos.length} para conferir${clicavel ? " · tocar" : ""}` : ""}
          </button>
        </div>
      )}
      {/* key: cada foto abre o popup do zero */}
      {atual && <Conferir key={atual.id + atual.estado + (atual.nome ?? "")} x={atual} resta={prontos.length - 1} onDepois={() => setDepois(true)} />}
    </>
  );
}

function Conferir({ x, resta, onDepois }: { x: FotoFila; resta: number; onDepois: () => void }) {
  const { addTripItemByBarcode, addTripItem, addStockByBarcode, addStock, addShopItem, showToast, stock } = useStore();
  const falhou = x.estado === "falhou";
  const [passo, setPasso] = useState<"conferir" | "dados">("conferir");
  const [editando, setEditando] = useState(falhou);
  const [nome, setNome] = useState(x.nome ?? "");
  const [destino, setDestino] = useState(x.destino);
  const jaTem = findByName(nome, stock);
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState(x.unidade || jaTem?.unit || unitFor(x.nome ?? ""));
  const [preco, setPreco] = useState(jaTem?.priceLast != null ? String(jaTem.priceLast) : "");
  const [busy, setBusy] = useState(false);
  const emCasa = destino === "estoque";
  const paraLista = destino === "lista";
  const [tambem, setTambem] = useState(false);

  function seguir() {
    const n = nome.trim();
    if (!n) return showToast("Escreva o nome do produto.");
    const t = findByName(n, stock);
    if (t) {
      setUnidade((u) => (x.unidade ? u : t.unit));
      if (!preco && t.priceLast != null) setPreco(String(t.priceLast));
    }
    setPasso("dados");
  }

  async function salvar() {
    const n = nome.trim();
    const q = Number(qtd.replace(",", ".")) || 1;
    const price = preco.trim() === "" ? null : Number(preco.replace(",", ".")) || 0;
    setBusy(true);
    // Com codigo, grava o vinculo: da proxima vez o leitor ja sabe o nome.
    const r = paraLista
      ? await addShopItem({ name: n, desired_quantity: q, unit: unidade, estimated_price: price || null })
      : emCasa
      ? x.codigo
        ? await addStockByBarcode({ code: x.codigo, name: n, qty: q, unit: unidade })
        : await addStock({ name: n, qty: q, unit: unidade })
      : x.codigo
        ? await addTripItemByBarcode({ code: x.codigo, name: n, price, qty: q, unit: unidade })
        : await addTripItem({ name: n, price, qty: q, unit: unidade });
    if (r.ok && emCasa && tambem) {
      const pedir = quantoPedir(n, q, stock);
      await addShopItem({ name: n, desired_quantity: pedir.qtd, unit: unidade, estimated_price: pedir.preco });
    }
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`✓ ${n} ${paraLista ? "na lista" : emCasa ? (tambem ? "no estoque e na lista" : "no estoque") : "no carrinho"}`);
    tirarDaFila(x.id);
  }

  const totalItem = (Number(qtd.replace(",", ".")) || 0) * (Number(preco.replace(",", ".")) || 0);
  const field = "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[16px]";

  return (
    <Modal open onClose={onDepois} maxWidth={440}>
      <div className="mb-3 pr-12">
        <div className="text-[13px] font-bold text-brand">
          📷 Foto reconhecida{resta > 0 ? ` · mais ${resta} na fila` : ""}
        </div>
        <div className="text-[20px] font-extrabold">
          {passo === "dados"
            ? emCasa
              ? "Quanto tem?"
              : "Quanto pegou e quanto pagou?"
            : falhou
              ? x.motivo === "sem_ia"
                ? "A IA está desligada"
                : x.motivo === "ia_falhou"
                  ? "A IA não respondeu"
                  : "Não reconheci este"
              : "É isso mesmo?"}
        </div>
        {passo === "conferir" && falhou && (
          <div className="mt-0.5 text-[13px] text-text-2">
            {x.motivo === "sem_ia"
              ? "Falta a chave da IA no servidor. Escreva o nome por enquanto."
              : x.motivo === "ia_falhou"
                ? "Sem internet ou limite da IA. Escreva o nome ou peça pra tentar de novo."
                : "Escreva o nome que está na frente da embalagem."}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-[16px] border-[1.5px] border-brand bg-brand/5 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto tirada agora, local */}
        <img src={x.foto || x.img} alt="" className="h-[84px] w-[84px] shrink-0 rounded-xl bg-white object-cover" />
        <div className="min-w-0 flex-1">
          {editando ? (
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do produto"
              autoFocus
              enterKeyHint="next"
              onKeyDown={(e) => e.key === "Enter" && seguir()}
              className={field}
            />
          ) : (
            <>
              <div className="text-[12px] font-bold text-text-3">
                {x.fonte === "codigo" ? "📦 Lido pelo código na foto" : "🤖 A IA reconheceu"}
              </div>
              <div className="text-[18px] font-extrabold leading-tight">{nome}</div>
              {x.marca && <div className="text-[12px] text-text-3">{x.marca}</div>}
            </>
          )}
        </div>
      </div>

      {passo === "conferir" ? (
        <div data-rodape className="flex flex-col gap-2">
          {editando ? (
            <button onClick={seguir} className="h-[54px] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
              Seguir
            </button>
          ) : (
            <button onClick={seguir} className="h-[54px] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
              ✓ Sim, é isso
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {!editando && (
              <button onClick={() => setEditando(true)} className="h-12 rounded-[14px] border-2 border-border bg-card text-[14px] font-bold">
                ✏️ Corrigir nome
              </button>
            )}
            <button
              onClick={() => {
                reverFoto(x.id);
                showToast("🔄 Mandei a IA olhar de novo");
              }}
              className={`h-12 rounded-[14px] border-2 border-border bg-card text-[14px] font-bold ${editando ? "col-span-2" : ""}`}
            >
              🔄 {x.motivo ? "Tentar de novo" : "Pedir pra rever"}
            </button>
          </div>
          <button
            onClick={() => {
              tirarDaFila(x.id);
              showToast("Foto descartada");
            }}
            className="h-10 text-[13px] font-bold text-text-3 underline"
          >
            Descartar esta foto
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <DestinoSwitch valor={destino} opcoes={["estoque", "lista", "carrinho"]} onChange={(d) => setDestino(d as typeof destino)} />
          <label className="mb-1.5 block text-xs font-bold text-text-2">Quantidade</label>
          <div className="mb-4 flex gap-2">
            <div className="min-w-0 flex-1">
              <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
            </div>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              aria-label="Unidade"
              className="h-12 w-[78px] shrink-0 rounded-[13px] border border-border bg-card-2 px-2 text-[15px]"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {emCasa && <TambemNaLista valor={tambem} onChange={setTambem} />}
          {!emCasa && (
            <>
              <label className="mb-1.5 block text-xs font-bold text-text-2">
                {paraLista ? "Preço (se souber)" : "Quanto pagou?"} (por {unidade})
              </label>
              <div className="relative mb-4">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-text-3">R$</span>
                <input
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Preço"
                  autoFocus
                  className="h-[58px] w-full rounded-[14px] border border-border bg-card-2 pl-[52px] pr-4 text-[22px] font-bold"
                />
              </div>
            </>
          )}
          <div data-rodape className="flex gap-3">
            <button type="button" onClick={() => setPasso("conferir")} className="h-[56px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Voltar
            </button>
            <button type="submit" disabled={busy} className="h-[56px] flex-[2] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50">
              {busy
                ? "Salvando…"
                : emCasa
                  ? tambem
                    ? "+ Guardar e pôr na lista"
                    : "+ Guardar no estoque"
                  : paraLista
                    ? "📝 Pôr na lista"
                    : totalItem > 0
                      ? `Colocar · ${brl(totalItem)}`
                      : "Colocar no carrinho"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
