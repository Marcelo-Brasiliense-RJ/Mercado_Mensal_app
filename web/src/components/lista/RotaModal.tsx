"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { corMercado, nomeCompleto, nomeMercado } from "@/lib/ofertas";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { carregarMeusMercados } from "@/lib/mercadosCasa";
import { atualizarLugar, posicaoAtual } from "@/lib/lugar";
import { localizarLoja, type Loja } from "@/lib/lojas";
import { linkGoogle, linkWaze, ordenar, planejar } from "@/lib/rota";

// Rota da compra do mes: entre os mercados que a casa marcou, em quais passar para
// pegar a lista mais barata, em que ordem (a partir de onde a pessoa esta) e o botao
// que abre tudo no mapa do celular.
export function RotaModal({ onClose }: { onClose: () => void }) {
  const { shopping } = useStore();
  const ofertas = useListaOfertas();
  const [max, setMax] = useState(2);
  const [mercados, setMercados] = useState<string[] | null>(null);
  const [origem, setOrigem] = useState<{ lat: number; lng: number } | null>(null);
  const [lojas, setLojas] = useState<Record<string, Loja | null>>({});
  const [procurando, setProcurando] = useState(false);

  const nomes = useMemo(
    () => shopping.filter((i) => i.status === "pending").map((i) => i.name.trim().toLowerCase()),
    [shopping],
  );
  const comOferta = useMemo(() => [...new Set(ofertas.map((o) => o.mercado))], [ofertas]);

  useEffect(() => {
    // so os mercados que a casa marcou e que tem encarte; sem marcacao, todos
    carregarMeusMercados().then((m) => {
      const meus = (m?.escolhidos ?? []).filter((x) => comOferta.includes(x));
      setMercados(meus.length ? meus : comOferta);
    });
    atualizarLugar(true).then(() => setOrigem(posicaoAtual()));
  }, [comOferta]);

  const plano = useMemo(
    () => (mercados ? planejar(nomes, ofertas, mercados, max) : null),
    [nomes, ofertas, mercados, max],
  );

  // acha a loja de cada parada (aprendida ou no mapa) quando o plano muda
  useEffect(() => {
    if (!plano || !origem) return;
    const faltando = plano.paradas.map((p) => p.mercado).filter((m) => !(m in lojas));
    if (!faltando.length) return;
    let vivo = true;
    Promise.resolve().then(() => vivo && setProcurando(true));
    Promise.all(faltando.map(async (m) => [m, await localizarLoja(m, origem)] as const)).then((rs) => {
      if (!vivo) return;
      setLojas((l) => ({ ...l, ...Object.fromEntries(rs) }));
      setProcurando(false);
    });
    return () => {
      vivo = false;
    };
  }, [plano, origem, lojas]);

  const paradas = plano
    ? origem
      ? ordenar(
          origem,
          plano.paradas.filter((p) => lojas[p.mercado]).map((p) => ({ ...p, ...lojas[p.mercado]! })),
        )
      : []
    : [];
  const semEndereco = plano?.paradas.filter((p) => origem && p.mercado in lojas && !lojas[p.mercado]) ?? [];

  return (
    <Modal open onClose={onClose} maxWidth={520}>
      <div className="pr-10 text-[22px] font-extrabold">🗺️ Rota da compra</div>
      <p className="mb-3 text-[13px] text-text-2">
        Entre os seus mercados, onde a lista sai mais barata e em que ordem passar.
      </p>

      <div className="mb-1.5 text-xs font-bold text-text-2">Quer passar em até quantos mercados?</div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setMax(n)}
            aria-pressed={max === n}
            className={`h-12 rounded-[13px] border-2 text-[15px] font-extrabold ${max === n ? "border-brand bg-brand text-brand-ink" : "border-border bg-card-2"}`}
          >
            {n} {n > 1 ? "mercados" : "mercado"}
          </button>
        ))}
      </div>

      {!nomes.length ? (
        <p className="rounded-[13px] bg-card-2 p-3 text-[14px] text-text-2">A lista está vazia. Monte a lista do mês primeiro.</p>
      ) : !plano ? (
        <p className="rounded-[13px] bg-card-2 p-3 text-[14px] text-text-2">Nenhum item da lista está em oferta nos seus mercados.</p>
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[15px] font-extrabold">
              {plano.paradas.length} {plano.paradas.length > 1 ? "paradas" : "parada"} · {brl(plano.total)}
              <span className="block text-[12px] font-bold text-text-2">
                pega {nomes.length - plano.faltam.length} de {nomes.length} itens da lista em oferta
              </span>
            </span>
            {plano.economiaVsUm >= 1 && (
              <span className="text-[13px] font-bold text-pos">{brl(plano.economiaVsUm)} a menos que 1 mercado só</span>
            )}
          </div>
          {plano.paradas.length < max && max > 1 && (
            <p className="mb-2 text-[12px] text-text-3">Outro mercado a mais não compensa: economizaria menos de R$ 10.</p>
          )}

          <ol className="flex flex-col gap-2">
            {(paradas.length ? paradas : plano.paradas).map((p, i) => {
              const loja = lojas[p.mercado];
              return (
                <li key={p.mercado} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: corMercado(p.mercado) }}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-extrabold">{nomeMercado(p.mercado)}</div>
                      <div className="truncate text-[12px] text-text-2">
                        {loja ? loja.nome : origem ? (procurando ? "procurando a loja…" : "endereço não encontrado") : "sem localização"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px] font-extrabold tabular-nums">{brl(p.total)}</div>
                      <div className="text-[11px] text-text-2">{p.itens.length} itens</div>
                    </div>
                    {loja && (
                      <a href={linkWaze(loja)} target="_blank" rel="noopener noreferrer" className="h-9 shrink-0 rounded-lg bg-[#33CCFF] px-2.5 text-[12px] font-bold leading-9 text-white">
                        Waze
                      </a>
                    )}
                  </div>
                  <div className="mt-1.5 text-[12px] leading-snug text-text-2">
                    {p.itens.map((x) => `${x.nome} (${brl(x.oferta.preco_por)})`).join(" · ")}
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[12px] font-bold text-brand">ver produtos</summary>
                    <ul className="mt-1 text-[12px] text-text-2">
                      {p.itens.map((x) => (
                        <li key={x.nome}>• {nomeCompleto(x.oferta)}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ol>

          {plano.faltam.length > 0 && (
            <p className="mt-2 text-[12px] text-text-2">
              <b>Sem oferta nos seus mercados:</b> {plano.faltam.join(", ")}. Compra onde passar.
            </p>
          )}

          {semEndereco.map((p) => (
            <a
              key={p.mercado}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Supermercado ${nomeMercado(p.mercado)}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[13px] font-bold text-brand underline"
            >
              Procurar {nomeMercado(p.mercado)} no mapa
            </a>
          ))}

          {!origem ? (
            <p className="mt-3 rounded-[13px] bg-card-2 p-3 text-[13px] text-text-2">
              📍 Ligue a localização para eu montar a rota a partir de onde você está.
            </p>
          ) : paradas.length > 0 ? (
            <a
              data-rodape
              href={linkGoogle(origem, paradas)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex h-[52px] items-center justify-center rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              Abrir rota no Google Maps ({paradas.length} {paradas.length > 1 ? "paradas" : "parada"})
            </a>
          ) : null}
        </>
      )}
    </Modal>
  );
}
