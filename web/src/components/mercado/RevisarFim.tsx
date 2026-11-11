"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { brl } from "@/lib/format";
import type { Conta, ResumoMercado } from "@/lib/modoMercado";
import type { ShopItem } from "@/lib/types";

// Conferencia antes do caixa: o que ficou para tras da lista (com "Peguei" ali mesmo),
// quanto e da lista e quanto e fora dela, e como fica o orcamento. E o ultimo momento
// para nao esquecer nada.
export function RevisarFim({
  r,
  conta,
  busy,
  ocupado,
  onPeguei,
  onFinalizar,
  onClose,
}: {
  r: ResumoMercado;
  conta: Conta;
  busy: boolean;
  ocupado: string | null;
  onPeguei: (i: ShopItem) => void;
  onFinalizar: () => void;
  onClose: () => void;
}) {
  const faltam = r.grupos.flatMap((g) => g.faltam);
  const parciais = r.grupos.flatMap((g) => g.pegos.filter((p) => p.faltaQtd > 0));
  // Compra de 50+ itens: a lista do que faltou nao pode empurrar o Finalizar para
  // fora da tela. Mostra os primeiros e o resto num toque; os botoes ficam presos embaixo.
  const [verTodos, setVerTodos] = useState(false);
  const LIMITE = 5;
  const total = faltam.length + parciais.length;
  const faltamVer = verTodos ? faltam : faltam.slice(0, LIMITE);
  const parciaisVer = verTodos ? parciais : parciais.slice(0, Math.max(0, LIMITE - faltam.length));
  const escondidos = total - faltamVer.length - parciaisVer.length;
  const linha = "flex items-baseline justify-between gap-3 py-1.5 text-[15px]";
  return (
    <Modal open onClose={onClose} maxWidth={440}>
      <div className="mb-1 text-[20px] font-extrabold">🧾 Conferir antes do caixa</div>
      <div className="mb-3 text-[40px] font-extrabold leading-none tabular-nums text-brand">{brl(conta.carrinho)}</div>

      <div className="mb-3 divide-y divide-border rounded-[14px] border border-border px-3.5">
        <div className={linha}>
          <span className="text-text-2">📝 Da lista</span>
          <b className="tabular-nums">{brl(r.valorDaLista)}</b>
        </div>
        <div className={linha}>
          <span className="text-text-2">➕ Fora da lista ({r.qtdFora})</span>
          <b className="tabular-nums">{brl(r.valorFora)}</b>
        </div>
        {Math.abs(r.vsPesquisado) >= 0.01 && (
          <div className={linha}>
            <span className="text-text-2">{r.vsPesquisado > 0 ? "💰 Mais barato que o pesquisado" : "📈 Mais caro que o pesquisado"}</span>
            <b className={`tabular-nums ${r.vsPesquisado > 0 ? "text-pos" : "text-neg"}`}>{brl(Math.abs(r.vsPesquisado))}</b>
          </div>
        )}
        {conta.orcamento > 0 && (
          <div className={linha}>
            <span className="text-text-2">{(conta.sobraAgora ?? 0) >= 0 ? "✅ Sobra no orçamento" : "🚨 Passa do orçamento"}</span>
            <b className={`tabular-nums ${(conta.sobraAgora ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
              {brl(Math.abs(conta.sobraAgora ?? 0))}
            </b>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="mb-3 rounded-[14px] bg-pos-soft p-3.5 text-center text-[16px] font-extrabold text-pos">
          🎉 Pegou tudo da lista!
        </div>
      ) : (
        <div className="mb-3 rounded-[14px] border-2 border-warn bg-warn-soft p-3">
          <div className="mb-2 text-[15px] font-extrabold">
            ⏳ Ficou faltando {total} {total > 1 ? "itens" : "item"}
          </div>
          <ul className="space-y-1.5">
            {faltamVer.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{i.name}</span>
                <button
                  onClick={() => onPeguei(i)}
                  disabled={ocupado === i.id}
                  className="h-9 shrink-0 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-ink disabled:opacity-50"
                >
                  Peguei
                </button>
              </li>
            ))}
            {parciaisVer.map((p) => (
              <li key={p.item.id} className="flex items-center gap-2 text-[14px]">
                <span className="min-w-0 flex-1 truncate font-bold">{p.item.name}</span>
                <span className="shrink-0 text-[13px] font-bold text-warn">
                  faltam {String(p.faltaQtd).replace(".", ",")} {p.item.unit}
                </span>
              </li>
            ))}
          </ul>
          {escondidos > 0 && (
            <button onClick={() => setVerTodos(true)} className="mt-2 h-10 w-full rounded-[10px] bg-card text-[14px] font-bold">
              Ver os outros {escondidos}
            </button>
          )}
        </div>
      )}

      {total > 0 && (
        <p className="mb-3 text-center text-[13px] text-text-2">
          Não deu para anotar tudo? Finalize e leia a nota: ela completa a despensa e confere os preços.
        </p>
      )}

      {/* Presos no fim do popup: sempre a vista, por maior que seja a lista. */}
      <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex gap-2 border-t border-border bg-card px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 sm:-bottom-[26px] sm:-mx-[26px] sm:-mb-[26px] sm:px-[26px] sm:pb-[26px]">
        <button onClick={onClose} className="h-[52px] shrink-0 rounded-[14px] border border-border bg-card px-4 text-[15px] font-bold">
          Voltar
        </button>
        <button
          onClick={onFinalizar}
          disabled={busy || conta.carrinho <= 0}
          className="h-[52px] flex-1 rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Finalizando…" : total ? "Finalizar mesmo assim" : "Finalizar compra ✓"}
        </button>
      </div>
    </Modal>
  );
}
