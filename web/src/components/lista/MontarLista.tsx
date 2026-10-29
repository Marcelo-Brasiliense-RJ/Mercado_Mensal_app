"use client";

import { useMemo, useRef, useState } from "react";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { SearchIcon } from "@/components/ui/icons";
import { FotoItem } from "@/components/ui/FotoItem";
import { Foto } from "@/components/ofertas/pecas";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { corMercado, corredor, desconto, nomeMercado, padrao, type Oferta } from "@/lib/ofertas";
import { categoriaDe, ICONE } from "@/lib/categorias";
import { unitFor } from "@/lib/defaults";
import { Sugestoes } from "./Sugestoes";
import type { StockItem } from "@/lib/types";

// Montar a lista no toque, como numa vitrine: cada quadrado e um produto, tocar poe na
// lista (com a quantidade que falta para completar a casa), tocar de novo tira.
// Antes era um popup por item, digitando nome, quantidade e preco: lento e chato.
type Aba = "acabando" | "casa" | "oferta";

// Quanto levar: o que falta para a casa ter o de sempre ("normal", aprendido por familia).
const falta = (s: StockItem) => Math.max(1, Math.round(s.normal - s.current));
const num = (n: number) => Number(n.toFixed(2)).toLocaleString("pt-BR");

export function MontarLista({ onClose }: { onClose: () => void }) {
  const { stock, shopping, addShopItem, removeItems, updateShopItem, setPar, showToast } = useStore();
  const ofertas = useListaOfertas();
  const acabandoTodos = stock.filter((s) => s.current <= 0 || (s.normal > 0 && s.current < s.normal * 0.5));
  const [aba, setAba] = useState<Aba>(acabandoTodos.length ? "acabando" : "casa");
  const [busca, setBusca] = useState("");
  const [adicionados, setAdicionados] = useState(0);
  // Em oferta sao milhares: filtra por mercado e por corredor, e mostra aos poucos.
  const [mercadoF, setMercadoF] = useState<string | null>(null);
  const [catF, setCatF] = useState<string | null>(null);
  const [limite, setLimite] = useState(60);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const naLista = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of shopping) if (i.status === "pending") m.set(i.name.trim().toLowerCase(), i.id);
    return m;
  }, [shopping]);
  const qtdNaLista = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of shopping) if (i.status === "pending") m.set(i.name.trim().toLowerCase(), i.desired_quantity);
    return m;
  }, [shopping]);
  // Quantidade mexida no ladrilho: aparece na hora e vai ao banco quando a pessoa para de tocar.
  const [qtdLocal, setQtdLocal] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // `s`: o item de casa com esse nome, quando existe (oferta tambem aprende o de sempre).
  function mudarQtd(nome: string, unidade: string, delta: number, s?: StockItem) {
    const k = nome.trim().toLowerCase();
    const id = naLista.get(k);
    if (!id || id.startsWith("local-")) return;
    const atual = qtdLocal[k] ?? qtdNaLista.get(k) ?? (s ? falta(s) : 1);
    const passo = unidade === "kg" || unidade === "L" ? 0.5 : 1;
    const nova = Math.max(passo, Number((atual + delta * passo).toFixed(2)));
    setQtdLocal((q) => ({ ...q, [k]: nova }));
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      const r = await updateShopItem(id, { qty: nova });
      if (!r.ok) return showToast(r.erro);
      // Aprende o de sempre: com o que tem em casa mais o que vai levar. Proximo mes ja vem certo.
      if (!s) return;
      const sempre = Number((Math.max(0, s.current) + nova).toFixed(2));
      if (sempre !== s.normal) await setPar(s.id, sempre);
    }, 700);
  }

  const b = padrao(busca.trim());
  const filtra = (nome: string) => !b || padrao(nome).includes(b);

  const casa = useMemo(
    () =>
      stock
        .filter((s) => filtra(s.name))
        .sort((x, y) => corredor(categoriaDe(x.name)) - corredor(categoriaDe(y.name)) || x.name.localeCompare(y.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtra depende de b
    [stock, b],
  );
  const acabando = casa.filter((s) => acabandoTodos.includes(s));
  const doMercado = useMemo(
    () =>
      ofertas
        .filter((o) => (!mercadoF || o.mercado === mercadoF) && (!b || padrao(`${o.produto} ${o.marca}`).includes(b)))
        .sort((x, y) => desconto(y) - desconto(x)),
    [ofertas, mercadoF, b],
  );
  const mercadosOferta = useMemo(() => [...new Set(ofertas.map((o) => o.mercado))].sort(), [ofertas]);
  const cats = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of doMercado) c.set(o.categoria, (c.get(o.categoria) ?? 0) + 1);
    return [...c].sort((x, y) => corredor(x[0]) - corredor(y[0]));
  }, [doMercado]);
  const emOferta = catF ? doMercado.filter((o) => o.categoria === catF) : doMercado;
  // Sem corredor escolhido e sem busca: uma vitrine por corredor, com os maiores descontos.
  const porCorredor = !catF && !b;


  async function alternar(nome: string, qtd: number, unidade: string, preco: number | null) {
    const k = nome.trim().toLowerCase();
    const id = naLista.get(k);
    setOcupado(k);
    if (id) {
      // item recem-posto ainda sem id do banco: espera o recarregar antes de tirar
      if (id.startsWith("local-")) return setOcupado(null);
      const r = await removeItems([id]);
      setOcupado(null);
      if (!r.ok) return showToast(r.erro);
      setAdicionados((n) => Math.max(0, n - 1));
      return;
    }
    const r = await addShopItem({ name: k, desired_quantity: qtd, unit: unidade, estimated_price: preco });
    setOcupado(null);
    if (!r.ok) return showToast(r.erro);
    setAdicionados((n) => n + 1);
  }

  const deCasa = useMemo(() => new Map(stock.map((s) => [padrao(s.name), s])), [stock]);
  function ladrilhoOferta(o: Oferta) {
    const k = o.produto.trim().toLowerCase();
    const on = naLista.has(k);
    const s = deCasa.get(padrao(o.produto)); // mesmo nome de algo de casa: leva o que falta
    const unidade = s?.unit ?? "un";
    return (
      <Ladrilho
        key={o.id}
        on={on}
        ocupado={ocupado === k}
        onClick={() => {
          setQtdLocal((q) => {
            const n = { ...q };
            delete n[k];
            return n;
          });
          void alternar(o.produto, s ? falta(s) : 1, unidade, o.preco_por);
        }}
        foto={<Foto o={o} className="h-16 w-16 rounded-lg" />}
        nome={o.produto}
        sub=""
        preco={{ por: o.preco_por, de: o.preco_de, off: desconto(o) }}
        qtd={on ? { valor: qtdLocal[k] ?? qtdNaLista.get(k) ?? 1, unidade, mudar: (d) => mudarQtd(o.produto, unidade, d, s) } : undefined}
        faixa={corMercado(o.mercado)}
        etiqueta={nomeMercado(o.mercado)}
      />
    );
  }

  const novo = busca.trim();
  const existe = novo && (stock.some((s) => padrao(s.name) === padrao(novo)) || naLista.has(novo.toLowerCase()));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="border-b border-border bg-card px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[20px] font-extrabold">⚡ Montar lista</div>
          <button onClick={onClose} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-full bg-card-2 text-[20px] font-bold">
            ×
          </button>
        </div>
        <label className="relative block">
          <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && novo && !existe) {
                void alternar(novo, 1, unitFor(novo), null);
                setBusca("");
              }
            }}
            placeholder="Procurar ou escrever um item"
            enterKeyHint="done"
            className="h-12 w-full rounded-2xl border-2 border-border bg-card-2 pl-12 pr-4 text-[16px] outline-none focus:border-brand"
          />
        </label>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {(
            [
              ["acabando", `🔴 Acabando${acabandoTodos.length ? ` (${acabandoTodos.length})` : ""}`],
              ["casa", "🏠 Tudo de casa"],
              ["oferta", "🏷 Em oferta"],
            ] as [Aba, string][]
          ).map(([id, txt]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              aria-pressed={aba === id}
              className={`h-10 rounded-xl text-[13px] font-bold ${aba === id ? "bg-brand text-brand-ink" : "bg-card-2 text-text-2"}`}
            >
              {txt}
            </button>
          ))}
        </div>
        {aba === "oferta" && (
          <div className="-mx-4 mt-2.5 flex flex-col gap-1.5">
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              {[null, ...mercadosOferta].map((m) => {
                const on = mercadoF === m;
                return (
                  <button
                    key={m ?? "todos"}
                    onClick={() => {
                      setMercadoF(m);
                      setLimite(60);
                    }}
                    aria-pressed={on}
                    className={`h-9 shrink-0 rounded-full border-2 px-3.5 text-[13px] font-bold ${on ? "text-white" : "bg-card-2 text-text-2"}`}
                    style={{ borderColor: m ? corMercado(m) : "var(--border)", background: on ? (m ? corMercado(m) : "var(--text)") : undefined }}
                  >
                    {m ? nomeMercado(m) : "Todos os mercados"}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              {[[null, doMercado.length] as [string | null, number], ...cats].map(([c, n]) => {
                const on = catF === c;
                return (
                  <button
                    key={c ?? "todas"}
                    onClick={() => {
                      setCatF(c);
                      setLimite(60);
                    }}
                    aria-pressed={on}
                    className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-bold ${on ? "bg-brand text-brand-ink" : "bg-card-2 text-text-2"}`}
                  >
                    {c ? `${ICONE[c] ?? "🛒"} ${c}` : "Tudo"} <span className="opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
        {/* Escrevendo: o generico, o que esta em oferta e o nome como esta no mercado. */}
        {novo.length >= 2 && (
          <Sugestoes
            termo={novo}
            onEscolher={(e) => {
              void alternar(e.nome, 1, unitFor(e.nome), e.preco);
              setBusca("");
            }}
          />
        )}

        {aba !== "oferta" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {(aba === "acabando" ? acabando : casa).map((s) => {
              const k = s.name.trim().toLowerCase();
              const on = naLista.has(k);
              const leva = falta(s);
              const tem = s.current <= 0 ? "acabou" : `tem ${num(s.current)}`;
              return (
                <Ladrilho
                  key={s.id}
                  on={on}
                  ocupado={ocupado === k}
                  onClick={() => {
                    setQtdLocal((q) => {
                      const n = { ...q };
                      delete n[k];
                      return n;
                    });
                    void alternar(s.name, leva, s.unit, s.priceLast);
                  }}
                  foto={<FotoItem nome={s.name} className="h-16 w-16 rounded-lg" />}
                  nome={s.name}
                  sub={on ? tem : `${tem} · leva ${num(leva)}`}
                  alerta={!on && s.current <= 0}
                  qtd={on ? { valor: qtdLocal[k] ?? qtdNaLista.get(k) ?? leva, unidade: s.unit, mudar: (d) => mudarQtd(s.name, s.unit, d, s) } : undefined}
                />
              );
            })}
            {(aba === "acabando" ? acabando : casa).length === 0 && (
              <p className="col-span-full py-10 text-center text-[14px] text-text-2">
                {aba === "acabando" ? "Nada acabando em casa. 🎉" : "Nada com esse nome em casa."}
              </p>
            )}
          </div>
        ) : (
          <>
            {emOferta.length === 0 && (
              <p className="py-10 text-center text-[14px] text-text-2">Nenhuma oferta com esse nome aqui.</p>
            )}
            {porCorredor ? (
              cats.map(([c, n]) => (
                <section key={c} className="mb-5">
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h3 className="text-[16px] font-extrabold">
                      {ICONE[c] ?? "🛒"} {c}
                    </h3>
                    <button onClick={() => setCatF(c)} className="text-[13px] font-bold text-brand">
                      Ver as {n} ›
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {doMercado
                      .filter((o) => o.categoria === c)
                      .slice(0, 6)
                      .map(ladrilhoOferta)}
                  </div>
                </section>
              ))
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{emOferta.slice(0, limite).map(ladrilhoOferta)}</div>
                {emOferta.length > limite && (
                  <button
                    onClick={() => setLimite((l) => l + 60)}
                    className="mt-3 h-12 w-full rounded-2xl border-2 border-border bg-card text-[14px] font-bold"
                  >
                    Mostrar mais ({emOferta.length - limite})
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <button onClick={onClose} className="h-[52px] w-full rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
          {adicionados ? `Pronto · ${adicionados} ${adicionados > 1 ? "itens" : "item"} na lista` : "Pronto"}
        </button>
      </div>
    </div>
  );
}

function Ladrilho({
  on,
  ocupado,
  onClick,
  foto,
  nome,
  sub,
  alerta,
  faixa,
  etiqueta,
  qtd,
  preco,
}: {
  on: boolean;
  ocupado: boolean;
  onClick: () => void;
  foto: React.ReactNode;
  nome: string;
  sub: string;
  alerta?: boolean;
  faixa?: string;
  etiqueta?: string;
  // Na lista: quanto levar, com - e + para acertar sem abrir nada.
  qtd?: { valor: number; unidade: string; mudar: (delta: number) => void };
  // Oferta: preco grande, o "de" riscado e o desconto num selo verde.
  preco?: { por: number; de: number | null; off: number };
}) {
  return (
    <div className="relative flex flex-col">
    <button
      onClick={onClick}
      disabled={ocupado}
      aria-pressed={on}
      className={`relative flex flex-1 flex-col items-center gap-1 overflow-hidden border-2 bg-card px-1.5 pt-2 text-center transition-transform active:scale-95 disabled:opacity-60 ${
        on ? "border-pos bg-pos-soft" : "border-border"
      } ${qtd ? "rounded-t-2xl border-b-0 pb-1" : "rounded-2xl pb-2"}`}
    >
      {etiqueta && (
        <span className="absolute inset-x-0 top-0 truncate px-1 text-[10px] font-extrabold leading-4 text-white" style={{ background: faixa }}>
          {etiqueta}
        </span>
      )}
      <span className={etiqueta ? "mt-3" : ""}>{foto}</span>
      <span className="line-clamp-2 min-h-[2.2em] text-[12px] font-extrabold leading-tight">{nome}</span>
      {preco ? (
        <span className="mt-auto flex flex-col items-center">
          <span className="text-[16px] font-extrabold leading-tight tabular-nums">{brl(preco.por)}</span>
          {preco.off > 0 && (
            <span className="mt-0.5 flex items-center gap-1">
              {preco.de && <span className="text-[10px] text-text-3 line-through">{brl(preco.de)}</span>}
              <span className="rounded-full bg-pos px-1.5 text-[10px] font-extrabold leading-4 text-white">-{preco.off}%</span>
            </span>
          )}
        </span>
      ) : (
        <span className={`text-[11px] font-bold ${on ? "text-pos" : alerta ? "text-neg" : "text-text-2"}`}>{sub}</span>
      )}
      {on && (
        <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-pos text-[13px] font-extrabold text-white">
          ✓
        </span>
      )}
    </button>
    {qtd && (
      <div className="flex items-center justify-between rounded-b-2xl border-2 border-t-0 border-pos bg-pos-soft px-1 pb-1.5">
        <button onClick={() => qtd.mudar(-1)} aria-label="Menos" className="grid h-9 w-9 place-items-center rounded-full bg-card text-[18px] font-extrabold text-pos">
          −
        </button>
        <span className="text-[14px] font-extrabold tabular-nums text-pos">
          {num(qtd.valor)} <span className="text-[11px]">{qtd.unidade}</span>
        </span>
        <button onClick={() => qtd.mudar(1)} aria-label="Mais" className="grid h-9 w-9 place-items-center rounded-full bg-card text-[18px] font-extrabold text-pos">
          +
        </button>
      </div>
    )}
    </div>
  );
}
