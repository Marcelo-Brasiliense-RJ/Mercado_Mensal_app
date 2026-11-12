"use client";

import { useMemo, useState } from "react";
import { FotoItem } from "@/components/ui/FotoItem";
import { brl } from "@/lib/format";
import { agrupar } from "@/lib/validarNota";

// Validacao da nota "ridiculamente facil" (pedido do dono): o que casou ja vai, o que e
// novo entra direto, e so as DUVIDAS sao perguntadas, uma de cada vez, com botoes
// grandes. Qualquer pessoa resolve sem saber nada do app.

type Item = { nome: string; marca?: string; qtd: number; preco: number; unidade: string; duvida?: boolean };
type Resposta = { tirar?: boolean; nome?: string; listaId?: string | null };

export function ValidarNota({
  itens,
  lista,
  conhecidos,
  busy,
  rotuloSalvar,
  onSalvar,
  onEditarTodos,
  onCancelar,
}: {
  itens: Item[];
  lista: { id: string; name: string; status: string }[];
  conhecidos: string[];
  busy: boolean;
  rotuloSalvar: string;
  onSalvar: (final: Item[], riscarDaLista: string[]) => void;
  onEditarTodos: () => void;
  onCancelar: () => void;
}) {
  const g = useMemo(() => agrupar(itens, lista, conhecidos), [itens, lista, conhecidos]);
  const [resp, setResp] = useState<Record<number, Resposta>>({});
  const [corrigindo, setCorrigindo] = useState("");
  const [editando, setEditando] = useState(false);
  const [verCertos, setVerCertos] = useState(false);

  const abertas = g.duvidas.filter((d) => !(d.i in resp));
  const atual = abertas[0];
  const k = g.duvidas.length - abertas.length + 1;

  function responder(i: number, r: Resposta) {
    setResp((x) => ({ ...x, [i]: r }));
    setEditando(false);
    setCorrigindo("");
  }

  function salvar() {
    const final: Item[] = [];
    const riscar = new Set(Object.values(g.riscar));
    itens.forEach((it, i) => {
      const r = resp[i];
      if (r?.tirar) return;
      if (r?.listaId) riscar.add(r.listaId);
      final.push({ ...it, nome: r?.nome?.trim() || it.nome, duvida: false });
    });
    onSalvar(final, [...riscar]);
  }

  const nomeDe = (i: number) => resp[i]?.nome || itens[i].nome;
  const total = itens.reduce((t, it, i) => (resp[i]?.tirar ? t : t + it.qtd * it.preco), 0);
  const nFinal = itens.filter((_, i) => !resp[i]?.tirar).length;
  const chip = "rounded-full px-3 py-1.5 text-[13px] font-extrabold";

  return (
    <div>
      <h2 className="text-[22px] font-extrabold leading-tight">
        {atual ? `Só ${abertas.length === 1 ? "1 pergunta" : `${abertas.length} perguntas`}` : "Tudo pronto ✓"}
      </h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`${chip} bg-pos-soft text-pos`}>✓ {g.certos.length} certos</span>
        {g.novos.length > 0 && <span className={`${chip} bg-brand-soft text-brand`}>🆕 {g.novos.length} {g.novos.length === 1 ? "novo" : "novos"}</span>}
        {abertas.length > 0 ? (
          <span className={`${chip} bg-warn-soft text-warn`}>❓ {abertas.length} {abertas.length === 1 ? "dúvida" : "dúvidas"}</span>
        ) : g.duvidas.length > 0 ? (
          <span className={`${chip} bg-pos-soft text-pos`}>✓ {g.duvidas.length} {g.duvidas.length === 1 ? "respondida" : "respondidas"}</span>
        ) : null}
      </div>

      {/* A pergunta da vez: uma so, botoes grandes */}
      {atual && (
        <div className="mt-4 rounded-[20px] border-2 border-warn/50 bg-card p-4">
          <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-text-3">
            Pergunta {k} de {g.duvidas.length}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <FotoItem nome={[itens[atual.i].nome, itens[atual.i].marca].filter(Boolean).join(" ")} className="h-14 w-14 shrink-0 rounded-2xl" />
            <div className="min-w-0">
              <div className="text-[13px] text-text-2">{atual.tipo === "ilegivel" ? "Li assim (não deu para ler bem):" : "Na nota veio:"}</div>
              <div className="truncate text-[18px] font-extrabold capitalize">{itens[atual.i].nome || "?"}</div>
              <div className="text-[13px] text-text-2 tabular-nums">
                {String(itens[atual.i].qtd).replace(".", ",")} {itens[atual.i].unidade} × {brl(itens[atual.i].preco)}
              </div>
            </div>
          </div>

          {atual.tipo === "ilegivel" ? (
            editando ? (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (corrigindo.trim()) responder(atual.i, { nome: corrigindo });
                }}
              >
                <input
                  autoFocus
                  value={corrigindo}
                  onChange={(e) => setCorrigindo(e.target.value)}
                  placeholder="O que é? Ex.: biscoito"
                  aria-label="Nome certo do produto"
                  className="h-12 min-w-0 flex-1 rounded-full border border-border bg-card-2 px-4 text-[16px]"
                />
                <button type="submit" className="h-12 shrink-0 rounded-full bg-brand px-5 font-extrabold text-brand-ink">OK</button>
              </form>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => responder(atual.i, {})} className="h-14 rounded-[16px] bg-pos text-[14px] font-extrabold text-white">✓ Está certo</button>
                <button type="button" onClick={() => setEditando(true)} className="h-14 rounded-[16px] bg-card-2 text-[14px] font-extrabold">✏️ Corrigir</button>
                <button type="button" onClick={() => responder(atual.i, { tirar: true })} className="h-14 rounded-[16px] bg-neg-soft text-[14px] font-extrabold text-neg">🗑 Tirar</button>
              </div>
            )
          ) : (
            <>
              <div className="mt-3 text-[14px] font-bold">Qual destes da sua lista é?</div>
              <div className="mt-2 flex flex-col gap-2">
                {atual.opcoes.map((o) => (
                  <button key={o.id} type="button" onClick={() => responder(atual.i, { listaId: o.id })} className="h-12 rounded-[14px] bg-card-2 px-4 text-left text-[15px] font-bold capitalize">
                    {o.name}
                  </button>
                ))}
                <button type="button" onClick={() => responder(atual.i, { listaId: null })} className="h-11 rounded-[14px] text-[14px] font-bold text-text-2">
                  Nenhum da lista
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Resumo: o que ja vai sozinho */}
      {!atual && (
        <div className="mt-4 space-y-2">
          {g.novos.length > 0 && (
            <div className="rounded-[16px] bg-brand-soft p-3 text-[13px] leading-snug">
              <b>🆕 Entram como novos na despensa:</b> {g.novos.map(nomeDe).join(", ")}
            </div>
          )}
          <button type="button" onClick={() => setVerCertos((v) => !v)} className="w-full rounded-[16px] bg-pos-soft p-3 text-left text-[13px] leading-snug">
            <b>✓ {g.certos.length} certos</b> (da lista, do carrinho ou da despensa) {verCertos ? "▴" : "▾"}
            {verCertos && <span className="mt-1 block">{g.certos.map(nomeDe).join(", ")}</span>}
          </button>
        </div>
      )}

      <div data-rodape className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy || !!atual}
          onClick={salvar}
          className="h-[54px] rounded-full bg-[var(--barra)] text-[16px] font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Salvando…" : atual ? "Responda a pergunta acima" : `${rotuloSalvar} · ${nFinal} itens · ${brl(total)}`}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">Cancelar</button>
          <button type="button" onClick={onEditarTodos} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">Ver e editar todos</button>
        </div>
      </div>
    </div>
  );
}
