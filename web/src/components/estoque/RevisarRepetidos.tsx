"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FotoItem } from "@/components/ui/FotoItem";
import type { StockItem } from "@/lib/types";

// Juntar repetidos UM GRUPO POR VEZ (dono, 2026-11-12: "deixe mais facil de fazer").
// Antes era um painel com todos os grupos de uma vez no topo do Estoque, empurrando os
// itens para fora da tela, e cada "Juntar" abria outro popup. Agora: "3 de 14", os itens
// com foto e quantidade (desmarca o que nao e o mesmo), um toque no nome que FICA e ja
// vai para o proximo. "Nao sao o mesmo" nao pergunta de novo neste aparelho.
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ","));

export function RevisarRepetidos({
  grupos,
  onJuntar,
  onIgnorar,
  onFechar,
}: {
  grupos: StockItem[][]; // retrato de quando abriu (juntar muda o estoque, a ordem nao pode pular)
  onJuntar: (destino: StockItem, outros: StockItem[]) => Promise<boolean>;
  onIgnorar: (g: StockItem[]) => void;
  onFechar: () => void;
}) {
  const [i, setI] = useState(0);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const g = grupos[i];

  function proximo() {
    setFora(new Set());
    setI((x) => x + 1);
  }

  if (!g) {
    return (
      <Modal open onClose={onFechar} maxWidth={440}>
        <div className="py-4 text-center">
          <div className="text-[40px]">✓</div>
          <div className="text-[20px] font-extrabold">Revisão feita</div>
          <p className="mt-1 text-[14px] text-text-2">
            {feitos ? `${feitos} ${feitos > 1 ? "produtos juntados" : "produto juntado"}.` : "Nada juntado."} O que você disse que não é o mesmo não aparece de novo.
          </p>
          <button onClick={onFechar} className="mt-4 h-12 w-full rounded-full bg-[var(--barra)] text-[16px] font-extrabold text-white">
            Fechar
          </button>
        </div>
      </Modal>
    );
  }

  const dentro = g.filter((x) => !fora.has(x.id));

  return (
    <Modal open onClose={onFechar} maxWidth={440}>
      <div className="pr-12 text-[13px] font-bold text-text-3">
        Repetido {i + 1} de {grupos.length}
      </div>
      <div className="text-[20px] font-extrabold leading-tight">É o mesmo produto?</div>
      <p className="mt-0.5 text-[13px] text-text-2">Desmarque o que for outra coisa.</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {g.map((x) => {
          const marcado = !fora.has(x.id);
          return (
            <li key={x.id}>
              <label className={`flex items-center gap-3 rounded-[14px] border-2 p-2.5 ${marcado ? "border-brand bg-brand-soft" : "border-border bg-card opacity-60"}`}>
                <FotoItem nome={x.name} className="h-10 w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold capitalize leading-tight">{x.name}</span>
                  <span className="block text-[12px] text-text-3">
                    {fmt(x.current)} {x.unit} em casa
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() =>
                    setFora((s) => {
                      const n = new Set(s);
                      if (n.has(x.id)) n.delete(x.id);
                      else n.add(x.id);
                      return n;
                    })
                  }
                  className="h-6 w-6 shrink-0 accent-[var(--text)]"
                  aria-label={`${x.name} é o mesmo produto`}
                />
              </label>
            </li>
          );
        })}
      </ul>

      {dentro.length >= 2 ? (
        <>
          <div className="mt-4 text-[14px] font-extrabold">Qual nome fica?</div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {dentro.map((d) => {
              const outros = dentro.filter((x) => x.id !== d.id);
              const soma = d.current + outros.filter((x) => x.unit === d.unit).reduce((t, x) => t + x.current, 0);
              return (
                <button
                  key={d.id}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await onJuntar(d, outros);
                    setBusy(false);
                    if (ok) {
                      setFeitos((n) => n + 1);
                      proximo();
                    }
                  }}
                  className="flex items-center justify-between gap-2 rounded-full bg-[var(--barra)] px-4 py-3 text-left text-white disabled:opacity-50"
                >
                  <span className="min-w-0 truncate text-[15px] font-extrabold capitalize">🔗 {d.name}</span>
                  <span className="shrink-0 text-[12px] text-white/70">
                    fica {fmt(soma)} {d.unit}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-[12px] bg-card-2 p-3 text-[13px] text-text-2">Marque pelo menos dois para juntar.</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            onIgnorar(g);
            proximo();
          }}
          className="h-11 flex-[2] rounded-full border border-border text-[14px] font-bold"
        >
          Não são o mesmo
        </button>
        <button onClick={proximo} className="h-11 flex-1 rounded-full text-[14px] font-bold text-text-3">
          Pular
        </button>
      </div>
    </Modal>
  );
}
