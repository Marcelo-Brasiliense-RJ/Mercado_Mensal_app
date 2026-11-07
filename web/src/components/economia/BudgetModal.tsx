"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { nomeMes } from "@/lib/economia";
import { brl } from "@/lib/format";
import {
  dasFontesSalvas,
  formatarDigitando,
  lerValor,
  nomeLivre,
  paraSalvar,
  somar,
  SUGESTOES,
  valorTexto,
  type Fonte,
} from "@/lib/orcamentoFontes";

// Orcamento do mes montado por fontes: "VR Marcelo 600 + VR Bianca 500 + Dinheiro
// 150". O total e a soma e e ele que vale em todo o app (0054).
//
// Feito para o celular com o teclado aberto (print do dono: os atalhos sumiam atras
// do rodape e o "0,00" parecia valor). Por isso: atalhos NO TOPO, numa faixa que
// rola de lado; total encolhe para uma linha enquanto digita; milhar aparece ao
// digitar; e a linha em foco ganha +50/+100/+200/+500 sem fechar o teclado.

const CORES = ["var(--brand)", "var(--pos)", "var(--warn)", "var(--text-2)", "var(--neg)"];
const cor = (i: number) => CORES[i % CORES.length];
const SOMAS = [50, 100, 200, 500];

export function BudgetModal({
  open,
  onClose,
  mes,
}: {
  open: boolean;
  onClose: () => void;
  mes?: string; // YYYY-MM-01 do mes que vem; sem ele, o mes corrente
}) {
  const { budget, setBudget, showToast } = useStore();
  const [fontes, setFontes] = useState<Fonte[]>(() => dasFontesSalvas(null, mes ? 0 : budget.total));
  const [salvando, setSalvando] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null); // linha com o valor em foco
  const [digitando, setDigitando] = useState(false); // qualquer campo em foco
  const valorRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nomeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // As fontes guardadas do mes (0054). Sem a migration, fica no valor unico.
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    void createClient()
      .rpc("mercado_budget_fontes_web", { p_mes: mes ?? null })
      .then(({ data, error }) => {
        const d = data as { ok?: boolean; total?: number; fontes?: { nome?: unknown; valor?: unknown }[] } | null;
        if (!vivo || error || !d?.ok) return;
        // Mes que vem sem nada definido ainda nasce vazio, nao com o do mes atual.
        if (mes && !d.fontes?.length) return;
        setFontes(dasFontesSalvas(d.fontes, Number(d.total) || 0));
      });
    return () => {
      vivo = false;
    };
  }, [open, mes]);

  const total = somar(fontes);
  const comValor = fontes.filter((f) => lerValor(f.valor) > 0);

  function mudar(i: number, patch: Partial<Fonte>) {
    setFontes((l) => l.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }

  // base null = "Outra": linha sem nome, foco no nome. Com nome: foco no valor.
  function adicionar(base: string | null) {
    // Linha vazia (sem nome e sem valor) e reaproveitada, em vez de sobrar em branco.
    const vazia = fontes.findIndex((f) => !f.nome.trim() && !f.valor);
    const i = vazia >= 0 ? vazia : fontes.length;
    const nome = base === null ? "" : nomeLivre(base, fontes.filter((_, k) => k !== vazia));
    // A linha nova e desenhada JA e o foco vai nela dentro do proprio toque: o iPhone
    // so abre o teclado com foco sincrono ao gesto (em rAF ele ignora).
    flushSync(() =>
      setFontes(vazia >= 0 ? fontes.map((f, k) => (k === i ? { nome, valor: "" } : f)) : [...fontes, { nome, valor: "" }]),
    );
    (base === null ? nomeRefs : valorRefs).current[i]?.focus();
  }

  function tirar(i: number) {
    setFontes((l) => (l.length === 1 ? [{ nome: "", valor: "" }] : l.filter((_, k) => k !== i)));
    setAtivo(null);
  }

  function somarNa(i: number, n: number) {
    mudar(i, { valor: valorTexto(+(lerValor(fontes[i].valor) + n).toFixed(2)) });
  }

  async function save() {
    if (total <= 0 || salvando) return;
    setSalvando(true);
    const sb = createClient();
    const { data, error } = await sb.rpc("mercado_budget_fontes_set_web", {
      p_fontes: paraSalvar(fontes),
      p_mes: mes ?? null,
    });
    const ok = !error && (data as { ok?: boolean } | null)?.ok;
    let semFontes = false;
    if (!ok) {
      if (error?.code !== "PGRST202") {
        setSalvando(false);
        return showToast("Não deu para salvar. Tente de novo.");
      }
      // Banco sem a 0054: o total ainda grava pelo caminho antigo.
      semFontes = true;
      if (mes) {
        const r = await sb.rpc("mercado_budget_mes_set_web", { p_total: total, p_mes: mes });
        if (r.error || !(r.data as { ok?: boolean } | null)?.ok) {
          setSalvando(false);
          return showToast(r.error?.code === "PGRST202" ? "Falta rodar a migration 0051." : "Não deu para salvar. Tente de novo.");
        }
      }
    }
    // Mes corrente: o store guarda o total para o resto do app.
    if (!mes) {
      const r = await setBudget(total);
      if (!r.ok) {
        setSalvando(false);
        return showToast(r.erro);
      }
    }
    setSalvando(false);
    showToast(
      semFontes && comValor.length > 1
        ? `Orçamento de ${brl(total)} salvo. Para guardar as fontes, falta rodar a migration 0054.`
        : `Orçamento de ${brl(total)} salvo`,
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={440}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onFocus={() => setDigitando(true)}
        // Pular de um campo para o outro nao conta como sair: o total nao pisca.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDigitando(false);
        }}
      >
        <div className="mb-1 text-[19px] font-extrabold">Definir orçamento</div>
        {!digitando && (
          <div className="mb-3 text-[14px] text-text-2">
            Some tudo o que vocês vão usar de mercado {mes ? `em ${nomeMes(mes)}` : "neste mês"}.
          </div>
        )}

        {/* Total: grande com a barra das fontes; uma linha so enquanto digita. */}
        {digitando ? (
          <div className="mb-3 flex items-baseline justify-between rounded-[14px] bg-brand-soft px-3.5 py-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-brand">Total</span>
            <span className="text-[22px] font-extrabold tabular-nums">{brl(total)}</span>
          </div>
        ) : (
          <div className="mb-3 rounded-[18px] bg-brand-soft p-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-brand">Total do mês</div>
            <div className="text-[30px] font-extrabold leading-tight tabular-nums">{brl(total)}</div>
            {comValor.length > 1 && (
              <>
                <div className="mt-3 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
                  {fontes.map((f, i) => {
                    const v = lerValor(f.valor);
                    return v > 0 ? (
                      <div
                        key={i}
                        className="h-full rounded-full transition-[flex-grow] duration-300"
                        style={{ flexGrow: v, flexBasis: 0, background: cor(i) }}
                      />
                    ) : null;
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {fontes.map((f, i) => {
                    const v = lerValor(f.valor);
                    return v > 0 ? (
                      <span key={i} className="flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cor(i) }} />
                        {f.nome.trim() || "Orçamento"} · {v / total < 0.01 ? "<1" : Math.round((v / total) * 100)}%
                      </span>
                    ) : null;
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Atalhos no topo, numa faixa so: sempre a vista, mesmo com o teclado aberto.
            onPointerDown sem foco: tocar nao fecha o teclado. */}
        {fontes.length < 12 && (
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => adicionar(s)}
                className="h-10 shrink-0 rounded-full border border-brand/40 bg-card px-3.5 text-[14px] font-bold text-brand active:scale-[0.96]"
              >
                + {s}
              </button>
            ))}
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => adicionar(null)}
              className="h-10 shrink-0 rounded-full border border-dashed border-text-3 px-3.5 text-[14px] font-bold text-text-2 active:scale-[0.96]"
            >
              + Outra
            </button>
          </div>
        )}

        {/* Uma linha por fonte. */}
        <ul className="mb-4 flex flex-col gap-2">
          {fontes.map((f, i) => {
            const emFoco = ativo === i;
            return (
              <li
                key={i}
                className={`rounded-[16px] border-2 bg-card-2 p-2 pl-3 transition-colors ${
                  emFoco ? "border-brand" : "border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor(i) }} />
                  <input
                    ref={(el) => {
                      nomeRefs.current[i] = el;
                    }}
                    value={f.nome}
                    onChange={(e) => mudar(i, { nome: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        valorRefs.current[i]?.focus();
                      }
                    }}
                    enterKeyHint="next"
                    placeholder="Nome"
                    aria-label={`Nome da fonte ${i + 1}`}
                    maxLength={40}
                    data-sem-limpar
                    className="h-11 min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none placeholder:font-medium placeholder:text-text-3"
                  />
                  <label className="flex h-12 w-[132px] shrink-0 items-center rounded-[12px] bg-card px-3 shadow-[0_1px_4px_var(--shadow)]">
                    <span className="mr-1.5 text-[14px] font-bold text-text-3">R$</span>
                    <input
                      ref={(el) => {
                        valorRefs.current[i] = el;
                      }}
                      value={f.valor}
                      onChange={(e) => mudar(i, { valor: formatarDigitando(e.target.value) })}
                      onFocus={() => setAtivo(i)}
                      onBlur={() => {
                        setAtivo((a) => (a === i ? null : a));
                        const n = lerValor(f.valor);
                        if (n > 0) mudar(i, { valor: valorTexto(n) });
                      }}
                      inputMode="decimal"
                      enterKeyHint="done"
                      placeholder="valor"
                      aria-label={`Valor de ${f.nome || `fonte ${i + 1}`}`}
                      data-sem-limpar
                      className="h-full w-full min-w-0 bg-transparent text-right text-[18px] font-extrabold tabular-nums outline-none placeholder:text-[15px] placeholder:font-medium placeholder:text-text-3"
                    />
                  </label>
                  {(fontes.length > 1 || f.valor || f.nome) && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => tirar(i)}
                      aria-label={`Tirar ${f.nome || `fonte ${i + 1}`}`}
                      className="flex h-11 w-8 shrink-0 items-center justify-center text-[15px] text-text-3"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Somar por toque, sem fechar o teclado. */}
                {emFoco && (
                  <div className="mt-2 flex gap-1.5">
                    {SOMAS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => somarNa(i, n)}
                        className="h-9 flex-1 rounded-full bg-card text-[14px] font-bold text-text-2 active:scale-[0.96]"
                      >
                        +{n}
                      </button>
                    ))}
                    {f.valor && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => mudar(i, { valor: "" })}
                        className="h-9 rounded-full px-3 text-[13px] font-bold text-text-3"
                      >
                        Zerar
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div data-rodape className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={total <= 0 || salvando}
            className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
          >
            {salvando ? "Salvando…" : total > 0 ? `Salvar ${brl(total)}` : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
