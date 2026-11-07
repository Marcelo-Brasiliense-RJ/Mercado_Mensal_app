"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { nomeMes } from "@/lib/economia";
import { brl } from "@/lib/format";
import {
  dasFontesSalvas,
  lerValor,
  nomeLivre,
  paraSalvar,
  somar,
  SUGESTOES,
  valorTexto,
  type Fonte,
} from "@/lib/orcamentoFontes";

// Orcamento do mes montado por fontes: "VR Marcelo 600 + VR Bianca 500 + Dinheiro
// 150". O total e a soma e e ele que vale em todo o app (0054). Uma linha so
// continua sendo o jeito simples de sempre: digitar o valor e salvar.

// Cor de cada fonte na barra e no ponto da linha (tokens do tema, claro e escuro).
const CORES = ["var(--brand)", "var(--pos)", "var(--warn)", "var(--text-2)", "var(--neg)"];
const cor = (i: number) => CORES[i % CORES.length];

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
  const [fontes, setFontes] = useState<Fonte[]>(() =>
    dasFontesSalvas(null, mes ? 0 : budget.total),
  );
  const [salvando, setSalvando] = useState(false);
  // Foco na linha recem-criada pelo atalho (valor) ou pelo "Outra" (nome).
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
  const variasFontes = fontes.length > 1;

  function mudar(i: number, patch: Partial<Fonte>) {
    setFontes((l) => l.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }

  // base null = "Outra": linha sem nome, foco no nome.
  function adicionar(base: string | null) {
    // Primeira linha ainda sem nome ganha o nome do atalho, em vez de sobrar vazia.
    const reusa = base !== null && fontes.length === 1 && !fontes[0].nome.trim();
    const i = reusa ? 0 : fontes.length;
    setFontes(
      reusa
        ? [{ ...fontes[0], nome: nomeLivre(base, []) }]
        : [...fontes, { nome: base === null ? "" : nomeLivre(base, fontes), valor: "" }],
    );
    requestAnimationFrame(() => (base === null ? nomeRefs : valorRefs).current[i]?.focus());
  }

  function tirar(i: number) {
    setFontes((l) => (l.length === 1 ? [{ nome: "", valor: "" }] : l.filter((_, k) => k !== i)));
  }

  async function save() {
    if (total <= 0 || salvando) return;
    setSalvando(true);
    const sb = createClient();
    // Caminho novo: grava as fontes e o total (0054).
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
      semFontes && variasFontes
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
      >
        <div className="mb-1.5 text-[19px] font-extrabold">Definir orçamento</div>
        <div className="mb-4 text-[14px] text-text-2">
          Quanto você quer gastar de mercado {mes ? `em ${nomeMes(mes)}` : "neste mês"}? Junte
          VR, VA, dinheiro… o total é a soma.
        </div>

        {/* Total em destaque, com a barra de quanto cada fonte pesa. */}
        <div className="mb-4 rounded-[18px] bg-brand-soft p-4">
          <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-brand">Total do mês</div>
          <div className="text-[30px] font-extrabold leading-tight text-text tabular-nums">{brl(total)}</div>
          {comValor.length > 1 && (
            <>
              <div className="mt-3 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
                {fontes.map((f, i) => {
                  const v = lerValor(f.valor);
                  if (v <= 0) return null;
                  return (
                    <div
                      key={i}
                      className="h-full rounded-full transition-[flex-grow] duration-300"
                      style={{ flexGrow: v, flexBasis: 0, background: cor(i) }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {fontes.map((f, i) => {
                  const v = lerValor(f.valor);
                  if (v <= 0) return null;
                  return (
                    <span key={i} className="flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cor(i) }} />
                      {f.nome.trim() || "Orçamento"} · {Math.round((v / total) * 100)}%
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Uma linha por fonte: nome e valor. */}
        <ul className="mb-3 flex flex-col gap-2">
          {fontes.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-[14px] border border-border bg-card-2 p-1.5 pl-3"
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor(i) }} />
              <input
                ref={(el) => {
                  nomeRefs.current[i] = el;
                }}
                value={f.nome}
                onChange={(e) => mudar(i, { nome: e.target.value })}
                placeholder={variasFontes ? "Ex.: VR Bianca" : "De onde vem (opcional)"}
                aria-label={`Nome da fonte ${i + 1}`}
                maxLength={40}
                data-sem-limpar
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-text-3"
              />
              <div className="flex h-10 w-[118px] shrink-0 items-center rounded-[10px] border border-border bg-card px-2.5 focus-within:border-brand">
                <span className="mr-1 text-[13px] font-bold text-text-3">R$</span>
                <input
                  ref={(el) => {
                    valorRefs.current[i] = el;
                  }}
                  value={f.valor}
                  onChange={(e) => mudar(i, { valor: e.target.value })}
                  onBlur={() => {
                    const n = lerValor(f.valor);
                    if (n > 0) mudar(i, { valor: valorTexto(n) });
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={`Valor de ${f.nome || `fonte ${i + 1}`}`}
                  autoFocus={i === 0 && !f.valor}
                  data-sem-limpar
                  className="h-full w-full min-w-0 bg-transparent text-right text-[16px] font-bold tabular-nums outline-none"
                />
              </div>
              {(variasFontes || f.valor || f.nome) && (
                <button
                  type="button"
                  onClick={() => tirar(i)}
                  aria-label={`Tirar ${f.nome || `fonte ${i + 1}`}`}
                  className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-[15px] text-text-3"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Atalhos: um toque cria a linha com o nome e ja foca o valor. */}
        {fontes.length < 12 && (
          <div className="mb-5">
            <div className="mb-2 text-[12px] font-bold text-text-2">Adicionar fonte</div>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => adicionar(s)}
                  className="h-10 rounded-full border border-border bg-card px-3.5 text-[14px] font-bold active:scale-[0.97]"
                >
                  + {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => adicionar(null)}
                className="h-10 rounded-full border border-dashed border-border px-3.5 text-[14px] font-bold text-text-2 active:scale-[0.97]"
              >
                + Outra
              </button>
            </div>
          </div>
        )}

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
