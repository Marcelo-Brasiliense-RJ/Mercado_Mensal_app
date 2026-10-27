"use client";

import { useState } from "react";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { corMercado, corredor, maisBarataPara, nomeMercado, type Oferta } from "@/lib/ofertas";
import { categoriaDe, ICONE } from "@/lib/categorias";
import { Grupo, useRecolhidos } from "@/components/ui/Grupo";
import type { StockItem } from "@/lib/types";
import { brl, stockRatio } from "@/lib/format";
import { stepFor } from "@/lib/defaults";
import { BarcodeIcon, CheckIcon, MicIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore, type RpcResult } from "@/lib/store";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { BarcodeModal } from "@/components/lista/BarcodeModal";
import { ItemDetailModal } from "./ItemDetailModal";
import { BatchAddModal } from "./BatchAddModal";

// Despensa em cards, dois por linha.
//
// O que havia antes era uma lista com barra de progresso, porcentagem, valor em
// reais e seta em cada linha: um relatorio. Quem chega do mercado com sacola na
// mao nao le relatorio, bate o olho. O que decide uma acao e o NOME, o QUANTO
// resta e a COR; o resto abre no toque.
//
// Dois toques morreram tambem: "usei um" e "repor" saem do card, sem passar pelo
// popup de detalhe.

type Estado = "acabou" | "pouco" | "tem";

function estadoDe(item: StockItem): Estado {
  if (item.current <= 0) return "acabou";
  // Sem nivel normal definido nao da para dizer que esta acabando: stockRatio
  // devolve 1 nesse caso, e o card so mostra o que tem.
  if (item.normal > 0 && stockRatio(item.current, item.normal) < 0.5) return "pouco";
  return "tem";
}

const ORDEM: Record<Estado, number> = { acabou: 0, pouco: 1, tem: 2 };

