"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { brl, pct, stockRatio } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { StockItem } from "@/lib/types";

// Quantidade em pt-BR sem casa decimal inutil: 1,5 kg e 2 un, nunca "1.5" nem "2,0".
const num = (n: number) => String(+n.toFixed(2)).replace(".", ",");

export function ItemDetailModal({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const {
    addStockToList,
    addStock,
    zerarStock,
    baixaStock,
    setPar,
    parSugerido,
    showToast,
  } = useStore();
  const [parcial, setParcial] = useState(false);
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const [editPar, setEditPar] = useState(false);
  const [parTxt, setParTxt] = useState("");
  // Guarda o id junto: o modal e reaproveitado entre itens e a sugestao de um
  // nao pode aparecer no outro enquanto a nova nao chega.
  const [sug, setSug] = useState<{ id: string; valor: number } | null>(null);

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) return;
    let vivo = true;
    parSugerido(itemId).then((s) => {
      if (vivo && s) setSug({ id: itemId, valor: s.sugerido });
    });
    return () => {
      vivo = false;
    };
  }, [itemId, parSugerido]);

  function fechar() {
    setParcial(false);
    setQtd("");
    setEditPar(false);
    setParTxt("");
    onClose();
  }
  if (!item) return null;

  // par_level 0 significa "ninguem definiu", nao "acabou": stockRatio devolve 1
  // nesse caso, entao mostrar a barra pintaria 100% para um dado que nao existe.
  const semReferencia = item.normal <= 0;
  const ratio = stockRatio(item.current, item.normal);
  const repor = !semReferencia && ratio < 0.5;
  const sugestao = sug && sug.id === item.id ? sug.valor : null;
  const mostrarSugestao = sugestao !== null && sugestao !== item.normal;
  const parDigitado = parTxt.trim() === "" ? NaN : Number(parTxt.replace(",", "."));
  const barColor = repor ? "var(--warn)" : "var(--pos)";
  const trendUp = item.trend > 0;
  const trendLabel = `${trendUp ? "+" : ""}${Math.round(item.trend * 100)}%`;

  // ponytail: historico sintetico ate existir log real de eventos.
  const history = [
    { date: "hoje", text: `Em casa: ${item.current} ${item.unit}` },
    { date: "compra", text: "Último preço pago", price: brl(item.priceLast ?? 0) },
    { date: "média", text: "Preço médio (3 meses)", price: brl(item.priceAvg ?? 0) },
  ];

  async function add() {
    const r = await addStockToList(item!);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} adicionado à lista`);
    fechar();
  }

  // Quanto a pessoa costuma ter em casa. O aviso de "Repor" dispara na metade
  // disto (stockRatio < 0.5), por isso a mensagem fala da metade, e nao do valor.
  async function salvarPar(valor: number) {
    setBusy(true);
    const r = await setPar(item!.id, valor);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setEditPar(false);
    showToast(
      valor > 0
        ? `Avisamos quando ${item!.name} cair abaixo de ${num(valor / 2)} ${item!.unit}`
        : `Aviso de ${item!.name} desligado`,
    );
  }

  async function baixaTotal() {
    setBusy(true);
    const r = await zerarStock([item!.id]);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: acabou`);
    fechar();
  }

  // Atalho do caso mais comum: gastou parte e nao quer digitar. Arredonda em
  // 3 casas pra nao gerar dizima em unidade fracionada (kg, L).
  async function usouMetade() {
    const n = +(item!.current / 2).toFixed(3);
    if (n <= 0) return;
    setBusy(true);
    const r = await baixaStock(item!.id, n);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: baixa de ${n} ${item!.unit}`);
    fechar();
  }

  async function baixaParcial() {
    const n = Number(qtd.replace(",", "."));
    if (!n || n <= 0) return;
    setBusy(true);
    const r = await baixaStock(item!.id, n);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: baixa de ${n} ${item!.unit}`);
    fechar();
  }

  // Repor: volta o item ao nivel normal (soma no estoque, sem virar compra).
  // Serve pra desfazer baixa acidental sem re-cadastrar o item.
  async function repor_() {
    const falta = Math.max(1, +(item!.normal - item!.current).toFixed(3));
    setBusy(true);
    const r = await addStock({ name: item!.name, qty: falta, unit: item!.unit });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} reposto no estoque`);
    fechar();
  }

  return (
    <Modal open={!!item} onClose={fechar}>
      <div className="mb-5 flex items-center gap-3.5">
        <AvatarInitial name={item.name} size={52} />
        <div className="flex-1">
          <div className="text-[20px] font-extrabold">{item.name}</div>
          <div className="text-[13px] text-text-2">{item.category}</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-[5px] text-xs font-bold ${
            repor ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos"
          }`}
        >
          {repor ? "Repor" : "Em casa"}
        </span>
      </div>

      <div className="mb-3.5 rounded-[16px] bg-card-2 p-4">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-text-3">
            Nível em casa
          </span>
          {!semReferencia && (
            <span className="text-[13px] font-bold text-text-2">{pct(ratio * 100)}</span>
          )}
        </div>
        {!semReferencia && (
          <div className="mb-2 h-3 overflow-hidden rounded-[7px] bg-card">
            <div
              className="h-full rounded-[7px]"
              style={{
                width: `${Math.max(4, Math.min(100, ratio * 100))}%`,
                background: barColor,
              }}
            />
          </div>
        )}
        <div className="flex justify-between text-[13px] text-text-2">
          <span>
            Tem {num(item.current)} {item.unit}
          </span>
          {!semReferencia && (
            <span>
              Costuma ter {num(item.normal)} {item.unit}
            </span>
          )}
        </div>

        {!semReferencia && (
          <div className="mt-1.5 text-[12px] leading-snug text-text-3">
            Avisamos quando cair abaixo de {num(item.normal / 2)} {item.unit}.
          </div>
        )}
        {semReferencia && !mostrarSugestao && (
          <div className="mt-1.5 text-[12px] leading-snug text-text-3">
            Ainda não sabemos quanto você costuma ter em casa, então não avisamos quando
            este item estiver acabando.
          </div>
        )}

        {/* O app propoe pelo historico de compras; aceitar e um toque. Digitar
            existe pra quem quer um numero proprio, nao e o caminho padrao. */}
        {mostrarSugestao && (
          <button
            type="button"
            onClick={() => salvarPar(sugestao)}
            disabled={busy}
            className="mt-3 min-h-[44px] w-full rounded-[12px] border-[1.5px] border-brand bg-card px-3.5 py-2.5 text-left text-[13px] leading-snug disabled:opacity-50"
          >
            <span className="font-bold">
              Você costuma comprar {num(sugestao)} {item.unit} por vez.
            </span>{" "}
            Usar como referência e avisar abaixo de {num(sugestao / 2)} {item.unit}?
          </button>
        )}

        {editPar ? (
          <div className="mt-2.5 flex gap-2.5">
            <input
              value={parTxt}
              onChange={(e) => setParTxt(e.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder={`Quanto costuma ter? (${item.unit})`}
              className="h-[44px] min-w-0 flex-1 rounded-[12px] border border-border bg-card px-3.5 text-[14px]"
            />
            <button
              type="button"
              onClick={() => salvarPar(parDigitado)}
              disabled={busy || !Number.isFinite(parDigitado) || parDigitado < 0}
              className="h-[44px] shrink-0 rounded-[12px] bg-brand px-4 text-[14px] font-bold text-brand-ink disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setParTxt(item.normal > 0 ? num(item.normal) : "");
              setEditPar(true);
            }}
            className="mt-1.5 min-h-[44px] text-[13px] font-bold text-brand underline underline-offset-2"
          >
            {semReferencia ? "Definir quanto costuma ter" : "Mudar esse valor"}
          </button>
        )}
      </div>

      <div className="mb-3.5 flex gap-3">
        <div className="flex-1 rounded-[16px] bg-card-2 p-3.5">
          <div className="mb-1.5 text-xs text-text-3">Último preço</div>
          <div className="text-[20px] font-extrabold">{brl(item.priceLast ?? 0)}</div>
        </div>
        <div className="flex-1 rounded-[16px] bg-card-2 p-3.5">
          <div className="mb-1.5 text-xs text-text-3">Preço médio</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-extrabold">{brl(item.priceAvg ?? 0)}</span>
            <span
              className={`text-[13px] font-bold ${trendUp ? "text-neg" : "text-pos"}`}
            >
              {trendLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-2 mt-[18px] text-xs font-bold uppercase tracking-wide text-text-3">
        Histórico
      </div>
      <div className="mb-5">
        {history.map((h) => (
          <div
            key={h.date}
            className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
          >
            <span className="w-[64px] shrink-0 text-xs font-bold text-text-3">
              {h.date}
            </span>
            <span className="flex-1 text-[14px]">{h.text}</span>
            {"price" in h && (
              <span className="text-[13px] font-bold text-text-2">{h.price}</span>
            )}
          </div>
        ))}
      </div>

      {/* Repor: volta ao nivel normal. Aparece quando falta estoque (ex.: baixa
          acidental). Nao vira compra, so recompoe o que ja existe no cadastro. */}
      {item.current < item.normal && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-3">
            Repor no estoque
          </div>
          <button
            onClick={repor_}
            disabled={busy}
            className="mb-3.5 h-[50px] w-full rounded-[14px] bg-pos text-[15px] font-bold text-white disabled:opacity-50"
          >
            Repor ao normal ({item.normal} {item.unit})
          </button>
        </>
      )}

      {/* Baixa por consumo: total zera; parcial subtrai a quantidade consumida */}
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-3">
        Dar baixa por consumo
      </div>
      {parcial ? (
        <div className="mb-3.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <QtyStepper
              value={qtd}
              onChange={setQtd}
              unit={item.unit}
              autoFocus
              placeholder={item.unit}
            />
          </div>
          <button
            type="button"
            onClick={baixaParcial}
            disabled={busy || !Number(qtd.replace(",", "."))}
            className="h-12 shrink-0 rounded-[13px] bg-warn px-5 text-[15px] font-bold text-white disabled:opacity-50"
          >
            Baixar
          </button>
        </div>
      ) : (
        <div className="mb-3.5 flex flex-wrap gap-2.5">
          {/* Atalhos sem teclado: cobrem o caso comum. "Digitar" fica pra
              quem precisa de valor exato. */}
          <button
            onClick={usouMetade}
            disabled={busy || item.current <= 0}
            className="h-[50px] min-w-[104px] flex-1 rounded-[14px] border border-warn bg-card text-[15px] font-bold text-warn disabled:opacity-50"
          >
            Usei metade
          </button>
          <button
            onClick={baixaTotal}
            disabled={busy || item.current <= 0}
            className="h-[50px] min-w-[104px] flex-1 rounded-[14px] border border-warn bg-warn text-[15px] font-bold text-white disabled:opacity-50"
          >
            Acabou
          </button>
          <button
            onClick={() => setParcial(true)}
            disabled={busy || item.current <= 0}
            className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[14px] font-bold text-text-2 disabled:opacity-50"
          >
            Digitar quanto usei
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={fechar}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Fechar
        </button>
        <button
          onClick={add}
          className="h-[50px] flex-[1.4] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
        >
          Adicionar à lista
        </button>
      </div>
    </Modal>
  );
}
