"use client";

import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon } from "@/components/ui/icons";
import { casaBusca, maisBarato, nomeCompleto, termoEvitar, type Oferta } from "@/lib/ofertas";
import { Foto, Selo } from "./pecas";
import { desmarcarRuim, marcarRuim, useEvitar } from "./useEvitar";

// Lista "Não compro": marcas que a casa ja provou e nao quer mais. Fica fechada por
// padrao (e consulta, nao uso diario); o efeito aparece no resto do app: essas ofertas
// somem e ler o codigo delas no mercado mostra o aviso.
export function NaoCompro({ ofertas, escondidas = 0 }: { ofertas: Oferta[]; escondidas?: number }) {
  const itens = useEvitar();
  const { showToast } = useStore();
  const [aberto, setAberto] = useState(false);
  const [marcar, setMarcar] = useState(false);

  return (
    <section className="flex flex-col gap-2.5">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left"
      >
        <span>
          <span className="block text-[16px] font-extrabold">👎 Não compro</span>
          <span className="block text-[12px] text-text-2">
            {itens.length
              ? `${itens.length} ${itens.length > 1 ? "produtos ruins" : "produto ruim"}${escondidas ? ` · ${escondidas} ofertas escondidas` : ""}`
              : "Produtos ruins que você não quer ver nas ofertas"}
          </span>
        </span>
        <span className={`text-[18px] text-text-3 ${aberto ? "rotate-180" : ""}`} aria-hidden>⌄</span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-2">
          {itens.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-neg/30 bg-card p-2.5 pr-1">
              <Foto
                src={e.foto ?? (e.tem_foto ? `/api/oferta-foto?evitar=${e.id}` : undefined)}
                className="h-12 w-12 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-extrabold">{e.nome}</div>
                <div className="truncate text-[12px] text-text-2">{e.motivo ?? "Não aparece nas ofertas"}</div>
              </div>
              <button
                onClick={async () => showToast((await desmarcarRuim(e.id)) ? `${e.nome} voltou a aparecer` : "Não deu para tirar.")}
                aria-label={`Tirar ${e.nome} do Não compro`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[20px] text-text-3"
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={() => setMarcar(true)} className="h-12 rounded-2xl border-2 border-dashed border-neg/40 text-[14px] font-bold text-neg">
            + Marcar produto ruim
          </button>
          <p className="px-1 text-[12px] text-text-3">
            Também dá para marcar no 👎 de cada oferta ou no leitor de código.
          </p>
        </div>
      )}
      {marcar && <MarcarRuimModal ofertas={ofertas} onClose={() => setMarcar(false)} />}
    </section>
  );
}

function MarcarRuimModal({ ofertas, onClose }: { ofertas: Oferta[]; onClose: () => void }) {
  const { showToast } = useStore();
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const t = texto.trim();
  const sugestoes = useMemo(() => {
    if (t.length < 2) return [];
    const vistos = new Set<string>();
    return ofertas
      .filter((o) => casaBusca(o, t))
      .sort(maisBarato)
      .filter((o) => {
        const k = termoEvitar(o.produto, o.marca);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 8);
  }, [ofertas, t]);

  async function guardar(termo: string, nome: string, oferta?: Oferta) {
    setBusy(true);
    const ok = await marcarRuim({ termo, nome, motivo, oferta: oferta?.id });
    setBusy(false);
    if (!ok) return showToast("Não deu para guardar.");
    showToast(`👎 ${nome}: não aparece mais nas ofertas`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={520}>
      <div className="pr-10 text-[22px] font-extrabold">Produto ruim</div>
      <p className="mb-3 text-[13px] text-text-2">Escreva o produto com a marca. Ele some das ofertas.</p>
      <label className="relative mb-2 block">
        <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: café marca x"
          className="h-14 w-full rounded-2xl border-2 border-border bg-card pl-12 pr-4 text-[17px] outline-none focus:border-neg"
        />
      </label>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por quê? (opcional) Ex.: aguado, rasga fácil"
        className="mb-3 h-12 w-full rounded-2xl border border-border bg-card-2 px-4 text-[15px]"
      />
      {t.length >= 2 && (
        <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          <button
            disabled={busy}
            onClick={() => guardar(termoEvitar(t), t)}
            className="rounded-2xl border-2 border-neg bg-neg-soft p-3 text-left text-[15px] font-extrabold text-neg disabled:opacity-50"
          >
            👎 Marcar “{t}”
          </button>
          {sugestoes.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => guardar(termoEvitar(o.produto, o.marca), nomeCompleto(o), o)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left disabled:opacity-50"
            >
              <Foto o={o} className="h-12 w-12 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[14px] font-bold leading-tight">{nomeCompleto(o)}</div>
                <div className="mt-1 flex items-center gap-2 text-[12px]">
                  <Selo mercado={o.mercado} />
                  <span className="font-bold tabular-nums">{brl(o.preco_por)}</span>
                </div>
              </div>
              <span className="text-[20px]" aria-hidden>👎</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// 👎 no canto da foto do card de oferta.
export function Polegar({ o }: { o: Oferta }) {
  const { showToast } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        const ok = await marcarRuim({ termo: termoEvitar(o.produto, o.marca), nome: nomeCompleto(o), oferta: o.id });
        setBusy(false);
        showToast(ok ? `👎 ${o.produto}: não aparece mais (desfaça em Não compro)` : "Não deu para marcar.");
      }}
      aria-label={`Marcar ${o.produto} como ruim`}
      className="absolute left-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-card/90 text-[18px] shadow-[0_1px_4px_var(--shadow)]"
    >
      👎
    </button>
  );
}