// 0.5 vira "0,5": ponto decimal em tela de app brasileiro parece erro de sistema.
function fmtQtd(n: number): string {
  return Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const CORES: Record<Estado, { faixa: string; selo: string; texto: string }> = {
  acabou: { faixa: "bg-neg", selo: "bg-neg-soft text-neg", texto: "Acabou" },
  pouco: { faixa: "bg-warn", selo: "bg-warn-soft text-warn", texto: "Pouco" },
  tem: { faixa: "bg-pos", selo: "bg-pos-soft text-pos", texto: "Tem" },
};

export function StockView() {
  // Selo de oferta nos cards que estao acabando (mesma busca da aba Ofertas, em cache).
  const ofertas = useListaOfertas();
  const {
    stock,
    zerarStock,
    baixaStock,
    deleteStock,
    stockToList,
    addStockToList,
    showToast,
  } = useStore();
  const [q, setQ] = useState("");
  // Guarda o id, nao o objeto: depois de salvar o nivel normal o modal precisa
  // mostrar o valor novo, e um StockItem congelado no state mostraria o antigo.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // O leitor tambem mora aqui: quem esta no mercado abre o Estoque para ver o que
  // falta e, de codigo na mao, nao deveria ter que trocar de aba para registrar.
  const [scanOpen, setScanOpen] = useState(false);
  const [stockAddOpen, setStockAddOpen] = useState(false);

  const filtered = stock
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ORDEM[estadoDe(a)] - ORDEM[estadoDe(b)] || a.name.localeCompare(b.name));
  const faltando = stock.filter((i) => estadoDe(i) !== "tem");
  // Por corredor do mercado (mesmas categorias dos encartes), cada um abre e fecha.
  const { aberto, alternar } = useRecolhidos("estoque_fechados");
  const grupos = Object.entries(
    filtered.reduce<Record<string, StockItem[]>>((g, i) => {
      (g[categoriaDe(i.name, ofertas)] ??= []).push(i);
      return g;
    }, {}),
  ).sort((a, b) => corredor(a[0]) - corredor(b[0]));
  const detail = stock.find((i) => i.id === detailId) ?? null;

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function exitSel() {
    setSelMode(false);
    setSelected(new Set());
  }
  function onItem(item: StockItem) {
    if (selMode) toggleSel(item.id);
    else setDetailId(item.id);
  }

  // Um toque, sem popup: tirar uma unidade do que tem em casa.
  async function usei(item: StockItem) {
    setAgindo(item.id);
    const passo = stepFor(item.unit);
    const r = await baixaStock(item.id, passo);
    setAgindo(null);
    // "Usei" e o toque mais facil de dar sem querer: o aviso ja traz o Desfazer.
    showToast(r.ok ? `${item.name}: usei ${fmtQtd(passo)} ${item.unit}` : r.erro, { desfazer: r.ok });
  }

  // Um toque, sem popup: mandar para a lista de compras.
  async function repor(item: StockItem) {
    setAgindo(item.id);
    const r = await addStockToList(item);
    setAgindo(null);
    showToast(r.ok ? `${item.name} na lista` : r.erro);
  }

  async function reporTudo() {
    if (!faltando.length) return;
    setBusy(true);
    const r = await stockToList(faltando.map((i) => i.id));
    setBusy(false);
    showToast(r.ok ? `${faltando.length} itens na lista de compras` : r.erro);
  }

  async function runBatch(
    fn: (ids: string[]) => Promise<RpcResult>,
    msg: (n: number) => string,
    confirmMsg?: string,
  ) {
    if (!selected.size) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    const n = selected.size;
    setBusy(true);
    const r = await fn([...selected]);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(msg(n));
    exitSel();
  }

  const search = (
    <div className="relative w-full lg:w-[280px]">
      <SearchIcon
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar item..."
        className="h-[44px] w-full rounded-[12px] border border-border bg-card pl-[42px] pr-4 text-[14px]"
      />
    </div>
  );

  const headerAction = (
    <div className="flex items-center gap-2">
      {search}
      <button
        onClick={() => setVoiceOpen(true)}
        className="hidden h-[44px] shrink-0 items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-[14px] font-bold lg:flex"
      >
        <MicIcon size={18} />
        Falar
      </button>
      <button
        onClick={() => setScanOpen(true)}
        className="hidden h-[44px] shrink-0 items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-[14px] font-bold lg:flex"
      >
        <BarcodeIcon size={18} />
        Código
      </button>
      <button
        onClick={() => setStockAddOpen(true)}
        aria-label="Adicionar item"
        className="hidden h-[44px] shrink-0 items-center gap-2 rounded-[12px] bg-brand px-[18px] text-[14px] font-bold text-brand-ink lg:flex"
      >
        <PlusIcon size={18} />
        Adicionar
      </button>
    </div>
  );

  return (
    <>
      <ScreenHeader title="Estoque" subtitle="Despensa" action={headerAction} />

      <div className="space-y-4 pb-[150px] lg:pb-10">
        {/* Primeira coisa da tela: o que falta, com a acao junto. Antes o topo
            trazia contagem de itens e valor em reais, que nao fazem ninguem agir. */}
        {faltando.length > 0 && (
          <div className="flex items-center gap-3 rounded-[18px] border-[1.5px] border-warn bg-warn-soft p-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[22px] font-extrabold leading-none text-warn">
                {faltando.length} {faltando.length === 1 ? "item" : "itens"}
              </div>
              <div className="mt-1 text-[13px] font-bold text-text-2">
                acabando ou já acabou
              </div>
            </div>
            <button
              onClick={reporTudo}
              disabled={busy}
              className="h-[46px] shrink-0 rounded-[13px] bg-warn px-4 text-[14px] font-bold text-white disabled:opacity-50"
            >
              Mandar pra lista
            </button>
          </div>
        )}

        {/* Busca so aparece quando ha despensa o bastante para procurar. */}
        {stock.length >= 8 && <div className="lg:hidden">{search}</div>}

        {stock.length === 0 && (
          <div className="pt-10 text-center">
            <div className="mb-1.5 text-[18px] font-extrabold">
              Sua despensa está vazia
            </div>
            <p className="mx-auto max-w-[320px] text-[14px] leading-relaxed text-text-2">
              Toque em <b>Falar</b> e diga o que tem em casa, ou em <b>Digitar</b>{" "}
              para escrever.
            </p>
          </div>
        )}

        {grupos.map(([cat, itens]) => {
          const acabando = itens.filter((i) => estadoDe(i) !== "tem").length;
          return (
            <Grupo
              key={cat}
              titulo={cat}
              icone={ICONE[cat] ?? "🛒"}
              info={`${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
              destaque={acabando ? `${acabando} acabando` : undefined}
              // Buscando, tudo aberto: o item procurado nao pode ficar escondido.
              aberto={!!q || aberto(cat)}
              onAlternar={() => alternar(cat)}
            >
              {/* Dois cards por linha no celular: cabe o dobro de despensa num olhar. */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
                {itens.map((i) => (
                  <Card
                    key={i.id}
                    item={i}
                    selMode={selMode}
                    selected={selected.has(i.id)}
                    ocupado={agindo === i.id}
                    onAbrir={() => onItem(i)}
                    onUsei={() => usei(i)}
                    onRepor={() => repor(i)}
                    oferta={estadoDe(i) !== "tem" ? maisBarataPara(ofertas, i.name) : null}
                  />
                ))}
              </div>
            </Grupo>
          );
        })}

        {stock.length > 0 && filtered.length === 0 && (
          <p className="pt-10 text-center text-text-3">Nenhum item encontrado.</p>
        )}

        {stock.length > 0 && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => (selMode ? exitSel() : setSelMode(true))}
              className="h-10 rounded-[10px] px-3.5 text-[13px] font-bold text-text-3"
            >
              {selMode ? "Cancelar seleção" : "Selecionar vários"}
            </button>
          </div>
        )}
      </div>

      {/* Barra de acoes em lote */}
      {selMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-40 mx-auto flex max-w-[640px] flex-wrap gap-2 px-4 lg:bottom-6 lg:max-w-[1120px] lg:px-9">
          <button
            onClick={() => runBatch(zerarStock, (n) => `${n} item(ns) zerado(s)`)}
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] bg-brand text-[14px] font-bold text-brand-ink shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Zerar ({selected.size})
          </button>
          <button
            onClick={() => runBatch(stockToList, (n) => `${n} item(ns) na lista de compras`)}
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] border border-brand bg-card text-[14px] font-bold text-brand shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            + Lista ({selected.size})
          </button>
          <button
            onClick={() =>
              runBatch(
                deleteStock,
                (n) => `${n} item(ns) excluído(s)`,
                `Excluir ${selected.size} item(ns) do estoque?`,
              )
            }
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] border border-neg bg-card text-[14px] font-bold text-neg shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Excluir ({selected.size})
          </button>
        </div>
      )}

      {/* Mesma barra da Lista: as formas de anotar a um toque, sempre no polegar.
          Os dois botoes flutuantes que havia aqui obrigavam a mirar em alvo de
          48px no canto, e o "+" abria um menu antes de deixar digitar. */}
      {!selMode && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card px-3 pb-2.5 pt-2 shadow-[0_-4px_16px_var(--shadow)] lg:hidden">
          <div className="flex gap-2">
            <button
              onClick={() => setVoiceOpen(true)}
              className="flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-brand text-[12px] font-bold text-brand-ink"
            >
              <MicIcon size={22} />
              Falar
            </button>
            {/* Ler codigo pelo Estoque veio da main; aqui ele entra na mesma
                barra, em vez de virar um terceiro botao flutuante no canto. */}
            <button
              onClick={() => setScanOpen(true)}
              className="flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] border border-border bg-card-2 text-[12px] font-bold"
            >
              <BarcodeIcon size={22} />
              Código
            </button>
            <button
              onClick={() => setStockAddOpen(true)}
              className="flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] border border-border bg-card-2 text-[12px] font-bold"
            >
              <PlusIcon size={22} />
              Digitar
            </button>
          </div>
        </div>
      )}

      <BatchAddModal open={stockAddOpen} onClose={() => setStockAddOpen(false)} />
      {/* Tudo que entra por aqui vai para o estoque (a chave no topo troca). */}
      <VoiceModal open={voiceOpen} onClose={() => setVoiceOpen(false)} tela="estoque" />
      <BarcodeModal open={scanOpen} onClose={() => setScanOpen(false)} destinoPadrao="estoque" />
      <ItemDetailModal item={detail} onClose={() => setDetailId(null)} />
    </>
  );
}

function Card({
  item,
  selMode,
  selected,
  ocupado,
  onAbrir,
  onUsei,
  onRepor,
  oferta,
}: {
  item: StockItem;
  selMode: boolean;
  selected: boolean;
  ocupado: boolean;
  onAbrir: () => void;
  onUsei: () => void;
  onRepor: () => void;
  oferta?: Oferta | null;
}) {
  const estado = estadoDe(item);
  const cor = CORES[estado];
  const acabou = estado === "acabou";

  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border bg-card shadow-[0_1px_3px_var(--shadow)] ${
        selected ? "border-brand ring-2 ring-brand" : "border-border"
      }`}
    >
      {/* Faixa de cor no topo: diz o estado antes de qualquer leitura. */}
      <div className={`h-1.5 w-full ${cor.faixa}`} />

      <button onClick={onAbrir} className="block w-full p-3 text-left">
        {selMode && (
          <span className="absolute right-2.5 top-3.5">
            <SelDot on={selected} />
          </span>
        )}
        <div className="mb-2 flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-[2px] text-[10px] font-extrabold uppercase ${cor.selo}`}>
            {cor.texto}
          </span>
        </div>
        {/* Nome em duas linhas no maximo: produto de mercado tem nome comprido e
            cortar no meio da palavra deixa indecifravel. */}
        <div className="line-clamp-2 text-[15px] font-extrabold leading-tight">
          {item.name}
        </div>
        <div className="mt-1.5 text-[24px] font-extrabold leading-none">
          {fmtQtd(item.current)}
          <span className="ml-1 text-[13px] font-bold text-text-3">{item.unit}</span>
        </div>
        {/* Acabando e em oferta: ja diz onde repor mais barato. */}
        {oferta && (
          <div
            className="mt-2 inline-flex max-w-full rounded-md px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ background: corMercado(oferta.mercado) }}
            title={`Em oferta no ${nomeMercado(oferta.mercado)}`}
          >
            <span className="truncate">
              🏷 {nomeMercado(oferta.mercado)} · {brl(oferta.preco_por)}
            </span>
          </div>
        )}
      </button>

      {!selMode && (
        <div className="flex border-t border-border">
          {/* Acabou nao tem o que dar baixa: o card inteiro vira "Repor". */}
          {!acabou && (
            <button
              onClick={onUsei}
              disabled={ocupado}
              className="h-11 flex-1 border-r border-border text-[13px] font-bold text-text-2 disabled:opacity-40"
            >
              Usei
            </button>
          )}
          <button
            onClick={onRepor}
            disabled={ocupado}
            className={`h-11 flex-1 text-[13px] font-bold text-brand disabled:opacity-40 ${
              acabou ? "bg-brand/5" : ""
            }`}
          >
            Repor
          </button>
        </div>
      )}
    </div>
  );
}

function SelDot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 ${
        on ? "border-brand bg-brand text-brand-ink" : "border-border bg-card text-transparent"
      }`}
    >
      <CheckIcon size={12} />
    </span>
  );
}
