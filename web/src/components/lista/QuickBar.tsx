"use client";

import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";

// Barra fixa do rodape na aba Lista, no celular.
//
// Por que existe: no mercado, com o carrinho numa mao e o celular na outra, o
// caminho para anotar um item era tocar em "Adicionar", escolher no menu e so
// entao chegar na tela de digitar. Tres toques antes do primeiro caractere, e o
// total do carrinho ficava fora da tela assim que a lista rolava.
//
// Aqui as tres formas de anotar ficam a UM toque, sempre no alcance do polegar, e
// o numero que importa fica sempre visivel por cima delas.
// Os botoes Falar/Codigo/Foto sairam: agora e o botao "+" flutuante (AppShell). Fica
// so o numero que importa, sempre visivel.
export function QuickBar() {
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

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card px-3 pb-2.5 pt-2 shadow-[0_-4px_16px_var(--shadow)] lg:hidden"
      // Barra de acao do mercado: fica colada acima das abas.
    >
      <div className="flex items-baseline justify-between gap-3">
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

    </div>
  );
}
