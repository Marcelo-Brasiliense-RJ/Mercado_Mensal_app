"use client";

import { useStore } from "@/lib/store";
import { FotoItem } from "@/components/ui/FotoItem";

// "Nao precisa agora" (0053): o que a casa disse, na voz, que nao precisa comprar
// ("nao precisa comprar macarrao, ja tem muito"). Sai sozinho quando o estoque baixa;
// o x tira na mao. Some quando vazio: nao ocupa a tela de quem nao usa.
export function NaoPrecisaAgora() {
  const { naoPrecisa, removeNaoPrecisa, showToast } = useStore();
  if (!naoPrecisa.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <div className="mb-2">
        <span className="block text-[16px] font-extrabold">✋ Não precisa agora</span>
        <span className="block text-[12px] text-text-2">
          Você disse que não precisa. Sai sozinho quando o estoque baixar.
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {naoPrecisa.map((n) => (
          <li key={n.id} className="flex items-center gap-2.5">
            <FotoItem nome={n.nome} className="h-9 w-9 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold capitalize">{n.nome}</span>
              {n.estoque != null && (
                <span className="block text-[12px] text-text-3">
                  tem {n.estoque} {n.unidade ?? ""} em casa
                </span>
              )}
            </span>
            <button
              onClick={async () => {
                const r = await removeNaoPrecisa(n.id);
                if (!r.ok) showToast(r.erro);
              }}
              aria-label={`Tirar ${n.nome} de Não precisa`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card-2"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
