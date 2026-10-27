"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useOfertas } from "@/components/ofertas/useOfertas";
import { MeusMercadosModal } from "@/components/ofertas/MeusMercados";

// Casa nova (ou que ainda nao terminou de montar): as duas pendencias que fazem o app
// funcionar para ela. Some sozinho quando as duas estao feitas.
// 1. onde compra (as ofertas ficam so desses mercados); 2. o que ja tem em casa.
const MINIMO_ESTOQUE = 5;

export function PrimeirosPassos({ onFalar, onDigitar }: { onFalar: () => void; onDigitar: () => void }) {
  const { stock, dataLoading } = useStore();
  const ofertas = useOfertas();
  const [mercados, setMercados] = useState(false);
  if (ofertas.fase === "carregando" || dataLoading) return null;
  const temMercados = ofertas.fase !== "ok" || !!ofertas.dados.meus_mercados?.length;
  const temEstoque = stock.length >= MINIMO_ESTOQUE;
  if (temMercados && temEstoque) return null;
  const feitos = Number(temMercados) + Number(temEstoque);

  return (
    <div className="rounded-[20px] border-2 border-brand bg-brand-soft p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[17px] font-extrabold">Primeiros passos</div>
        <div className="text-[13px] font-bold text-brand">{feitos} de 2</div>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        <Passo
          feito={temMercados}
          titulo="1. Onde você compra?"
          texto="Escolha seus mercados: as ofertas ficam só deles."
          acao={
            <button onClick={() => setMercados(true)} className="h-11 rounded-xl bg-brand px-4 text-[14px] font-bold text-brand-ink">
              Escolher
            </button>
          }
        />
        <Passo
          feito={temEstoque}
          titulo="2. O que tem em casa?"
          texto={
            stock.length
              ? `${stock.length} ${stock.length > 1 ? "itens" : "item"} até agora. Fale ou digite o resto.`
              : "Abra a despensa e fale o que tem: “três arroz, dois feijão”."
          }
          acao={
            <div className="flex gap-2">
              <button onClick={onFalar} className="h-11 rounded-xl bg-brand px-4 text-[14px] font-bold text-brand-ink">
                Falar
              </button>
              <button onClick={onDigitar} className="h-11 rounded-xl border-2 border-brand px-4 text-[14px] font-bold text-brand">
                Digitar
              </button>
            </div>
          }
        />
      </div>
      {mercados && <MeusMercadosModal onClose={() => setMercados(false)} />}
    </div>
  );
}

function Passo({ feito, titulo, texto, acao }: { feito: boolean; titulo: string; texto: string; acao: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 ${feito ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold">
          {feito ? "✅ " : ""}
          {titulo}
        </div>
        <div className="text-[13px] text-text-2">{texto}</div>
      </div>
      {!feito && acao}
    </div>
  );
}
