"use client";

import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BarcodeIcon, MicIcon, PlusIcon } from "@/components/ui/icons";

// Barra fixa do rodape na aba Lista, no celular.
//
// Por que existe: no mercado, com o carrinho numa mao e o celular na outra, o
// caminho para anotar um item era tocar em "Adicionar", escolher no menu e so
// entao chegar na tela de digitar. Tres toques antes do primeiro caractere, e o
// total do carrinho ficava fora da tela assim que a lista rolava.
//
// Aqui as tres formas de anotar ficam a UM toque, sempre no alcance do polegar, e
// o numero que importa fica sempre visivel por cima delas.
export function QuickBar({
  onVoice,
  onScan,
  onManual,
}: {
  onVoice: () => void;
  onScan: () => void;
  onManual: () => void;
}) {
  const { trip, shopping } = useStore();

  // Sem compra aberta o numero util e o da lista: quanto falta pagar e quantos
  // itens faltam. Com compra aberta, o que importa e o carrinho subindo.
  const aComprar = shopping.filter((i) => i.status === "pending" && !i.em_estoque);
  const totalLista = aComprar.reduce(
    (acc, i) => acc + i.desired_quantity * (i.estimated_price ?? 0),
    0,
  );

  const noMercado = Boolean(trip);
  const valor = noMercado ? trip!.total : totalLista;
  const qtd = noMercado ? trip!.items.length : aComprar.length;

  const btn =
    "flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[12px] font-bold";

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card px-3 pb-2.5 pt-2 shadow-[0_-4px_16px_var(--shadow)] lg:hidden"
      // Barra de acao do mercado: fica colada acima das abas.
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">
          {noMercado ? "No carrinho" : "Falta comprar"}
        </span>
        <span className="flex items-baseline gap-2">
          <span
            className={`text-[20px] font-extrabold leading-none ${
              noMercado ? "text-brand" : ""
            }`}
          >
            {brl(valor)}
          </span>
          <span className="text-[12px] text-text-3">
            {qtd} {qtd === 1 ? "item" : "itens"}
          </span>
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onVoice}
          className={`${btn} bg-brand text-brand-ink`}
        >
          <MicIcon size={22} />
          Falar
        </button>
        <button
          type="button"
          onClick={onScan}
          className={`${btn} border border-border bg-card-2 text-text`}
        >
          <BarcodeIcon size={22} />
          Código
        </button>
        <button
          type="button"
          onClick={onManual}
          className={`${btn} border border-border bg-card-2 text-text`}
        >
          <PlusIcon size={22} />
          Digitar
        </button>
      </div>
    </div>
  );
}
