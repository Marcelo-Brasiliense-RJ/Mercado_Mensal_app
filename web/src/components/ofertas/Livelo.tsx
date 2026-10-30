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
  parceiroCarrefour,
  precoVelho,
  ptsCertos,
  ptsMax,
  type Livelo as LiveloT,
  type Paridade,
} from "@/lib/livelo";
import { Foto, Selo } from "./pecas";
import { marcarFixo, registrarCompraLivelo, salvarConfigLivelo, salvarPrecoLivelo, useLivelo } from "./useLivelo";

// Secao Livelo da aba Ofertas, a vista (nao escondida em configuracao): os parceiros com
// os pontos de hoje (o coletor atualiza de 3 em 3 horas) e os fixos do mes, cada um
// dizendo se compensa mais no encarte ou pela Livelo.
export function LiveloSecao({ ofertas }: { ofertas: Oferta[] }) {
  const l = useLivelo();
  const { showToast } = useStore();
  const [config, setConfig] = useState(false);
  const [ligando, setLigando] = useState(false);
  // Fechada por padrao: uma linha de resumo; abrir mostra parceiros, lista e fixos.
  const [aberto, setAberto] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("livelo_aberto") === "1";
    } catch {
      return false;
    }
  });
  if (!l) return null;
  function alternar() {
    const n = !aberto;
    setAberto(n);
    try {
      localStorage.setItem("livelo_aberto", n ? "1" : "0");
    } catch {
      // sem armazenamento: so nesta visita
    }
  }

  // Um toque: Carrefour Mercado, ponto a R$ 0,03. Ajustar fica em "Parceiros".
  async function ligar() {
    if (!l!.paridades.some((p) => p.codigo === "CRM")) return setConfig(true);
    setLigando(true);
    const r = await salvarConfigLivelo(l!.valor_ponto || 0.03, false, ["CRM"]);
    setLigando(false);
    showToast(r.ok ? "💗 Livelo ligada com o Carrefour" : r.erro!);
  }

  const meus = l.parceiros.map((c) => l.paridades.find((p) => p.codigo === c)).filter(Boolean) as Paridade[];

  const ganham = l.fixos.filter((f) => comparar(f, ofertas, l).vence === "livelo").length;
  const campanha = meus.some((p) => p.promocao);

  return (
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        className="flex items-center gap-3 rounded-[18px] border border-border bg-card px-3.5 py-3 text-left"
      >
        <span className="text-[24px]" aria-hidden>💗</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold">Livelo{campanha ? " 🔥" : ""}</span>
          <span className="block truncate text-[13px] text-text-2">
            {!l.configurado || !meus.length
              ? "Pontos nas compras do mês: toque para ligar"
              : `${meus.map((p) => `${p.nome ?? p.codigo} ${ptsCertos(p, l.clube)} pt/R$`).join(" · ")}${
                  l.fixos.length ? ` · ${ganham}/${l.fixos.length} fixos compensam` : ""
                }`}
          </span>
        </span>
        <span className={`text-[18px] text-text-3 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {aberto && l.configurado && meus.length > 0 && (
        <button onClick={() => setConfig(true)} className="-mt-1 self-end text-[13px] font-bold text-brand underline">
          Parceiros e valor do ponto
        </button>
      )}
      {!aberto ? null : !l.configurado || !meus.length ? (
        <div className="rounded-[18px] border-2 border-dashed p-4" style={{ borderColor: COR_LIVELO }}>
          <div className="text-[15px] font-extrabold">Ponto também é desconto</div>
          <p className="mt-1 text-[13px] text-text-2">
            Comprar pela Livelo (Carrefour, Extra…) rende pontos. Escolha os parceiros e o app compara com os
            encartes, já descontando os pontos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={ligar}
              disabled={ligando}
              className="h-11 rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-60"
              style={{ background: COR_LIVELO }}
            >
              {ligando ? "Ligando…" : "Ligar com o Carrefour"}
            </button>
            <button onClick={() => setConfig(true)} className="h-11 rounded-xl border-2 border-border px-4 text-[14px] font-bold">
              Outros parceiros
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {meus.map((p) => (
              <ParceiroLinha key={p.codigo} p={p} clube={l.clube} />
            ))}
          </div>
          <DaLista l={l} ofertas={ofertas} />
          <Fixos l={l} ofertas={ofertas} />
        </>
      )}
      {config && <ConfigLivelo l={l} onClose={() => setConfig(false)} />}
    </section>
  );
}

// O que da lista tem no Carrefour (o coletor busca no site de 3 em 3 horas), cada um
// com o preco ja descontando os pontos e o melhor encarte do lado.
function DaLista({ l, ofertas }: { l: LiveloT; ofertas: Oferta[] }) {
  const { shopping } = useStore();
  const [todos, setTodos] = useState(false);
  if (!parceiroCarrefour(l)) return null;
  const nomes = [...new Set(shopping.filter((i) => i.status === "pending").map((i) => i.name.trim().toLowerCase()))];
  const linhas = nomes
    .map((n) => ({ n, c: comparar(n, ofertas, l) }))
    .filter((x) => x.c.livelo?.oferta)
    .sort((a, b) => (a.c.vence === "livelo" ? 0 : 1) - (b.c.vence === "livelo" ? 0 : 1) || b.c.diferenca - a.c.diferenca);
  const temCarrefour = ofertas.some((o) => o.mercado === "carrefour");
  const ganha = linhas.filter((x) => x.c.vence === "livelo").length;

  return (
    <div className="rounded-[18px] border border-border bg-card p-3">
      <div className="text-[15px] font-extrabold">🛒 Carrefour pela Livelo · da sua lista</div>
      {!linhas.length ? (
        <p className="mt-1 text-[13px] text-text-2">
          {temCarrefour
            ? "Nada da sua lista no Carrefour agora."
            : "Os preços do Carrefour chegam na próxima rodada do monitor (de 3 em 3 horas)."}
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[13px] text-text-2">
            {linhas.length} {linhas.length > 1 ? "itens" : "item"} lá
            {ganha ? ` · ${ganha} ${ganha > 1 ? "compensam" : "compensa"} pela Livelo` : " · nenhum compensa mais que o encarte"}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(todos ? linhas : linhas.slice(0, 6)).map(({ n, c }) => (
              <li key={n} className="flex items-center gap-2.5 rounded-[12px] bg-card-2 p-2">
                <Foto o={c.livelo!.oferta} className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold leading-tight">{c.livelo!.oferta!.produto}</div>
                  <div className="text-[11px] text-text-3">para “{n}”</div>
                  <div className="text-[11px] font-bold" style={{ color: COR_LIVELO }}>
                    +{c.livelo!.pts} pts · {brl(c.livelo!.preco)} no caixa
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-[15px] font-extrabold tabular-nums ${c.vence === "livelo" ? "text-pos" : ""}`}>
                    {brl(c.livelo!.liquido)}
                  </div>
                  {c.mercado ? (
                    <div className={`text-[11px] font-bold ${c.vence === "mercado" ? "text-pos" : "text-text-3"}`}>
                      {nomeMercado(c.mercado.mercado)} {brl(c.mercado.preco_por)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-3">sem encarte</div>
                  )}
                  <div className={`text-[10px] font-extrabold ${c.vence === "livelo" ? "text-pos" : "text-text-3"}`}>
                    {c.vence === "livelo" ? "LIVELO GANHA" : "ENCARTE GANHA"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {linhas.length > 6 && (
            <button onClick={() => setTodos((t) => !t)} className="mt-2 text-[13px] font-bold text-brand underline">
              {todos ? "Ver menos" : `Ver os ${linhas.length}`}
            </button>
          )}
          <a
            href={LINK_LIVELO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex h-11 items-center justify-center rounded-[12px] text-[14px] font-bold text-white"
            style={{ background: COR_LIVELO }}
          >
            Comprar pela Livelo
          </a>
        </>
      )}
    </div>
  );
}

