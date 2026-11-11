"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { FotoItem } from "@/components/ui/FotoItem";
import { valorLinhaCarrinho, valorLinhaNota, type Conferencia as Conf, type ItemNota } from "@/lib/conferencia";

// Tela da conferencia carrinho x nota (lib/conferencia). Responde de cara "por que o
// caixa deu mais?", com as fotos dos produtos para bater o olho, e fecha o ciclo: o que
// estava na nota e nao foi anotado entra na despensa, e o preco cobrado corrige o
// anotado.
export function Conferencia({
  conf,
  busy,
  mercado,
  onAplicar,
  onFechar,
}: {
  conf: Conf;
  busy: boolean;
  mercado?: string;
  onAplicar: (esquecidos: ItemNota[], corrigirPrecos: boolean) => void;
  onFechar: () => void;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(conf.soNaNota.map((_, i) => i)));
  const [verIguais, setVerIguais] = useState(false);
  const dif = Math.round((conf.totalNota - conf.totalCarrinho) * 100) / 100;
  const p = conf.partes;
  const nada = !conf.soNaNota.length && !conf.diferentes.length && !conf.soNoCarrinho.length;
  const nItens = marcados.size;
  const nPrecos = conf.diferentes.length;
  const card = "mx-4 mt-3 rounded-[24px] bg-card px-3.5 pb-2 pt-1.5";
  const linha = "flex items-center gap-3 border-t border-border py-2.5";
  const cab = "px-0.5 pb-1.5 pt-2.5 text-[16px] font-extrabold";
  const hoje = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const total = conf.totalCarrinho + p.esquecidos + Math.max(0, p.diferencas) || 1;

  return (
    <div className="flex min-h-full flex-col pb-4">
      <div className="flex items-center justify-between px-5 pb-2 pt-[max(18px,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-text-3">
            {mercado ? `${mercado} · ` : ""}hoje {hoje}
          </div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">Conferência da compra</h1>
        </div>
        <button onClick={onFechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-[18px] font-bold">
          ✕
        </button>
      </div>

      {/* O numero que importa primeiro: quanto o caixa cobrou a mais (ou a menos). */}
      <div className="mx-4 mt-2 flex flex-col gap-3.5 rounded-[28px] bg-[var(--barra)] p-5 text-white">
        {nada ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--barra-ativa)] text-[30px] font-extrabold text-[var(--barra-ativa-ink)]">✓</span>
            <span className="text-[26px] font-extrabold">Tudo bateu</span>
            <span className="text-[14px] text-white/65">Cada item da nota estava no carrinho, no mesmo valor.</span>
          </div>
        ) : (
          <>
            <div>
              <div className="text-[13px] font-semibold text-white/65">O caixa cobrou</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-[40px] font-extrabold tracking-[-0.03em] tabular-nums ${dif > 0 ? "text-[#FF8A3D]" : "text-[#4ADE80]"}`}>
                  {dif > 0 ? "+" : "−"}
                  {brl(Math.abs(dif))}
                </span>
                <span className="text-[15px] font-semibold text-white/65">{dif > 0 ? "a mais" : "a menos"}</span>
              </div>
            </div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <span className="bg-white/45" style={{ flex: conf.totalCarrinho / total }} />
              {p.esquecidos > 0 && <span className="bg-[#FF7A1A]" style={{ flex: p.esquecidos / total }} />}
              {p.diferencas > 0 && <span className="bg-[#F5B544]" style={{ flex: p.diferencas / total }} />}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <div className="text-[12px] font-semibold text-white/65">Você anotou</div>
            <div className="text-[20px] font-extrabold tabular-nums">{brl(conf.totalCarrinho)}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-white/65">Veio na nota</div>
            <div className="text-[20px] font-extrabold tabular-nums">{brl(conf.totalNota)}</div>
          </div>
        </div>
      </div>

      {!nada && (
        <>
          <div className="px-5 pb-1.5 pt-4 text-[13px] font-extrabold uppercase tracking-[0.06em] text-text-3">De onde vem a diferença</div>
          <div className="grid grid-cols-3 gap-2 px-4">
            <Motivo icone="+" tom="brand" txt={`Esqueceu de anotar · ${conf.soNaNota.length}`} v={p.esquecidos} />
            <Motivo icone="~" tom="warn" txt={`Preço diferente · ${conf.diferentes.length}`} v={p.diferencas} />
            <Motivo icone="−" tom="pos" txt={`Não veio na nota · ${conf.soNoCarrinho.length}`} v={-p.naoCobrados} />
          </div>
        </>
      )}

      {conf.soNaNota.length > 0 && (
        <div className={card}>
          <div className={`${cab} flex items-center justify-between`}>
            <span>Esqueceu de anotar</span>
            <span className="text-[12px] font-bold text-text-3">entra na despensa</span>
          </div>
          {conf.soNaNota.map((n, i) => (
            <label key={i} className={linha}>
              <FotoItem nome={n.nome} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold capitalize">{n.nome}</span>
                <span className="block truncate text-[12px] text-text-3">
                  {String(n.qtd).replace(".", ",")} {n.unidade} × {brl(n.preco)}
                </span>
              </span>
              <b className="shrink-0 text-[15px] tabular-nums text-brand">+{brl(valorLinhaNota(n)).replace("R$ ", "")}</b>
              <input
                type="checkbox"
                checked={marcados.has(i)}
                onChange={() =>
                  setMarcados((s) => {
                    const x = new Set(s);
                    if (x.has(i)) x.delete(i);
                    else x.add(i);
                    return x;
                  })
                }
                aria-label={`Pôr ${n.nome} na despensa`}
                className="m-0 h-6 w-6 shrink-0 accent-[var(--text)]"
              />
            </label>
          ))}
        </div>
      )}

      {conf.diferentes.length > 0 && (
        <div className={card}>
          <div className={cab}>Preço diferente</div>
          {conf.diferentes.map((x, i) => (
            <div key={i} className={linha}>
              <FotoItem nome={x.c.name} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold capitalize">{x.c.name}</span>
                <span className="block truncate text-[12px] text-text-3">
                  <s>{brl(valorLinhaCarrinho(x.c))}</s> → <b className="text-text">{brl(valorLinhaNota(x.n))}</b> no caixa
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold tabular-nums ${x.dif > 0 ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos"}`}>
                {x.dif > 0 ? "+" : "−"}
                {brl(Math.abs(x.dif)).replace("R$ ", "")}
              </span>
            </div>
          ))}
        </div>
      )}

      {conf.soNoCarrinho.length > 0 && (
        <div className={card}>
          <div className={`${cab} pb-0`}>Não veio na nota</div>
          <div className="px-0.5 pb-1.5 text-[12px] text-text-3">Pode ter vindo com outro nome, ou não foi cobrado.</div>
          {conf.soNoCarrinho.map((c, i) => (
            <div key={i} className={linha}>
              <FotoItem nome={c.name} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold capitalize">{c.name}</span>
                <span className="block truncate text-[12px] text-text-3">
                  {String(c.quantity).replace(".", ",")} {c.unit} × {brl(c.unit_price)}
                </span>
              </span>
              <b className="shrink-0 text-[15px] tabular-nums text-pos">−{brl(valorLinhaCarrinho(c)).replace("R$ ", "")}</b>
            </div>
          ))}
        </div>
      )}

      {conf.iguais.length > 0 && (
        <div className="mx-4 mt-3 rounded-[20px] bg-card">
          <button onClick={() => setVerIguais((v) => !v)} className="flex h-[52px] w-full items-center justify-between px-4 text-[15px] font-bold text-pos">
            <span>✓ {conf.iguais.length} {conf.iguais.length > 1 ? "itens bateram" : "item bateu"}</span>
            <span className="text-text-3">{verIguais ? "▲" : "▼"}</span>
          </button>
          {verIguais && (
            <div className="px-3.5 pb-2">
              {conf.iguais.map((x, i) => (
                <div key={i} className={linha}>
                  <FotoItem nome={x.c.name} className="h-9 w-9 shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold capitalize">{x.c.name}</span>
                  <span className="shrink-0 text-[14px] tabular-nums text-text-2">{brl(valorLinhaNota(x.n))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />
      <div className="sticky bottom-0 mt-4 flex flex-col gap-2 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {!nada && (
          <button
            onClick={() => onAplicar(conf.soNaNota.filter((_, i) => marcados.has(i)), nPrecos > 0)}
            disabled={busy || (nItens === 0 && nPrecos === 0)}
            className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-[var(--barra)] text-[16px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? "Atualizando…" : "Atualizar despensa"}
            {!busy && (nItens > 0 || nPrecos > 0) && (
              <span className="rounded-full bg-[var(--barra-ativa)] px-2.5 py-0.5 text-[13px] font-extrabold text-[var(--barra-ativa-ink)]">
                {[nItens ? `${nItens} ${nItens > 1 ? "itens" : "item"}` : "", nPrecos ? `${nPrecos} ${nPrecos > 1 ? "preços" : "preço"}` : ""].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>
        )}
        <button
          onClick={onFechar}
          className={nada ? "h-[58px] rounded-full bg-[var(--barra)] text-[16px] font-extrabold text-white" : "h-12 rounded-full text-[15px] font-bold text-text-2"}
        >
          {nada ? "Fechar" : "Agora não"}
        </button>
      </div>
    </div>
  );
}

const TOM = {
  brand: { fundo: "bg-brand-soft", texto: "text-brand" },
  warn: { fundo: "bg-warn-soft", texto: "text-warn" },
  pos: { fundo: "bg-pos-soft", texto: "text-pos" },
};

function Motivo({ icone, tom, txt, v }: { icone: string; tom: keyof typeof TOM; txt: string; v: number }) {
  const t = TOM[tom];
  const zero = Math.abs(v) < 0.005;
  return (
    <div className={`flex flex-col gap-2 rounded-[20px] bg-card p-3 ${zero ? "opacity-45" : ""}`}>
      <span className={`grid h-8 w-8 place-items-center rounded-[10px] text-[18px] font-extrabold ${t.fundo} ${t.texto}`} aria-hidden>
        {icone}
      </span>
      <span className="text-[12px] font-bold leading-tight text-text-2">{txt}</span>
      <span className={`text-[17px] font-extrabold tabular-nums ${t.texto}`}>
        {zero ? "0" : `${v > 0 ? "+" : "−"}${brl(Math.abs(v)).replace("R$ ", "")}`}
      </span>
    </div>
  );
}
