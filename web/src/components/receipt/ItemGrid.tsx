"use client";

import { brl } from "@/lib/format";

export type GridItem = {
  nome: string;
  marca?: string;
  qtd: number;
  preco: number;
  unidade: string;
  duvida?: boolean; // OCR marcou a linha como incerta
};

export type GridField = "nome" | "qtd" | "preco";

const inp =
  "h-9 rounded-[9px] border border-border bg-card-2 px-2 text-[14px] text-text";

// Grade de varios itens editaveis. Nasceu como a fase "review" do ReceiptModal e
// foi extraida daqui pra tambem servir de entrada em lote no estoque, que e a
// mesma tela: varias linhas, editar, remover, confirmar de uma vez.
//
// `precos` desligado esconde preco e total de proposito: adicionar ao estoque nao
// e registrar compra e nao pode mexer no gasto do mes.
export function ItemGrid({
  items,
  onPatch,
  onRemove,
  onAddRow,
  precos = true,
  avisoDe,
}: {
  items: GridItem[];
  onPatch: (i: number, field: GridField, value: string) => void;
  onRemove: (i: number) => void;
  onAddRow?: () => void;
  precos?: boolean;
  avisoDe?: (nome: string) => string | null;
}) {
  const total = items.reduce(
    (a, i) => a + (Number(i.qtd) || 0) * (Number(i.preco) || 0),
    0,
  );

  return (
    <div className="mb-4 max-h-[45vh] overflow-y-auto rounded-[16px] border border-border">
      {items.map((it, i) => {
        const aviso = avisoDe?.(it.nome) ?? null;
        return (
          <div
            key={i}
            className={`${i > 0 ? "border-t border-border" : ""} ${
              it.duvida ? "border-l-[3px] border-l-warn" : ""
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <input
                value={it.nome}
                onChange={(e) => onPatch(i, "nome", e.target.value)}
                className={`${inp} min-w-0 flex-1`}
                aria-label="Nome"
              />
              <input
                value={String(it.qtd)}
                onChange={(e) => onPatch(i, "qtd", e.target.value)}
                inputMode="decimal"
                className={`${inp} w-12 text-center`}
                aria-label="Quantidade"
              />
              {precos ? (
                <>
                  <span className="text-text-3">×</span>
                  <input
                    value={String(it.preco)}
                    onChange={(e) => onPatch(i, "preco", e.target.value)}
                    inputMode="decimal"
                    className={`${inp} w-[68px] text-right`}
                    aria-label="Preço"
                  />
                </>
              ) : (
                // Unidade deduzida do nome (defaults.unitFor), so leitura: quem
                // precisar de outra corrige no detalhe do item.
                <span className="w-10 shrink-0 text-center text-[13px] text-text-3">
                  {it.unidade}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remover"
                className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card-2"
              >
                ×
              </button>
            </div>
            {aviso && (
              <div className="px-3 pb-2 text-[12px] leading-snug text-warn">{aviso}</div>
            )}
          </div>
        );
      })}

      {precos && (
        <div className="flex items-center justify-between border-t border-border bg-card-2 px-4 py-3.5">
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-text-2">
            Total
          </span>
          <span className="text-[20px] font-extrabold">{brl(total)}</span>
        </div>
      )}

      {onAddRow && (
        <button
          type="button"
          onClick={onAddRow}
          className="h-[44px] w-full border-t border-border bg-card-2 text-[14px] font-bold text-brand"
        >
          + linha
        </button>
      )}
    </div>
  );
}