// Um parceiro numa pilula: nome, pontos garantidos e o "ate N" da campanha.
function ParceiroLinha({ p, clube }: { p: Paridade; clube: boolean }) {
  const certos = ptsCertos(p, clube);
  const max = ptsMax(p, clube);
  return (
    <span
      title={p.regra ?? undefined}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold"
      style={{ borderColor: COR_LIVELO }}
    >
      <span style={{ color: COR_LIVELO }}>{p.nome ?? p.codigo}</span>
      <span>{certos} pt/R$</span>
      {max > certos && <span className="text-text-3">🔥 até {max}</span>}
    </span>
  );
}

function Fixos({ l, ofertas }: { l: LiveloT; ofertas: Oferta[] }) {
  const { stock, shopping, showToast } = useStore();
  const [novo, setNovo] = useState("");
  // Sugestoes: o que esta na lista agora (se compra todo mes, e so tocar).
  const sugestoes = [
    ...new Set(shopping.filter((i) => i.status !== "removed").map((i) => i.name.trim().toLowerCase())),
  ]
    .filter((n) => !l.fixos.includes(n));
  const [todas, setTodas] = useState(false);

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
            {(todas ? sugestoes : sugestoes.slice(0, 6)).map((n) => (
              <button
                key={n}
                onClick={async () => {
                  const r = await marcarFixo(n, true);
                  if (!r.ok) showToast(r.erro!);
                }}
                title={n}
                className="h-8 max-w-[48%] truncate rounded-full border border-border bg-card px-2.5 text-[12px] font-bold capitalize"
              >
                ☆ {n}
              </button>
            ))}
            {sugestoes.length > 6 && (
              <button onClick={() => setTodas((t) => !t)} className="h-8 rounded-full px-2.5 text-[12px] font-bold text-brand underline">
                {todas ? "menos" : `+${sugestoes.length - 6}`}
              </button>
            )}
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
  // Linha compacta; tocar abre a comparacao e o preco.
  const [aberto, setAberto] = useState(false);
  const doSite = !!c.livelo?.oferta; // preco que o coletor trouxe do site, sem digitar
  const [preco, setPreco] = useState("");
  const busca = linkBusca(parceiro, item);
  const velho = c.livelo && !doSite && precoVelho(c.livelo.visto_em);

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
      className="rounded-[14px] border-2 bg-card p-2"
      style={{ borderColor: c.vence === "livelo" ? COR_LIVELO : "var(--border)" }}
    >
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <FotoItem nome={item} className="h-10 w-10 rounded-lg border border-border" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-extrabold capitalize leading-tight">{item}</span>
            <span className="block truncate text-[12px] text-text-3">
              {c.mercado ? `${nomeMercado(c.mercado.mercado)} ${brl(c.mercado.preco_por)}` : "sem encarte"}
              {" · "}
              {c.livelo ? `Livelo ${brl(c.livelo.liquido)}` : "Livelo: falta o preço"}
            </span>
          </span>
        </button>
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

      {aberto && (
      <>
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
          {!doSite && (
            <button
              onClick={() => setEditando(true)}
              className="h-11 flex-1 rounded-[12px] border-2 border-border bg-card text-[13px] font-bold"
            >
              Preço mudou
            </button>
          )}
        </div>
      )}
      </>
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
