"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FotoItem } from "@/components/ui/FotoItem";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { COR_LIVELO, nomeMercado, type Oferta } from "@/lib/ofertas";
import {
  comparar,
  LINK_LIVELO,
  linkBusca,
  nomeParceiro,
  precoVelho,
  ptsCertos,
  ptsMax,
  type Livelo as LiveloT,
  type Paridade,
} from "@/lib/livelo";
import { Selo } from "./pecas";
import { marcarFixo, registrarCompraLivelo, salvarConfigLivelo, salvarPrecoLivelo, useLivelo } from "./useLivelo";

// Secao Livelo da aba Ofertas, a vista (nao escondida em configuracao): os parceiros com
// os pontos de hoje (o coletor atualiza de 3 em 3 horas) e os fixos do mes, cada um
// dizendo se compensa mais no encarte ou pela Livelo.
export function LiveloSecao({ ofertas }: { ofertas: Oferta[] }) {
  const l = useLivelo();
  const [config, setConfig] = useState(false);
  if (!l) return null;

  const meus = l.parceiros.map((c) => l.paridades.find((p) => p.codigo === c)).filter(Boolean) as Paridade[];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-extrabold">
          💗 Livelo <span className="text-[14px] font-bold text-text-2">pontos nas compras do mês</span>
        </h2>
        {l.configurado && (
          <button onClick={() => setConfig(true)} className="shrink-0 text-[13px] font-bold text-brand underline">
            Parceiros
          </button>
        )}
      </div>

      {!l.configurado || !meus.length ? (
        <div className="rounded-[18px] border-2 border-dashed p-4" style={{ borderColor: COR_LIVELO }}>
          <div className="text-[15px] font-extrabold">Ponto também é desconto</div>
          <p className="mt-1 text-[13px] text-text-2">
            Comprar pela Livelo (Carrefour, Extra…) rende pontos. Escolha os parceiros e o app compara com os
            encartes, já descontando os pontos.
          </p>
          <button
            onClick={() => setConfig(true)}
            className="mt-3 h-11 rounded-xl px-4 text-[14px] font-bold text-white"
            style={{ background: COR_LIVELO }}
          >
            Escolher parceiros
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {meus.map((p) => (
              <ParceiroLinha key={p.codigo} p={p} clube={l.clube} />
            ))}
          </div>
          <Fixos l={l} ofertas={ofertas} />
        </>
      )}
      {config && <ConfigLivelo l={l} onClose={() => setConfig(false)} />}
    </section>
  );
}

function ParceiroLinha({ p, clube }: { p: Paridade; clube: boolean }) {
  const certos = ptsCertos(p, clube);
  const max = ptsMax(p, clube);
  return (
    <div className="rounded-[14px] border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded-md px-2 py-0.5 text-[12px] font-extrabold text-white" style={{ background: COR_LIVELO }}>
          {p.nome ?? p.codigo}
        </span>
        <span className="flex-1 text-[13px] text-text-2">
          <b className="text-text">{certos} pt/R$</b>
          {max > certos && <span> · até {max} em parte dos produtos</span>}
        </span>
        {p.promocao && (
          <span className="rounded-full bg-[#FCE4F1] px-2 py-[2px] text-[11px] font-extrabold" style={{ color: COR_LIVELO }}>
            🔥 campanha
          </span>
        )}
      </div>
      {p.promocao && p.regra && <div className="mt-1 line-clamp-2 text-[11px] text-text-3">{p.regra}</div>}
    </div>
  );
}

