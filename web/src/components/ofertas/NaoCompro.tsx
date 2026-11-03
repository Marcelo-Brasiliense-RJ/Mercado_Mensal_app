"use client";

import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon } from "@/components/ui/icons";
import {
  casaBusca,
  ehExcesso,
  maisBarato,
  nomeCompleto,
  termoEvitar,
  textoMotivo,
  type Evitar,
  type Oferta,
} from "@/lib/ofertas";
import { findByName } from "@/lib/defaults";
import { Foto, Selo } from "./pecas";
import { desmarcarRuim, marcarNaoComprar, marcarRuim, useEvitar } from "./useEvitar";

// "Não comprar" (pedido do dono): uma lista so, com dois tipos separados.
// 👎 Produto ruim: a casa provou e nao quer mais; some das ofertas e o leitor avisa.
// 📦 Em excesso: tem demais em casa ("nao comprar leite esse mes"); fica em
// observacao, com o estoque do lado, ate poder comprar de novo. Nao esconde oferta.
// A voz poe aqui sozinha: "nao comprar X" entra como excesso; falou mal, entra como ruim.
export function NaoCompro({ ofertas, escondidas = 0 }: { ofertas: Oferta[]; escondidas?: number }) {
  const itens = useEvitar();
  const [aberto, setAberto] = useState(false);
  const [marcar, setMarcar] = useState(false);
  const ruins = itens.filter((e) => !ehExcesso(e));
  const excesso = itens.filter(ehExcesso);

  const resumo = [
    ruins.length ? `${ruins.length} ${ruins.length > 1 ? "ruins" : "ruim"}` : "",
    excesso.length ? `${excesso.length} em excesso` : "",
    escondidas ? `${escondidas} ofertas escondidas` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="flex flex-col gap-2.5">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left"
      >
        <span>
          <span className="block text-[16px] font-extrabold">🚫 Não comprar</span>
          <span className="block text-[12px] text-text-2">
            {resumo || "Produtos ruins e o que já tem demais em casa"}
          </span>
        </span>
        <span className={`text-[18px] text-text-3 ${aberto ? "rotate-180" : ""}`} aria-hidden>⌄</span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-3">
          <Grupo
            icone="📦"
            titulo="Em excesso"
            dica="Tem demais em casa. Fica de olho até baixar."
            vazio="Nada em excesso. Fale “não comprar leite esse mês” que entra aqui."
            itens={excesso}
          />
          <Grupo
            icone="👎"
            titulo="Produto ruim"
            dica="Não compra mais. Some das ofertas e o leitor avisa."
            vazio="Nenhum produto ruim marcado."
            itens={ruins}
          />
          <button
            onClick={() => setMarcar(true)}
            className="h-12 rounded-2xl border-2 border-dashed border-border text-[14px] font-bold text-text-2"
          >
            + Adicionar em Não comprar
          </button>
        </div>
      )}
      {marcar && <MarcarRuimModal ofertas={ofertas} onClose={() => setMarcar(false)} />}
    </section>
  );
}

