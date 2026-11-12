"use client";

import { useEffect, useRef, useState } from "react";
import { FotoItem } from "@/components/ui/FotoItem";
import { brl } from "@/lib/format";
import { ondeFica, prova, sugerirProdutos, type LinhaNota } from "@/lib/faltaNaNota";

// "45 de 46 itens · 97% · Falta 1 item" na nota lida, e a ajuda para achar e preencher o
// que faltou (pedido do dono, 2026-11-12): a IA olha a foto de novo sabendo o que JA foi
// lido e diz entre quais linhas esta o item de fora (ou qual quantidade veio errada), com
// o texto como esta impresso. A pessoa confere na nota, toca em Preencher (ja vem nome,
// quantidade e preco) e o item entra na compra; o contador chega a 100%.

type Faltante = {
  tipo: "linha" | "quantidade" | "repetida";
  texto: string;
  nome: string;
  marca: string;
  qtd: number;
  unidade: string;
  preco: number;
  depoisDe: number;
  indice: number;
};
type Produto = { name: string; unit: string; priceLast: number | null };

export function FaltaNaNota({
  itens,
  noCupom,
  fotos,
  produtos,
  onAdicionar,
  onCorrigirQtd,
  onRemover,
}: {
  itens: LinhaNota[]; // na ordem do cupom
  noCupom: number; // "Qtde. total de itens" do rodape
  fotos: string[];
  produtos: Produto[];
  onAdicionar: (item: LinhaNota, depoisDe: number) => void;
  onCorrigirQtd: (indice: number, qtd: number) => void; // indice 1..
  onRemover: (indice: number) => void; // linha repetida na leitura (indice 1..)
}) {
  const pr = prova(itens, noCupom);
  const [busca, setBusca] = useState<"idle" | "procurando" | "achou" | "nada" | "erro">("idle");
  const [faltam, setFaltam] = useState<Faltante[]>([]);
  const [form, setForm] = useState<{ nome: string; qtd: string; preco: string; depoisDe: number; texto?: string } | null>(null);
  const procurouCom = useRef(-1);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Segunda olhada na foto, uma vez por contagem (preencheu um e ainda falta: procura de novo)
  const falta = (pr?.falta ?? 0) + (pr?.sobra ?? 0); // sobrou tambem procura (a linha repetida)
  const lidos = pr?.lidos ?? 0;
  useEffect(() => {
    if (!falta || !fotos.length || procurouCom.current === lidos) return;
    procurouCom.current = lidos;
    setBusca("procurando");
    fetch("/api/receipt-ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: fotos,
        falta: { lidos: itens.map((i) => ({ nome: i.nome, qtd: i.qtd, unidade: i.unidade, preco: i.preco })), qtd_itens: noCupom, contados: lidos },
      }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; faltam?: Faltante[] }) => {
        if (!montado.current) return;
        if (!d?.ok) return setBusca("erro");
        setFaltam(d.faltam ?? []);
        setBusca(d.faltam?.length ? "achou" : "nada");
      })
      .catch(() => montado.current && setBusca("erro"));
  }, [lidos, falta, fotos, itens, noCupom]);

  if (!pr) return null;
  const ok = pr.falta === 0 && pr.sobra === 0;
  const sug = form ? sugerirProdutos(form.nome, produtos) : [];
  const valorForm = form ? (Number(form.qtd.replace(",", ".")) || 0) * (Number(form.preco.replace(",", ".")) || 0) : 0;

  function preencher(f?: Faltante) {
    setForm({
      nome: f?.nome ?? "",
      qtd: f ? String(f.qtd).replace(".", ",") : "1",
      preco: f?.preco ? f.preco.toFixed(2).replace(".", ",") : "",
      depoisDe: f?.depoisDe ?? itens.length,
      texto: f?.texto,
    });
  }
  function salvarForm() {
    if (!form) return;
    const qtd = Number(form.qtd.replace(",", ".")) || 1;
    const preco = Number(form.preco.replace(",", ".")) || 0;
    if (!form.nome.trim() || !preco) return;
    const unidade = produtos.find((p) => p.name.toLowerCase() === form.nome.trim().toLowerCase())?.unit ?? "un";
    onAdicionar({ nome: form.nome.trim().toLowerCase(), qtd, unidade, preco }, form.depoisDe);
    setFaltam((l) => l.filter((f) => !(f.tipo === "linha" && f.depoisDe === form.depoisDe && f.nome === form.nome)));
    setForm(null);
  }

  return (
    <div className="mx-4 mt-3 rounded-[24px] bg-card p-3.5">
      {/* Contador: itens lidos x itens do cupom */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[15px] font-extrabold tabular-nums">
          {pr.lidos} de {pr.noCupom} itens
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums ${ok ? "bg-pos-soft text-pos" : "bg-warn-soft text-warn"}`}>{pr.pct}%</span>
        {ok ? (
          <span className="rounded-full bg-pos-soft px-2.5 py-0.5 text-[13px] font-extrabold text-pos">✓ batendo com a nota</span>
        ) : pr.falta ? (
          <span className="rounded-full bg-neg px-2.5 py-0.5 text-[13px] font-extrabold text-white">
            Falta {pr.falta} {pr.falta === 1 ? "item" : "itens"}
          </span>
        ) : (
          <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[13px] font-extrabold text-warn">
            {pr.sobra} a mais: confira as quantidades
          </span>
        )}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className={`h-full rounded-full ${ok ? "bg-pos" : "bg-warn"}`} style={{ width: `${pr.pct}%` }} />
      </div>

      {falta > 0 && !form && (
        <div className="mt-3">
          {busca === "procurando" && <p className="text-[14px] text-text-2">🔎 Olhando a nota de novo para achar onde está…</p>}

          {busca === "achou" &&
            faltam.map((f, k) => {
              if (f.tipo === "repetida") {
                const lida = itens[f.indice - 1];
                if (!lida) return null;
                return (
                  <div key={k} className="mt-2 rounded-[16px] border-2 border-dashed border-warn p-3">
                    <div className="text-[14px] font-extrabold">
                      <span className="capitalize">{lida.nome}</span> ({String(lida.qtd).replace(".", ",")} × {brl(lida.preco)}) entrou repetido na leitura
                    </div>
                    {f.texto && <div className="mt-1 rounded-[8px] bg-card-2 px-2 py-1 font-mono text-[12px]">{f.texto}</div>}
                    <button
                      type="button"
                      onClick={() => {
                        setFaltam((l) => l.filter((x) => x !== f));
                        onRemover(f.indice);
                      }}
                      className="mt-2 h-10 w-full rounded-full bg-[var(--barra)] text-[14px] font-extrabold text-white"
                    >
                      Tirar a linha repetida
                    </button>
                  </div>
                );
              }
              if (f.tipo === "quantidade") {
                const lida = itens[f.indice - 1];
                if (!lida) return null;
                return (
                  <div key={k} className="mt-2 rounded-[16px] border-2 border-dashed border-warn p-3">
                    <div className="text-[14px] font-extrabold">
                      Quantidade de <span className="capitalize">{lida.nome}</span>: a nota diz {String(f.qtd).replace(".", ",")}, li {String(lida.qtd).replace(".", ",")}
                    </div>
                    {f.texto && <div className="mt-1 rounded-[8px] bg-card-2 px-2 py-1 font-mono text-[12px]">{f.texto}</div>}
                    <button type="button" onClick={() => onCorrigirQtd(f.indice, f.qtd)} className="mt-2 h-10 w-full rounded-full bg-[var(--barra)] text-[14px] font-extrabold text-white">
                      Corrigir para {String(f.qtd).replace(".", ",")}
                    </button>
                  </div>
                );
              }
              const o = ondeFica(itens, f.depoisDe);
              return (
                <div key={k} className="mt-2 rounded-[16px] border-2 border-dashed border-neg p-3">
                  <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-text-3">Na nota, procure</div>
                  <div className="mt-0.5 text-[14px] leading-snug">
                    {o.acima ? (
                      <>
                        depois de <b className="capitalize">{o.acima}</b>
                      </>
                    ) : (
                      <b>no começo da lista</b>
                    )}
                    {o.abaixo ? (
                      <>
                        {" "}
                        e antes de <b className="capitalize">{o.abaixo}</b>
                      </>
                    ) : (
                      <> (última linha antes do TOTAL)</>
                    )}
                  </div>
                  {f.texto && <div className="mt-1.5 rounded-[8px] bg-card-2 px-2 py-1 font-mono text-[12px]">{f.texto}</div>}
                  <div className="mt-1.5 flex items-center gap-2 text-[14px]">
                    <span className="min-w-0 flex-1 truncate font-bold capitalize">{f.nome}</span>
                    <span className="shrink-0 tabular-nums text-text-2">
                      {String(f.qtd).replace(".", ",")} × {brl(f.preco)}
                    </span>
                  </div>
                  <button type="button" onClick={() => preencher(f)} className="mt-2 h-10 w-full rounded-full bg-[var(--barra)] text-[14px] font-extrabold text-white">
                    Preencher este item
                  </button>
                </div>
              );
            })}

          {(busca === "nada" || busca === "erro" || busca === "idle") && (
            <p className="text-[13px] leading-snug text-text-2">
              {busca === "erro" ? "Não consegui olhar a nota de novo agora." : busca === "nada" ? "Não achei sozinho onde está." : ""}{" "}
              {pr.falta > 0 ? "Compare a nota com os itens abaixo e preencha o que faltou." : "Confira as quantidades dos itens abaixo."}
            </p>
          )}
          {busca !== "procurando" && pr.falta > 0 && (
            <button type="button" onClick={() => preencher()} className="mt-2 h-10 w-full rounded-full border border-border text-[14px] font-bold">
              + Preencher outro item
            </button>
          )}
        </div>
      )}

      {/* Preencher: nome com sugestao dos produtos da casa (foto e ultimo preco) */}
      {form && (
        <div className="mt-3 rounded-[16px] bg-card-2 p-3">
          {form.texto && <div className="mb-2 rounded-[8px] bg-card px-2 py-1 font-mono text-[12px]">{form.texto}</div>}
          <label className="block text-[12px] font-bold text-text-3">Produto</label>
          <input
            autoFocus
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="ex.: desinfetante"
            className="mt-1 h-11 w-full rounded-[12px] border border-border bg-card px-3 text-[16px]"
          />
          {sug.length > 0 && !sug.some((p) => p.name.toLowerCase() === form.nome.trim().toLowerCase()) && (
            <ul className="mt-1 overflow-hidden rounded-[12px] border border-border bg-card">
              {sug.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, nome: p.name, preco: form.preco || (p.priceLast ? p.priceLast.toFixed(2).replace(".", ",") : "") })}
                    className="flex w-full items-center gap-2.5 border-t border-border px-2.5 py-2 text-left first:border-t-0"
                  >
                    <FotoItem nome={p.name} className="h-8 w-8 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold capitalize">{p.name}</span>
                    {p.priceLast ? <span className="shrink-0 text-[13px] tabular-nums text-text-3">últ. {brl(p.priceLast)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[12px] font-bold text-text-3">Quantidade</label>
              <input inputMode="decimal" value={form.qtd} onChange={(e) => setForm({ ...form, qtd: e.target.value })} className="mt-1 h-11 w-full rounded-[12px] border border-border bg-card px-3 text-[16px] tabular-nums" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-text-3">Preço (cada)</label>
              <input inputMode="decimal" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} placeholder="0,00" className="mt-1 h-11 w-full rounded-[12px] border border-border bg-card px-3 text-[16px] tabular-nums" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarForm}
              disabled={!form.nome.trim() || !valorForm}
              className="h-11 flex-[2] rounded-full bg-[var(--barra)] text-[14px] font-extrabold text-white disabled:opacity-40"
            >
              OK, entra na compra{valorForm ? ` · ${brl(valorForm)}` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