function Fixos({ l, ofertas }: { l: LiveloT; ofertas: Oferta[] }) {
  const { stock, shopping, showToast } = useStore();
  const [novo, setNovo] = useState("");
  // Sugestoes: o que esta na lista agora (se compra todo mes, e so tocar).
  const sugestoes = [
    ...new Set(shopping.filter((i) => i.status !== "removed").map((i) => i.name.trim().toLowerCase())),
  ]
    .filter((n) => !l.fixos.includes(n))
    .slice(0, 10);

  async function adicionar() {
    const n = novo.trim();
    if (n.length < 2) return;
    const r = await marcarFixo(n, true);
    if (!r.ok) return showToast(r.erro!);
    setNovo("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-1 text-[15px] font-extrabold">⭐ Fixos do mês</div>
      {!l.fixos.length && (
        <p className="text-[13px] text-text-2">O que vocês compram todo mês (café, sabão…). O app diz onde sai melhor.</p>
      )}
      {l.fixos.map((f) => (
        <FixoCard key={f} item={f} l={l} ofertas={ofertas} />
      ))}
      {sugestoes.length > 0 && (
        <div>
          <div className="mb-1 text-[12px] font-bold text-text-3">Da sua lista: toque no que vocês compram todo mês</div>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((n) => (
              <button
                key={n}
                onClick={async () => {
                  const r = await marcarFixo(n, true);
                  if (!r.ok) showToast(r.erro!);
                }}
                className="h-9 rounded-full border border-border bg-card px-3 text-[13px] font-bold capitalize"
              >
                ☆ {n}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void adicionar();
        }}
        className="flex gap-2"
      >
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          list="fixos-sugestoes"
          placeholder="+ Fixo do mês: café pilão, sabão omo…"
          className="h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-card px-3 text-[16px]"
        />
        <datalist id="fixos-sugestoes">
          {stock.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <button type="submit" disabled={novo.trim().length < 2} className="h-11 shrink-0 rounded-[12px] bg-brand px-4 text-[14px] font-bold text-brand-ink disabled:opacity-50">
          Pôr
        </button>
      </form>
    </div>
  );
}

function FixoCard({ item, l, ofertas }: { item: string; l: LiveloT; ofertas: Oferta[] }) {
  const { showToast } = useStore();
  const c = comparar(item, ofertas, l);
  const [parceiro, setParceiro] = useState(c.livelo?.parceiro ?? l.parceiros[0]);
  const [editando, setEditando] = useState(!c.livelo);
  const [preco, setPreco] = useState("");
  const busca = linkBusca(parceiro, item);
  const velho = c.livelo && precoVelho(c.livelo.visto_em);

  async function salvar() {
    const v = Number(preco.replace(",", "."));
    if (!(v > 0)) return showToast("Digite o preço que está no site.");
    const r = await salvarPrecoLivelo(item, parceiro, v);
    if (!r.ok) return showToast(r.erro!);
    setPreco("");
    setEditando(false);
  }

  return (
    <div
      className="rounded-[18px] border-2 bg-card p-3"
      style={{ borderColor: c.vence === "livelo" ? COR_LIVELO : "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <FotoItem nome={item} className="h-12 w-12 rounded-xl border border-border" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold capitalize leading-tight">{item}</div>
          <div className="text-[12px] text-text-3">todo mês</div>
        </div>
        {c.vence && c.mercado && c.livelo && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-[3px] text-[12px] font-extrabold ${
              c.vence === "livelo" ? "bg-pos-soft text-pos" : "bg-[#E3ECFA] text-[#1E50A8]"
            }`}
          >
            {c.vence === "livelo" ? "pela Livelo" : "no mercado"}
          </span>
        )}
        <button
          onClick={() => void marcarFixo(item, false)}
          aria-label={`Tirar ${item} dos fixos`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[16px] text-text-3"
        >
          ×
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className={`rounded-[12px] border-2 p-2 ${c.vence === "mercado" ? "border-pos bg-pos-soft/40" : "border-border"}`}>
          <div className="text-[11px] text-text-3">Melhor encarte</div>
          {c.mercado ? (
            <>
              <Selo mercado={c.mercado.mercado} />
              <div className="mt-1 text-[16px] font-extrabold tabular-nums">{brl(c.mercado.preco_por)}</div>
            </>
          ) : (
            <div className="mt-1 text-[13px] text-text-2">sem oferta esta semana</div>
          )}
        </div>
        <div className={`rounded-[12px] border-2 p-2 ${c.vence === "livelo" ? "border-pos bg-pos-soft/40" : "border-border"}`}>
          <div className="truncate text-[11px] text-text-3">Livelo · {nomeParceiro(l, c.livelo?.parceiro ?? parceiro)}</div>
          {c.livelo ? (
            <>
              <div className="text-[11px] text-text-3 line-through">{brl(c.livelo.preco)}</div>
              <div className={`text-[16px] font-extrabold tabular-nums ${c.vence === "livelo" ? "text-pos" : ""}`}>
                {brl(c.livelo.liquido)}
              </div>
              <div className="text-[11px] font-bold" style={{ color: COR_LIVELO }}>
                +{c.livelo.pts} pts = {brl(c.livelo.preco - c.livelo.liquido)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[13px] text-text-2">falta o preço</div>
          )}
        </div>
      </div>

      {c.vence && c.mercado && c.livelo && c.diferenca >= 0.01 && (
        <p className="mt-2 text-[13px] text-text-2">
          💡 {c.vence === "livelo" ? "Com os pontos, a Livelo" : `O encarte do ${nomeMercado(c.mercado.mercado)}`} sai{" "}
          <b>{brl(c.diferenca)} mais barato</b> por unidade.
        </p>
      )}
      {velho && !editando && <p className="mt-1 text-[12px] font-bold text-warn">Preço de mais de uma semana: confira.</p>}

      {editando ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {l.parceiros.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {l.parceiros.map((p) => (
                <button
                  key={p}
                  onClick={() => setParceiro(p)}
                  aria-pressed={parceiro === p}
                  className={`h-8 rounded-full px-3 text-[12px] font-bold ${parceiro === p ? "text-white" : "bg-card-2 text-text-2"}`}
                  style={parceiro === p ? { background: COR_LIVELO } : undefined}
                >
                  {nomeParceiro(l, p)}
                </button>
              ))}
            </div>
          )}
          {busca && (
            <a href={busca} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold underline" style={{ color: COR_LIVELO }}>
              Ver o preço no {nomeParceiro(l, parceiro)} ›
            </a>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
            className="flex gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-text-3">R$</span>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
                placeholder="preço lá"
                aria-label={`Preço de ${item} no ${nomeParceiro(l, parceiro)}`}
                className="h-11 w-full rounded-[12px] border border-border bg-card-2 pl-10 pr-3 text-[16px] font-bold"
              />
            </div>
            <button type="submit" className="h-11 shrink-0 rounded-[12px] px-4 text-[14px] font-bold text-white" style={{ background: COR_LIVELO }}>
              Salvar
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-2.5 flex gap-2">
          {c.vence === "livelo" && c.livelo && (
            <>
              <a
                href={LINK_LIVELO}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 flex-[2] items-center justify-center rounded-[12px] text-[14px] font-bold text-white"
                style={{ background: COR_LIVELO }}
              >
                Abrir pela Livelo
              </a>
              <button
                onClick={async () => {
                  const r = await registrarCompraLivelo(c.livelo!.parceiro, item, c.livelo!.preco);
                  showToast(r.ok ? `💗 +${r.pontos ?? 0} pts na Economia do mês` : r.erro!);
                }}
                className="h-11 flex-1 rounded-[12px] border-2 border-border bg-card text-[13px] font-bold"
              >
                Comprei
              </button>
            </>
          )}
          <button
            onClick={() => setEditando(true)}
            className="h-11 flex-1 rounded-[12px] border-2 border-border bg-card text-[13px] font-bold"
          >
            Preço mudou
          </button>
        </div>
      )}
    </div>
  );
}

function ConfigLivelo({ l, onClose }: { l: LiveloT; onClose: () => void }) {
  const { showToast } = useStore();
  const conhecidos = l.paridades.filter((p) => p.nome);
  const [escolhidos, setEscolhidos] = useState<string[]>(l.parceiros.length ? l.parceiros : conhecidos.slice(0, 1).map((p) => p.codigo));
  const [valor, setValor] = useState(String(l.valor_ponto).replace(".", ","));
  const [clube, setClube] = useState(l.clube);
  const [busy, setBusy] = useState(false);

  async function salvar() {
    const v = Number(valor.replace(",", "."));
    if (!(v >= 0 && v <= 1)) return showToast("Valor do ponto entre R$ 0 e R$ 1.");
    setBusy(true);
    const r = await salvarConfigLivelo(v, clube, escolhidos);
    setBusy(false);
    if (!r.ok) return showToast(r.erro!);
    showToast("💗 Livelo salva");
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={440}>
      <div className="pr-12 text-[20px] font-extrabold">💗 Onde vocês pontuam</div>
      <p className="mb-3 text-[13px] text-text-2">Os pontos de cada parceiro se atualizam sozinhos, várias vezes ao dia.</p>

      <div className="mb-1.5 text-xs font-bold text-text-2">Parceiros que vocês usam</div>
      <div className="mb-4 flex flex-col gap-1.5">
        {conhecidos.map((p) => {
          const on = escolhidos.includes(p.codigo);
          return (
            <button
              key={p.codigo}
              onClick={() => setEscolhidos((e) => (on ? e.filter((x) => x !== p.codigo) : [...e, p.codigo]))}
              aria-pressed={on}
              className="flex items-center gap-3 rounded-[13px] border-2 px-3 py-2.5 text-left"
              style={{ borderColor: on ? COR_LIVELO : "var(--border)", background: on ? "#E6007E10" : undefined }}
            >
              <span className="flex-1 text-[15px] font-bold">{p.nome}</span>
              <span className="text-[13px] text-text-2">
                {ptsCertos(p, clube)} pt/R${p.promocao ? " 🔥" : ""}
              </span>
              <span className="text-[18px]">{on ? "✓" : "○"}</span>
            </button>
          );
        })}
        {!conhecidos.length && <p className="text-[13px] text-text-2">A tabela de pontos ainda não chegou. Rode o monitor “Pontos Livelo”.</p>}
      </div>

      <div className="mb-1.5 text-xs font-bold text-text-2">Quanto vale 1 ponto para vocês?</div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-bold text-text-3">R$</span>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          aria-label="Valor de 1 ponto"
          className="h-11 w-24 rounded-[12px] border border-border bg-card-2 px-3 text-center text-[16px] font-bold"
        />
        <span className="text-[13px] text-text-2">por ponto</span>
      </div>
      <p className="mb-4 text-[12px] text-text-3">É o que o app desconta do preço. Na troca por produtos, 1.000 pts costumam valer uns R$ 30.</p>

      <button
        onClick={() => setClube((c) => !c)}
        aria-pressed={clube}
        className="mb-4 flex w-full items-center gap-3 rounded-[13px] border-2 border-border px-3 py-2.5 text-left"
      >
        <span className="flex-1 text-[14px] font-bold">Somos do Clube Livelo</span>
        <span className="text-[18px]">{clube ? "✓" : "○"}</span>
      </button>

      <button
        data-rodape
        onClick={salvar}
        disabled={busy || !escolhidos.length}
        className="h-[52px] w-full rounded-[14px] text-[16px] font-extrabold text-white disabled:opacity-50"
        style={{ background: COR_LIVELO }}
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </Modal>
  );
}
