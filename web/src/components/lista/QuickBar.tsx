"use client";

import Link from "next/link";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";

// Pilula fixa acima das abas, na aba Lista (celular): o numero que importa sempre a
// vista enquanto a lista rola. Mesmo desenho da barra de abas (escura, arredondada),
// para nao parecer um rodape solto (print do dono: "essa parte de baixo ta muito feia").
// - Fora do mercado: quanto falta comprar e quantos itens.
// - No mercado (modo ligado): o carrinho subindo; tocar leva a aba Mercado.
export function QuickBar() {
  const { trip, shopping } = useStore();

  const aComprar = shopping.filter((i) => i.status === "pending" && !i.em_estoque);
  const totalLista = aComprar.reduce((acc, i) => acc + i.desired_quantity * (i.estimated_price ?? 0), 0);

  const noMercado = Boolean(trip);
  const valor = noMercado ? trip!.total : totalLista;
  const qtd = noMercado ? trip!.items.length : aComprar.length;
  if (!noMercado && qtd === 0) return null; // lista vazia: nada a mostrar

  const conteudo = (
    <>
      <span aria-hidden className="text-[17px]">{noMercado ? "🛒" : "📝"}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-bold">
        {noMercado ? (qtd ? "No carrinho" : "Carrinho vazio") : "Falta comprar"}
        <span className="ml-1.5 font-semibold text-white/60">
          {qtd} {qtd === 1 ? "item" : "itens"}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-[var(--barra-ativa)] px-3 py-1 text-[15px] font-extrabold tabular-nums text-[var(--barra-ativa-ink)]">
        {brl(valor)}
      </span>
      {noMercado && <span aria-hidden className="text-[18px] text-white/60">›</span>}
    </>
  );
  const classe =
    "flex h-12 w-full items-center gap-2.5 rounded-full bg-[var(--barra)] pl-4 pr-2 text-white shadow-[0_8px_24px_var(--shadow-lg)]";

  return (
    <div className="acima-teclado pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+8px)] z-20 flex justify-center px-4 lg:hidden">
      <div className="pointer-events-auto w-full max-w-[460px]">
        {noMercado ? (
          <Link href="/app/mercado" aria-label={`Abrir o carrinho: ${qtd} itens, ${brl(valor)}`} className={classe}>
            {conteudo}
          </Link>
        ) : (
          <div className={classe}>{conteudo}</div>
        )}
      </div>
    </div>
  );
}
