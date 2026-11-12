"use client";

import { useRef, useState } from "react";
import { contarComoNoCupom, faixaDaParte, juntarComEmendas, partesNecessarias, totalConfere, type Cupom } from "@/lib/cupomPartes";
import { brl } from "@/lib/format";

// Nota fiscal em partes, com o app guiando (pedido do dono: "o sistema tem que mostrar o
// que precisa e quantas fotos precisam, do jeito mais pratico possivel").
//
// 1. Primeira foto: o FIM do cupom (TOTAL, "Qtde. total de itens", QR). Com ela o app sabe
//    quantos itens a nota tem e calcula quantas fotos faltam (~15 itens por foto, de perto).
// 2. Depois: Parte 1, Parte 2... de cima para baixo, com o desenho do cupom mostrando qual
//    pedaco fotografar agora. Cada foto e lida assim que e tirada.
// 3. "Li 46 de 46 itens" -> Conferir. Cupom pequeno: a foto do fim ja pega tudo.
// Sem a quantidade no rodape, segue livre: "+ Proxima parte" ate a pessoa dizer pronto.

type Parte = { id: number; foto: string; estado: "lendo" | "ok" | "erro"; cupom?: Cupom; erro?: string };

let proximoId = 1;

export function NotaEmPartes({
  titulo,
  lerArquivo,
  onPronto,
  onSair,
}: {
  titulo: string;
  lerArquivo: (f: File) => Promise<string>;
  onPronto: (c: Cupom, confere: boolean) => void;
  onSair: () => void;
}) {
  const [rodape, setRodape] = useState<Parte | null>(null);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [extra, setExtra] = useState(0); // partes a mais pedidas depois de faltar item
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  // trocar: refaz uma parte; antesDe: poe uma parte nova antes desta (o pedaco que faltou)
  const destinoRef = useRef<{ tipo: "rodape" | "parte"; trocar?: number; antesDe?: number }>({ tipo: "rodape" });

  // --- leitura de uma foto (cada parte vai sozinha: rapido e sem limite de tamanho) ---
  function atualizar(id: number, patch: Partial<Parte>) {
    setRodape((r) => (r && r.id === id ? { ...r, ...patch } : r));
    setPartes((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function ler(id: number, foto: string) {
    atualizar(id, { estado: "lendo", erro: undefined });
    try {
      const r = await fetch("/api/receipt-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: foto }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok?: boolean; erro?: string; itens?: Cupom["itens"]; total?: number; emitente?: string; chave?: string; qtd_itens?: number }
        | null;
      if (!d?.ok || !Array.isArray(d.itens)) {
        return atualizar(id, {
          estado: "erro",
          erro: d?.erro === "limite" ? "Muitas fotos seguidas. Espere 1 minuto e toque em Tentar de novo." : "Não consegui ler. Tire de novo, mais de perto.",
        });
      }
      atualizar(id, {
        estado: "ok",
        cupom: {
          itens: d.itens,
          total: Number(d.total) || 0,
          emitente: d.emitente ?? "",
          chave: d.chave ?? "",
          qtdItens: Number(d.qtd_itens) || 0,
        },
      });
    } catch {
      atualizar(id, { estado: "erro", erro: "Sem internet? Toque em Tentar de novo." });
    }
  }

  async function chegou(arquivos: File[]) {
    if (!arquivos.length) return;
    const fotos = (await Promise.all(arquivos.map((f) => lerArquivo(f).catch(() => "")))).filter(Boolean);
    if (!fotos.length) return;
    const destino = destinoRef.current;
    // Trocar uma parte que saiu ruim
    if (destino.trocar != null) {
      const id = destino.trocar;
      const foto = fotos[0];
      setRodape((r) => (r && r.id === id ? { ...r, foto } : r));
      setPartes((l) => l.map((p) => (p.id === id ? { ...p, foto } : p)));
      void ler(id, foto);
      return;
    }
    let lista = fotos;
    // Varias fotos da galeria antes do rodape: tiradas de cima para baixo, a ultima e o fim.
    if (!rodape) {
      const ultima = lista[lista.length - 1];
      const r: Parte = { id: proximoId++, foto: ultima, estado: "lendo" };
      setRodape(r);
      void ler(r.id, ultima);
      lista = lista.slice(0, -1);
    }
    const novas = lista.map((foto) => ({ id: proximoId++, foto, estado: "lendo" as const }));
    if (novas.length) {
      const antes = destino.antesDe;
      setPartes((l) => {
        const i = antes != null ? l.findIndex((p) => p.id === antes) : -1;
        return i >= 0 ? [...l.slice(0, i), ...novas, ...l.slice(i)] : [...l, ...novas];
      });
      for (const p of novas) void ler(p.id, p.foto);
    }
  }

  function abrir(tipo: "rodape" | "parte", galeria = false, trocar?: number, antesDe?: number) {
    destinoRef.current = { tipo, trocar, antesDe };
    (galeria ? galRef : camRef).current?.click();
  }

  // --- conta das partes ---
  const rod = rodape?.estado === "ok" ? rodape.cupom! : null;
  const qtd = rod?.qtdItens ?? 0;
  const precisa = rod ? (qtd ? partesNecessarias(qtd, contarComoNoCupom(rod.itens)) : null) : null; // null = livre
  const alvo = precisa == null ? null : precisa + extra;
  const okPartes = partes.filter((p) => p.estado === "ok");
  const junta = rod ? juntarComEmendas([...okPartes.map((p) => p.cupom!), rod]) : null;
  const juntas = junta?.cupom ?? null;
  const lendo = (rodape?.estado === "lendo") || partes.some((p) => p.estado === "lendo");
  const comErro = partes.some((p) => p.estado === "erro");
  const faltaFoto = alvo != null && partes.length < alvo;
  const proxima = partes.length + 1;
  const pronto = !!juntas && !lendo && !comErro && !faltaFoto;
  // Prova real: o que eu li, contado do jeito do cupom, contra a "Qtde. total de itens".
  const lidosComoCupom = juntas ? contarComoNoCupom(juntas.itens) : 0;
  const faltandoItens = qtd && juntas ? Math.max(0, qtd - lidosComoCupom) : 0;

  // ONDE faltou (pedido do dono: "tem que mostrar onde estao faltando esses 6").
  // Buraco: a parte depois dele nao repetiu nenhuma linha do fim da anterior. Borrada:
  // parte com linhas que a leitura marcou como duvida.
  const ordem = [...okPartes.map((p) => ({ id: p.id, nome: `Parte ${partes.indexOf(p) + 1}` })), { id: rodape?.id ?? -1, nome: "o fim do cupom" }];
  const buracos = (junta?.semEmenda ?? []).map((i) => ({ antes: ordem[i - 1], depois: ordem[i] }));
  const borradas = okPartes
    .map((p) => ({ p, n: p.cupom!.itens.filter((it) => it.duvida).length }))
    .filter((x) => x.n > 0);
  const verificar = !!juntas && (qtd ? lidosComoCupom !== qtd : buracos.length > 0);

  const inputs = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void chegou(f); }} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void chegou(f); }} />
    </>
  );

  // ===== Passo 1: a foto do fim do cupom =====
  if (!rodape || rodape.estado !== "ok") {
    return (
      <div>
        <div className="mb-1 text-[13px] font-bold text-text-2">{titulo}</div>
        <h2 className="text-[22px] font-extrabold leading-tight">Primeiro, o fim do cupom</h2>
        <div className="mt-4 flex gap-4">
          <DesenhoCupom faixas={2} atual="rodape" feitas={0} />
          <div className="min-w-0 flex-1 text-[14px] leading-snug">
            <p>
              Fotografe <b>só a parte de baixo</b>: onde estão o <b>TOTAL</b>, a <b>quantidade de itens</b> e o QR.
            </p>
            <p className="mt-2 text-text-2">Com ela eu sei quantas fotos faltam e te guio nas outras.</p>
            <p className="mt-2 text-text-2">Cupom pequeno? Fotografe ele inteiro, uma foto só.</p>
          </div>
        </div>

        {rodape?.estado === "lendo" && <Status cor="neutro">⏳ Lendo o fim do cupom…</Status>}
        {rodape?.estado === "erro" && (
          <Status cor="erro">
            {rodape.erro}{" "}
            <button type="button" onClick={() => void ler(rodape.id, rodape.foto)} className="font-bold underline">Tentar de novo</button>
          </Status>
        )}

        <div data-rodape className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={rodape?.estado === "lendo"}
            onClick={() => abrir("rodape", false, rodape?.estado === "erro" ? rodape.id : undefined)}
            className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
          >
            📷 {rodape?.estado === "erro" ? "Tirar de novo" : "Tirar foto do fim do cupom"}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onSair} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">Voltar</button>
            <button type="button" onClick={() => abrir("rodape", true)} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">🖼 Da galeria</button>
          </div>
        </div>
        {inputs}
      </div>
    );
  }

  // ===== Passo 2: as partes, de cima para baixo =====
  const totalFaixas = alvo ?? Math.max(partes.length + 1, 2);
  const faixa = qtd && alvo ? faixaDaParte(Math.min(proxima, alvo), alvo, qtd) : null;
  return (
    <div>
      <div className="mb-1 text-[13px] font-bold text-text-2">{titulo}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] font-bold">
        <span className="rounded-full bg-pos-soft px-2.5 py-1 text-pos">✓ Fim do cupom lido</span>
        {rod!.total > 0 && <span className="rounded-full bg-card-2 px-2.5 py-1">Total {brl(rod!.total)}</span>}
        {qtd > 0 && <span className="rounded-full bg-card-2 px-2.5 py-1">{qtd} itens</span>}
      </div>

      {faltaFoto ? (
        <h2 className="text-[22px] font-extrabold leading-tight">
          Agora a Parte {proxima} de {alvo}
        </h2>
      ) : precisa === 0 && !partes.length ? (
        <h2 className="text-[22px] font-extrabold leading-tight">Peguei tudo numa foto só ✓</h2>
      ) : alvo == null ? (
        <h2 className="text-[22px] font-extrabold leading-tight">Parte {proxima}, de cima para baixo</h2>
      ) : pronto && verificar ? (
        <h2 className="text-[22px] font-extrabold leading-tight text-neg">
          {faltandoItens > 0 ? `Quase: faltam ${faltandoItens} itens` : "Confira as quantidades"}
        </h2>
      ) : (
        <h2 className="text-[22px] font-extrabold leading-tight">Todas as partes tiradas ✓</h2>
      )}

      <div className="mt-4 flex gap-4">
        <DesenhoCupom
          faixas={totalFaixas}
          atual={faltaFoto || alvo == null ? proxima : null}
          feitas={partes.length}
          rodapeFeito
          buracos={pronto && verificar ? buracos.map((b) => (b.depois.id === rodape?.id ? partes.length : partes.findIndex((p) => p.id === b.depois.id))) : []}
          ruins={pronto && verificar ? borradas.map(({ p }) => partes.indexOf(p) + 1) : []}
        />
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          {faltaFoto || alvo == null ? (
            <>
              <p>
                {proxima === 1 ? (
                  <>Do <b>topo do cupom</b> (nome do mercado){faixa ? <> até mais ou menos o <b>item {faixa.ate}</b></> : null}.</>
                ) : (
                  <>
                    {faixa ? <>Do <b>item {faixa.de}</b> ao <b>{faixa.ate}</b>. </> : null}Comece <b>um pouco antes</b> de onde a Parte {proxima - 1} terminou.
                  </>
                )}
              </p>
              <p className="mt-2 text-text-2">Bem de perto: as letras precisam dar para ler.</p>
            </>
          ) : pronto && verificar ? (
            <p>
              {buracos.length || borradas.length ? <>O que está em <b className="text-neg">vermelho</b> no cupom é onde faltou. Toque no botão logo abaixo.</> : <>Toque em <b>Conferir</b> e veja as quantidades.</>}
            </p>
          ) : (
            <p>Confira o que eu li e toque em <b>Conferir itens</b>.</p>
          )}
          {juntas && (
            <p className={`mt-3 text-[15px] font-extrabold ${qtd && lidosComoCupom === qtd ? "text-pos" : ""}`}>
              {qtd ? (lidosComoCupom === qtd ? `✓ ${qtd} de ${qtd} itens` : `Li ${lidosComoCupom} de ${qtd} itens`) : `Li ${lidosComoCupom} itens`}
            </p>
          )}
        </div>
      </div>

      {pronto && verificar && (
        <div className="mt-4 rounded-[16px] border-2 border-warn bg-warn-soft p-3">
          <div className="text-[14px] font-extrabold">
            {qtd
              ? faltandoItens > 0
                ? `Faltam ${faltandoItens} itens: o cupom diz ${qtd}, eu li ${lidosComoCupom}`
                : `O cupom diz ${qtd} itens e eu contei ${lidosComoCupom}`
              : "Pode ter ficado um pedaço de fora"}
          </div>
          <ul className="mt-2 space-y-2">
            {buracos.map((b, i) => (
              <li key={`b${i}`} className="rounded-[12px] bg-card p-2.5">
                <div className="text-[13px] font-bold leading-snug">
                  🔴 Faltou um pedaço entre {b.antes.nome} e {b.depois.nome}
                </div>
                <div className="text-[12px] text-text-2">As duas fotos não se encostaram. Fotografe o trecho do meio, repetindo umas linhas de cada lado.</div>
                <button
                  type="button"
                  onClick={() => abrir("parte", false, undefined, b.depois.id === rodape?.id ? undefined : b.depois.id)}
                  className="mt-2 h-10 w-full rounded-full bg-brand text-[14px] font-extrabold text-brand-ink"
                >
                  📷 Tirar o pedaço entre {b.antes.nome} e {b.depois.nome}
                </button>
              </li>
            ))}
            {borradas.map(({ p, n }) => (
              <li key={`r${p.id}`} className="rounded-[12px] bg-card p-2.5">
                <div className="text-[13px] font-bold leading-snug">
                  🔴 Parte {partes.indexOf(p) + 1} com {n} {n === 1 ? "linha borrada" : "linhas borradas"}
                </div>
                <button
                  type="button"
                  onClick={() => abrir("parte", false, p.id)}
                  className="mt-2 h-10 w-full rounded-full bg-brand text-[14px] font-extrabold text-brand-ink"
                >
                  📷 Tirar a Parte {partes.indexOf(p) + 1} de novo, mais de perto
                </button>
              </li>
            ))}
            {!buracos.length && !borradas.length && (
              <li className="text-[13px] leading-snug">
                {faltandoItens > 0
                  ? "As fotos se encostaram e nenhuma ficou borrada: o mais provável é uma quantidade lida errada (ex.: 6 pacotes lidos como 1). Confira as quantidades na próxima tela."
                  : "Alguma quantidade foi lida a mais. Confira as quantidades na próxima tela."}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* As partes tiradas: miniatura e o que cada uma leu */}
      {partes.length > 0 && (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {partes.map((p, i) => (
            <li key={p.id} className="relative w-[84px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.foto} alt={`Parte ${i + 1}`} className="h-24 w-full rounded-[10px] border border-border object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
              <div className="mt-1 text-center text-[11px] font-bold leading-tight">
                {p.estado === "lendo" && <span className="text-text-3">lendo…</span>}
                {p.estado === "ok" && <span className="text-pos">✓ {p.cupom!.itens.length} itens</span>}
                {p.estado === "erro" && (
                  <button type="button" onClick={() => abrir("parte", false, p.id)} className="text-neg underline">
                    Tirar de novo
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div data-rodape className="mt-4 flex flex-col gap-2">
        {faltaFoto || alvo == null ? (
          <button type="button" onClick={() => abrir("parte")} className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink">
            📷 Tirar Parte {proxima}{alvo ? ` de ${alvo}` : ""}
          </button>
        ) : (
          <button
            type="button"
            disabled={!pronto}
            onClick={() => juntas && onPronto(juntas, totalConfere(juntas))}
            className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
          >
            {lendo ? "Lendo as partes…" : qtd && lidosComoCupom !== qtd ? "Conferir assim mesmo" : "Conferir itens"}
          </button>
        )}
        <div className="flex gap-2">
          {alvo == null && partes.length > 0 && (
            <button
              type="button"
              disabled={lendo}
              onClick={() => juntas && onPronto(juntas, totalConfere(juntas))}
              className="h-11 flex-1 rounded-full bg-[var(--barra)] text-[14px] font-bold text-white disabled:opacity-50"
            >
              Pronto, conferir
            </button>
          )}
          {!faltaFoto && alvo != null && (
            <button type="button" onClick={() => setExtra((x) => x + 1)} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">
              + Mais uma parte
            </button>
          )}
          <button type="button" onClick={() => abrir("parte", true)} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">
            🖼 Galeria
          </button>
        </div>
      </div>
      {inputs}
    </div>
  );
}

function Status({ cor, children }: { cor: "neutro" | "erro" | "aviso"; children: React.ReactNode }) {
  const c = cor === "erro" ? "bg-neg-soft text-neg" : cor === "aviso" ? "bg-warn-soft text-text" : "bg-card-2 text-text-2";
  return <p className={`mt-4 rounded-[12px] px-3 py-2.5 text-[13px] font-semibold leading-snug ${c}`}>{children}</p>;
}

// Desenho do cupom: topo com o nome do mercado, as faixas das partes e o rodape com o
// total e o QR. A faixa da vez fica laranja; as tiradas, verdes.
// buracos: faixas (1..n; n = antes do rodape) DEPOIS das quais faltou um pedaco.
// ruins: faixas borradas.
function DesenhoCupom({
  faixas,
  atual,
  feitas,
  rodapeFeito = false,
  buracos = [],
  ruins = [],
}: {
  faixas: number;
  atual: number | "rodape" | null;
  feitas: number;
  rodapeFeito?: boolean;
  buracos?: number[];
  ruins?: number[];
}) {
  const n = Math.min(faixas, 8);
  return (
    <div aria-hidden className="w-[92px] shrink-0 rounded-t-[6px] bg-card-2 p-1.5 shadow-[0_2px_8px_var(--shadow)] [clip-path:polygon(0_0,100%_0,100%_100%,90%_97%,80%_100%,70%_97%,60%_100%,50%_97%,40%_100%,30%_97%,20%_100%,10%_97%,0_100%)]">
      <div className="mx-auto mb-1 h-1.5 w-12 rounded bg-text-3/40" />
      <div className="mx-auto mb-1.5 h-1 w-16 rounded bg-text-3/25" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: n }, (_, i) => {
          const k = i + 1;
          const feita = k <= feitas;
          const daVez = atual === k;
          const ruim = ruins.includes(k);
          return (
            <div key={k} className="flex flex-col gap-1">
            {buracos.includes(k - 1) && <Buraco />}
            <div
              className={`relative flex h-[38px] flex-col justify-center gap-[3px] rounded-[4px] px-1.5 ${
                ruim ? "bg-neg-soft ring-2 ring-neg" : daVez ? "bg-brand-soft ring-2 ring-brand" : feita ? "bg-pos-soft" : "bg-card"
              }`}
            >
              {[0, 1, 2, 3].map((l) => (
                <div key={l} className={`h-[3px] rounded ${daVez ? "bg-brand/50" : "bg-text-3/30"}`} style={{ width: `${88 - l * 9}%` }} />
              ))}
              <span className={`absolute right-1 top-0.5 text-[10px] font-extrabold ${ruim ? "text-neg" : daVez ? "text-brand" : feita ? "text-pos" : "text-text-3"}`}>
                {ruim ? "!" : feita ? "✓" : k}
              </span>
            </div>
            </div>
          );
        })}
        {buracos.includes(n) && <Buraco />}
        <div
          className={`relative mt-0.5 flex h-[42px] items-center justify-between gap-1 rounded-[4px] px-1.5 ${
            atual === "rodape" ? "bg-brand-soft ring-2 ring-brand" : rodapeFeito ? "bg-pos-soft" : "bg-card"
          }`}
        >
          <div className="flex flex-col gap-[3px]">
            <div className={`text-[8px] font-extrabold ${atual === "rodape" ? "text-brand" : "text-text-2"}`}>TOTAL</div>
            <div className="h-[3px] w-8 rounded bg-text-3/40" />
          </div>
          <div className="grid h-6 w-6 grid-cols-3 gap-[1px] rounded-[2px] bg-text/80 p-[2px]">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={i % 2 ? "bg-card" : "bg-transparent"} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// O pedaco que ficou de fora entre duas fotos: tracejado vermelho com "?".
function Buraco() {
  return (
    <div className="relative flex h-[16px] items-center rounded-[3px] border-2 border-dashed border-neg bg-neg-soft">
      <span className="mx-auto text-[10px] font-extrabold leading-none text-neg">? faltou</span>
    </div>
  );
}
