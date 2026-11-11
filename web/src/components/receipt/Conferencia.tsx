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
  onAplicar,
  onFechar,
}: {
  conf: Conf;
  busy: boolean;
  onAplicar: (esquecidos: ItemNota[], corrigirPrecos: boolean) => void;
  onFechar: () => void;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(conf.soNaNota.map((_, i) => i)));
  const [verIguais, setVerIguais] = useState(false);
  const dif = Math.round((conf.totalNota - conf.totalCarrinho) * 100) / 100;
  const p = conf.partes;
  const linha = "flex items-center gap-2.5 py-2";
  const titulo = "mb-1 mt-4 text-[12px] font-extrabold uppercase tracking-[0.06em] text-text-3";
  const nada = !conf.soNaNota.length && !conf.diferentes.length && !conf.soNoCarrinho.length;

  return (
    <>
      <div className="mb-1 text-[20px] font-extrabold">🧾 Carrinho × nota</div>
      <div className="grid grid-cols-3 gap-2 rounded-[18px] bg-card-2 p-3 text-center">
        <div>
          <div className="text-[11px] font-bold text-text-3">Anotado</div>
          <div className="text-[16px] font-extrabold tabular-nums">{brl(conf.totalCarrinho)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-text-3">Na nota</div>
          <div className="text-[16px] font-extrabold tabular-nums">{brl(conf.totalNota)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-text-3">Diferença</div>
          <div className={`text-[16px] font-extrabold tabular-nums ${Math.abs(dif) < 0.05 ? "text-pos" : dif > 0 ? "text-neg" : "text-pos"}`}>
            {Math.abs(dif) < 0.05 ? "✓ 0" : `${dif > 0 ? "+" : "−"}${brl(Math.abs(dif))}`}
          </div>
        </div>
      </div>

      {nada ? (
        <p className="mt-3 rounded-[14px] bg-pos-soft p-3 text-center text-[15px] font-extrabold text-pos">🎉 Tudo bateu: cada item da nota estava no carrinho, no mesmo valor.</p>
      ) : (
        <div className="mt-2 space-y-1 text-[13px]">
          {p.esquecidos > 0 && <Motivo txt={`Esqueceu de anotar ${conf.soNaNota.length}`} v={p.esquecidos} />}
          {Math.abs(p.diferencas) >= 0.05 && <Motivo txt={`Valor diferente em ${conf.diferentes.length}`} v={p.diferencas} />}
          {p.naoCobrados > 0 && <Motivo txt={`Anotou e não veio na nota ${conf.soNoCarrinho.length}`} v={-p.naoCobrados} />}
        </div>
      )}

      {conf.soNaNota.length > 0 && (
        <>
          <div className={titulo}>Na nota, não anotado · entra na despensa</div>
          <ul className="divide-y divide-border">
            {conf.soNaNota.map((n, i) => (
              <li key={i}>
                <label className={linha}>
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
                    className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                  />
                  <FotoItem nome={n.nome} className="h-9 w-9 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{n.nome}</span>
                    <span className="block truncate text-[12px] text-text-3">
                      {String(n.qtd).replace(".", ",")} {n.unidade} × {brl(n.preco)}
                    </span>
                  </span>
                  <b className="shrink-0 text-[15px] tabular-nums text-neg">+{brl(valorLinhaNota(n))}</b>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {conf.diferentes.length > 0 && (
        <>
          <div className={titulo}>Valor diferente do anotado</div>
          <ul className="divide-y divide-border">
            {conf.diferentes.map((x, i) => (
              <li key={i} className={linha}>
                <FotoItem nome={x.c.name} className="h-9 w-9 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{x.c.name}</span>
                  <span className="block truncate text-[12px] text-text-3">
                    anotou {brl(valorLinhaCarrinho(x.c))} → nota {brl(valorLinhaNota(x.n))}
                  </span>
                </span>
                <b className={`shrink-0 text-[15px] tabular-nums ${x.dif > 0 ? "text-neg" : "text-pos"}`}>
                  {x.dif > 0 ? "+" : "−"}
                  {brl(Math.abs(x.dif))}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}

      {conf.soNoCarrinho.length > 0 && (
        <>
          <div className={titulo}>Anotado e não achei na nota</div>
          <ul className="divide-y divide-border">
            {conf.soNoCarrinho.map((c, i) => (
              <li key={i} className={linha}>
                <FotoItem nome={c.name} className="h-9 w-9 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{c.name}</span>
                <b className="shrink-0 text-[15px] tabular-nums text-text-2">{brl(valorLinhaCarrinho(c))}</b>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-text-3">Pode ter vindo na nota com outro nome, ou não ter sido cobrado.</p>
        </>
      )}

      {conf.iguais.length > 0 && (
        <button onClick={() => setVerIguais((v) => !v)} className={`${titulo} flex w-full items-center justify-between`}>
          <span>✓ Bateram {conf.iguais.length}</span>
          <span>{verIguais ? "▲" : "▼"}</span>
        </button>
      )}
      {verIguais && (
        <ul className="divide-y divide-border">
          {conf.iguais.map((x, i) => (
            <li key={i} className={linha}>
              <FotoItem nome={x.c.name} className="h-8 w-8 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{x.c.name}</span>
              <span className="shrink-0 text-[14px] tabular-nums text-text-2">{brl(valorLinhaNota(x.n))}</span>
            </li>
          ))}
        </ul>
      )}

      <div data-rodape className="mt-4 flex flex-col gap-2">
        {!nada && (
          <button
            onClick={() => onAplicar(conf.soNaNota.filter((_, i) => marcados.has(i)), conf.diferentes.length > 0)}
            disabled={busy}
            className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
          >
            {busy ? "Atualizando…" : "Atualizar despensa e preços pela nota"}
          </button>
        )}
        <button onClick={onFechar} className="h-12 rounded-full border border-border bg-card text-[15px] font-bold">
          {nada ? "Fechar" : "Agora não"}
        </button>
      </div>
    </>
  );
}

function Motivo({ txt, v }: { txt: string; v: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-card-2 px-3 py-2 font-bold">
      <span className="text-text-2">{txt}</span>
      <span className={`tabular-nums ${v > 0 ? "text-neg" : "text-pos"}`}>
        {v > 0 ? "+" : "−"}
        {brl(Math.abs(v))}
      </span>
    </div>
  );
}