function Grupo({
  icone,
  titulo,
  dica,
  vazio,
  itens,
}: {
  icone: string;
  titulo: string;
  dica: string;
  vazio: string;
  itens: Evitar[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="px-1">
        <div className="text-[15px] font-extrabold">
          {icone} {titulo} <span className="font-bold text-text-3">({itens.length})</span>
        </div>
        <div className="text-[12px] text-text-3">{dica}</div>
      </div>
      {itens.length ? (
        itens.map((e) => <Cartao key={e.id} e={e} />)
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-3 py-2.5 text-[13px] text-text-3">{vazio}</p>
      )}
    </div>
  );
}

function Cartao({ e }: { e: Evitar }) {
  const { showToast, stock } = useStore();
  const excesso = ehExcesso(e);
  const motivo = textoMotivo(e);
  // Excesso e monitorado pelo estoque: mostra quanto tem e avisa quando baixou.
  const emCasa = excesso ? findByName(e.nome, stock) : undefined;
  const liberado = !!emCasa && emCasa.normal > 0 && emCasa.current <= emCasa.normal;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-card p-2.5 pr-1 ${
        excesso ? "border-warn/40" : "border-neg/30"
      }`}
    >
      {e.foto || e.tem_foto ? (
        <Foto
          src={e.foto ?? `/api/oferta-foto?evitar=${e.id}`}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
      ) : (
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[24px] ${
            excesso ? "bg-warn-soft" : "bg-neg-soft"
          }`}
          aria-hidden
        >
          {excesso ? "📦" : "👎"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold">{e.nome}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
              excesso ? "bg-warn-soft text-warn" : "bg-neg-soft text-neg"
            }`}
          >
            {excesso ? "Em excesso" : "Produto ruim"}
          </span>
        </div>
        <div className="line-clamp-2 text-[12px] leading-snug text-text-2">
          {excesso
            ? liberado
              ? `✓ Já baixou: tem ${emCasa!.current} ${emCasa!.unit}. Pode comprar de novo.`
              : emCasa
                ? `Tem ${emCasa.current} ${emCasa.unit} em casa (normal ${emCasa.normal})${motivo ? ` · ${motivo}` : ""}`
                : motivo || "Tem demais em casa"
            : motivo || "Não aparece nas ofertas"}
        </div>
      </div>
      <button
        onClick={async () =>
          showToast(
            (await desmarcarRuim(e.id))
              ? excesso
                ? `${e.nome} liberado para comprar`
                : `${e.nome} voltou a aparecer`
              : "Não deu para tirar.",
          )
        }
        aria-label={`Tirar ${e.nome} do Não comprar`}
        className={`shrink-0 rounded-full px-3 text-[13px] font-bold ${
          liberado ? "h-9 bg-pos text-pos-ink" : "grid h-11 w-11 place-items-center px-0 text-[20px] text-text-3"
        }`}
      >
        {liberado ? "Liberar" : "×"}
      </button>
    </div>
  );
}

function MarcarRuimModal({ ofertas, onClose }: { ofertas: Oferta[]; onClose: () => void }) {
  const { showToast } = useStore();
  const [tipo, setTipo] = useState<"excesso" | "ruim">("excesso");
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
    const ok =
      tipo === "excesso"
        ? await marcarNaoComprar(nome, "excesso", motivo)
        : await marcarRuim({ termo, nome, motivo, oferta: oferta?.id });
    setBusy(false);
    if (!ok) return showToast("Não deu para guardar.");
    showToast(tipo === "excesso" ? `📦 ${nome}: em excesso, não comprar` : `👎 ${nome}: não aparece mais nas ofertas`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={520}>
      <div className="pr-10 text-[22px] font-extrabold">Não comprar</div>
      <div className="mb-3 mt-2 grid grid-cols-2 gap-2">
        {(
          [
            ["excesso", "📦", "Em excesso", "Tem demais em casa"],
            ["ruim", "👎", "Produto ruim", "Não compra mais"],
          ] as const
        ).map(([k, ic, nome, sub]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTipo(k)}
            className={`rounded-2xl border-2 p-3 text-left ${
              tipo === k ? (k === "ruim" ? "border-neg bg-neg-soft" : "border-warn bg-warn-soft") : "border-border bg-card"
            }`}
          >
            <span className="block text-[22px]" aria-hidden>{ic}</span>
            <span className="block text-[15px] font-extrabold">{nome}</span>
            <span className="block text-[12px] text-text-2">{sub}</span>
          </button>
        ))}
      </div>
      <p className="mb-3 text-[13px] text-text-2">
        {tipo === "ruim"
          ? "Escreva o produto com a marca. Ele some das ofertas."
          : "Escreva o produto. Ele fica de olho até o estoque baixar."}
      </p>
      <label className="relative mb-2 block">
        <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={tipo === "ruim" ? "Ex.: café marca x" : "Ex.: leite"}
          className={`h-14 w-full rounded-2xl border-2 border-border bg-card pl-12 pr-4 text-[17px] outline-none ${tipo === "ruim" ? "focus:border-neg" : "focus:border-warn"}`}
        />
      </label>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder={tipo === "ruim" ? "Por quê? (opcional) Ex.: aguado, rasga fácil" : "Obs. (opcional) Ex.: 6 caixas na despensa"}
        className="mb-3 h-12 w-full rounded-2xl border border-border bg-card-2 px-4 text-[15px]"
      />
      {t.length >= 2 && (
        <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          <button
            disabled={busy}
            onClick={() => guardar(termoEvitar(t), t)}
            className="rounded-2xl border-2 border-neg bg-neg-soft p-3 text-left text-[15px] font-extrabold text-neg disabled:opacity-50"
          >
            {tipo === "ruim" ? "👎" : "📦"} Marcar “{t}”
          </button>
          {tipo === "ruim" && sugestoes.map((o) => (
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
