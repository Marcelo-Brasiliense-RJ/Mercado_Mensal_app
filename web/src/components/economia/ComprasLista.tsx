"use client";

import { useCallback, useEffect, useState } from "react";
import { brl } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  EVENTO_COMPRAS,
  diaDaSemana,
  diaMes,
  estadoNota,
  rotuloOrigem,
  type CompraResumo,
  type ComprasMes,
} from "@/lib/compras";
import { CompraDetalhe } from "./CompraDetalhe";

// Gastos > "Compras de novembro": cada compra do mes numa linha (data, onde, quantos
// itens, total, se tem nota). Toque abre a compra para subir/trocar a nota, mudar a
// data, editar itens ou excluir (0055).
type Estado = { fase: "carregando" } | { fase: "sem_migration" } | { fase: "erro" } | { fase: "ok"; d: ComprasMes };

export function ComprasLista({
  mes,
  titulo,
  onMudou,
  onPendentes,
  abrirId,
  onAbriu,
}: {
  mes: string; // YYYY-MM-01
  titulo: string;
  onMudou: () => void; // o gasto do mes mudou: a tela de cima recarrega
  onPendentes?: (p: ComprasMes["pendentes"]) => void;
  abrirId?: string | null; // pedido de abrir uma compra (vindo do icone de pendencias)
  onAbriu?: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [aberta, setAberta] = useState<CompraResumo | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient().rpc("mercado_compras_mes_web", { p_mes: mes });
    if (error?.code === "PGRST202") return setEstado({ fase: "sem_migration" });
    const d = data as ComprasMes | null;
    if (error || !d?.ok) return setEstado({ fase: "erro" });
    setEstado({ fase: "ok", d });
    onPendentes?.(d.pendentes);
    // a compra aberta acompanha a versao nova (total, nota)
    setAberta((a) => (a ? (d.compras.find((c) => c.id === a.id) ?? null) : a));
  }, [mes, onPendentes]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (vivo) await carregar();
    })();
    const f = () => void carregar();
    window.addEventListener(EVENTO_COMPRAS, f);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_COMPRAS, f);
    };
  }, [carregar]);

  // Pedido do icone de pendencias: abre a compra assim que ela estiver na lista.
  useEffect(() => {
    if (!abrirId || estado.fase !== "ok") return;
    const c = estado.d.compras.find((x) => x.id === abrirId);
    if (!c) return;
    const t = setTimeout(() => {
      setAberta(c);
      onAbriu?.();
    }, 0);
    return () => clearTimeout(t);
  }, [abrirId, estado, onAbriu]);

  async function mudou() {
    await carregar();
    onMudou();
  }

  if (estado.fase === "carregando") return null;
  if (estado.fase === "sem_migration")
    return (
      <p className="rounded-[20px] bg-card p-4 text-[13px] leading-snug text-text-2">
        Para ver as compras do mês uma a uma (e subir a nota de cada uma), falta rodar a migration 0055 no Supabase.
      </p>
    );
  if (estado.fase === "erro") return null;

  const { compras } = estado.d;
  const pendentesMes = compras.filter((c) => c.pendente).length;
  const lista = soPendentes ? compras.filter((c) => c.pendente) : compras;
  const total = compras.reduce((a, c) => a + Number(c.total), 0);

  return (
    <section id="compras-do-mes" className="rounded-[24px] bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold">{titulo}</h2>
          <div className="text-[12px] text-text-2">
            {compras.length} {compras.length === 1 ? "compra" : "compras"} · {brl(total)}
          </div>
        </div>
        {pendentesMes > 0 && (
          <button
            type="button"
            onClick={() => setSoPendentes((v) => !v)}
            aria-pressed={soPendentes}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${
              soPendentes ? "bg-warn text-white" : "bg-warn-soft text-warn"
            }`}
          >
            <span aria-hidden>🧾</span>
            {pendentesMes} sem nota
          </button>
        )}
      </div>

      {compras.length === 0 ? (
        <p className="py-3 text-[14px] text-text-2">Nenhuma compra neste mês.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {lista.map((c) => {
            const nota = estadoNota(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAberta(c)}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-[12px] px-1 py-2 text-left active:bg-card-2"
                >
                  <span className="w-11 shrink-0 text-center leading-tight">
                    <span className="block text-[15px] font-extrabold tabular-nums">{diaMes(c.data).slice(0, 2)}</span>
                    <span className="block text-[11px] font-semibold uppercase text-text-3">{diaDaSemana(c.data)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{rotuloOrigem(c)}</span>
                    <span className="block truncate text-[12px] text-text-2">
                      {c.itens} {c.itens === 1 ? "item" : "itens"}
                      {c.origem === "carrinho" && c.mercado ? " · carrinho" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-extrabold tabular-nums">{brl(Number(c.total))}</span>
                    {nota === "com_nota" && <span className="text-[11px] font-bold text-pos">✓ nota</span>}
                    {nota === "pendente" && <span className="text-[11px] font-bold text-warn">🧾 sem nota</span>}
                    {nota === "sem_nota" && <span className="text-[11px] font-semibold text-text-3">sem nota</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {aberta && <CompraDetalhe compra={aberta} onClose={() => setAberta(null)} onMudou={mudou} />}
    </section>
  );
}
