"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { corMercado, nomeMercado } from "@/lib/ofertas";
import { carregarMeusMercados, pedirMercado, salvarMeusMercados, type MeusMercados } from "@/lib/mercadosCasa";
import { recarregarOfertas, useOfertas } from "./useOfertas";

// Escolher onde a casa compra. Os acompanhados pelo monitor aparecem com quantas
// ofertas tem esta semana; os pedidos de outras familias, com "quero tambem".
export function MeusMercadosModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useStore();
  const [dados, setDados] = useState<MeusMercados | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    carregarMeusMercados().then((d) => {
      setDados(d);
      setSel(new Set(d?.escolhidos ?? []));
    });
  }, []);

  const alternar = (m: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  async function salvar() {
    if (!sel.size) return showToast("Escolha pelo menos um mercado.");
    setBusy(true);
    // pedido marcado aqui vira "quero tambem" (conta mais uma familia)
    for (const p of dados?.pedidos ?? []) if (sel.has(p.nome) && !p.meu) await pedirMercado(p.nome);
    const ok = await salvarMeusMercados([...sel]);
    setBusy(false);
    if (!ok) return showToast("Não deu para salvar. Tente de novo.");
    recarregarOfertas();
    showToast(`${sel.size} ${sel.size > 1 ? "mercados" : "mercado"}: as ofertas agora são só deles`);
    onClose();
  }

  async function pedir() {
    const n = novo.trim();
    if (n.length < 2) return;
    setBusy(true);
    await pedirMercado(n);
    setBusy(false);
    setSel((s) => new Set(s).add(n));
    setDados((d) => (d ? { ...d, pedidos: [...d.pedidos, { nome: n, familias: 1, meu: true }] } : d));
    setNovo("");
    showToast(`${n} anotado na lista de mercados a acompanhar`);
  }

  return (
    <Modal open onClose={onClose} maxWidth={480}>
      <div className="pr-10 text-[22px] font-extrabold">Onde você compra?</div>
      <p className="mb-4 text-[13px] text-text-2">Marque os mercados que você frequenta. As ofertas e os avisos ficam só deles.</p>
      {!dados ? (
        <div className="grid h-32 place-items-center">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-brand" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {dados.acompanhados.map((a) => {
            const on = sel.has(a.mercado);
            return (
              <button
                key={a.mercado}
                onClick={() => alternar(a.mercado)}
                aria-pressed={on}
                className="flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left"
                style={{ borderColor: on ? corMercado(a.mercado) : "var(--border)", background: on ? `${corMercado(a.mercado)}14` : undefined }}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 text-[14px] font-extrabold text-white"
                  style={{ borderColor: corMercado(a.mercado), background: on ? corMercado(a.mercado) : "transparent" }}>
                  {on ? "✓" : ""}
                </span>
                <span className="flex-1 text-[16px] font-extrabold">{nomeMercado(a.mercado)}</span>
                <span className="text-[12px] text-text-2">{a.ofertas} ofertas</span>
              </button>
            );
          })}

          {dados.pedidos.length > 0 && (
            <div className="mt-2 text-[12px] font-bold uppercase tracking-wide text-text-3">Pedidos (ainda sem encarte)</div>
          )}
          {dados.pedidos.map((p) => {
            const on = sel.has(p.nome);
            return (
              <button
                key={p.nome}
                onClick={() => alternar(p.nome)}
                aria-pressed={on}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left ${on ? "border-brand bg-brand-soft" : "border-dashed border-border"}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[14px] font-extrabold ${on ? "border-brand bg-brand text-white" : "border-border"}`}>
                  {on ? "✓" : ""}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-extrabold">{p.nome}</span>
                  <span className="block text-[12px] text-text-2">
                    {p.meu ? "você pediu" : `pedido por ${p.familias} ${p.familias > 1 ? "famílias" : "família"}`} · entra quando o monitor ler o encarte
                  </span>
                </span>
              </button>
            );
          })}

          <div className="mt-2 flex gap-2">
            <input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Outro mercado (ex.: Assaí)"
              className="h-12 min-w-0 flex-1 rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]"
            />
            <button onClick={pedir} disabled={busy || novo.trim().length < 2} className="h-12 shrink-0 rounded-[13px] border-2 border-brand px-4 text-[14px] font-bold text-brand disabled:opacity-40">
              Pedir
            </button>
          </div>
        </div>
      )}
      <button data-rodape onClick={salvar} disabled={busy || !dados} className="mt-4 h-[52px] w-full rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50">
        {busy ? "Salvando…" : `Pronto${sel.size ? ` (${sel.size})` : ""}`}
      </button>
    </Modal>
  );
}

// Linha no topo das Ofertas: de quais mercados sao, e aviso de mercado novo pedido
// por outra familia ("quero tambem" ou "agora nao", lembrado neste aparelho).
export function MercadosDaCasa() {
  const estado = useOfertas();
  const { showToast } = useStore();
  const [aberto, setAberto] = useState(false);
  const [pedidos, setPedidos] = useState<MeusMercados["pedidos"]>([]);
  const [dispensados, setDispensados] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pedidos_dispensados") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    carregarMeusMercados().then((d) => setPedidos(d?.pedidos ?? []));
  }, []);
  const meus = estado.fase === "ok" ? (estado.dados.meus_mercados ?? null) : null;
  const novo = pedidos.find((p) => !p.meu && !dispensados.includes(p.nome) && !(meus ?? []).includes(p.nome));

  function dispensar(nome: string) {
    const n = [...dispensados, nome];
    setDispensados(n);
    try {
      localStorage.setItem("pedidos_dispensados", JSON.stringify(n));
    } catch {
      // sem armazenamento: volta a perguntar na proxima visita
    }
  }

  return (
    <>
      <button onClick={() => setAberto(true)} className="-mt-3 flex w-full items-center justify-between gap-2 rounded-xl bg-card-2 px-3 py-2.5 text-left">
        <span className="min-w-0 truncate text-[13px] text-text-2">
          🏪 {meus?.length ? meus.map(nomeMercado).join(", ") : "Todos os mercados"}
        </span>
        <span className="shrink-0 text-[13px] font-bold text-brand">{meus?.length ? "Trocar" : "Escolher os meus"}</span>
      </button>
      {novo && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand/50 bg-card px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-extrabold">🆕 Mercado novo pedido: {novo.nome}</div>
            <div className="text-[12px] text-text-2">
              Por {novo.familias} {novo.familias > 1 ? "famílias" : "família"}. Quer acompanhar também?
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              onClick={async () => {
                await pedirMercado(novo.nome);
                setPedidos((ps) => ps.map((p) => (p.nome === novo.nome ? { ...p, meu: true } : p)));
                showToast(`${novo.nome} na sua lista: as ofertas aparecem quando o encarte entrar`);
              }}
              className="h-9 rounded-lg bg-brand px-3 text-[12px] font-bold text-brand-ink"
            >
              Quero também
            </button>
            <button onClick={() => dispensar(novo.nome)} className="h-9 rounded-lg border border-border px-3 text-[12px] font-bold text-text-2">
              Agora não
            </button>
          </div>
        </div>
      )}
      {aberto && <MeusMercadosModal onClose={() => setAberto(false)} />}
    </>
  );
}
