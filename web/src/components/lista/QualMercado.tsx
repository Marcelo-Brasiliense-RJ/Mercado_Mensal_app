"use client";

import { useState } from "react";
import { pedirMercado } from "@/lib/mercadosCasa";
import { useStore } from "@/lib/store";
import { MERCADOS } from "@/lib/ofertas";
import { idDoMercado, nomearMercado, posicaoAtual, useLugar } from "@/lib/lugar";

// Ponto novo (primeiro item posto no carrinho numa loja que o app nao conhece):
// pergunta UMA vez qual mercado e, com a sugestao do mapa ja marcada. Mercado fora
// dos que o monitor acompanha pergunta se e fixo; se for, vira pedido para entrar
// nos encartes (0043). Depois disso o app sabe sozinho, para sempre, nesta loja.
export function QualMercado() {
  const { perguntar, noMercado } = useLugar();
  const { showToast } = useStore();
  const [outro, setOutro] = useState<string | null>(null);
  if (!noMercado || !perguntar) return null;

  const sugestao = perguntar.sugestao;
  const sugId = sugestao ? idDoMercado(sugestao) : null;
  const opcoes = Object.entries(MERCADOS);

  async function fixo(sim: boolean) {
    const nome = (outro ?? "").trim();
    if (!nome) return;
    nomearMercado(nome);
    if (sim) {
      const p = posicaoAtual();
      await pedirMercado(nome, p?.lat ?? null, p?.lng ?? null);
      showToast(`${nome} anotado na lista de mercados a acompanhar`);
    } else showToast(`Ok, ${nome} só hoje`);
    setOutro(null);
  }

  return (
    <div className="rounded-[18px] border-2 border-brand bg-brand-soft p-3.5">
      {outro === null ? (
        <>
          <div className="text-[15px] font-extrabold">📍 Em qual mercado você está?</div>
          <div className="mt-0.5 text-[12px] text-text-2">
            Só desta vez. Depois eu já sei e trago o preço daqui ao ler o código.
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {sugestao && !sugId && (
              <button onClick={() => setOutro(sugestao)} className="h-11 rounded-full bg-brand px-4 text-[14px] font-bold text-brand-ink">
                {sugestao} ✓
              </button>
            )}
            {opcoes.map(([id, m]) => (
              <button
                key={id}
                onClick={() => nomearMercado(m.nome)}
                className="h-11 rounded-full border-2 px-4 text-[14px] font-bold"
                style={id === sugId ? { background: m.cor, borderColor: m.cor, color: "#fff" } : { borderColor: m.cor, color: m.cor }}
              >
                {m.nome}
                {id === sugId ? " ✓" : ""}
              </button>
            ))}
            <button onClick={() => setOutro("")} className="h-11 rounded-full border-2 border-border bg-card px-4 text-[14px] font-bold text-text-2">
              Outro…
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-[15px] font-extrabold">Qual o nome do mercado?</div>
          <input
            autoFocus
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            placeholder="Ex.: Atacadão"
            className="mt-2 h-12 w-full rounded-[13px] border border-border bg-card px-3.5 text-[15px]"
          />
          <div className="mt-3 text-[14px] font-bold">Você vem sempre aqui (compra do mês)?</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => fixo(true)}
              disabled={!outro.trim()}
              className="h-12 flex-[1.4] rounded-[13px] bg-brand text-[14px] font-bold text-brand-ink disabled:opacity-50"
            >
              Sim, acompanhar encartes
            </button>
            <button
              onClick={() => fixo(false)}
              disabled={!outro.trim()}
              className="h-12 flex-1 rounded-[13px] border border-border bg-card text-[14px] font-bold disabled:opacity-50"
            >
              Não, só hoje
            </button>
          </div>
        </>
      )}
    </div>
  );
}
