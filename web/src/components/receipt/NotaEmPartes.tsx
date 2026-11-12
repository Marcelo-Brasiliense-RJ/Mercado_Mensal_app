"use client";

import { useEffect, useRef, useState } from "react";
import { contarComoNoCupom, juntarComEmendas, totalConfere, type Cupom } from "@/lib/cupomPartes";
import { brl } from "@/lib/format";
import { CameraCupom } from "./CameraCupom";

// Nota fiscal em fotos, com o app guiando. Desenho atual (pedido do dono, 2026-11-12,
// depois de testar com 3 partes + rodape: demorou e "na segunda ja dava pra ver tudo"):
//
// - PADRAO: 2 fotos, na ordem natural. Foto 1 = metade de cima; Foto 2 = metade de baixo,
//   ate o TOTAL e o QR, repetindo umas linhas do fim da foto 1 (a emenda que compara).
// - Cupom pequeno: "1 foto so".
// - Cada foto e lida assim que tirada; se a leitura falhar, tenta de novo sozinha.
// - PROVA REAL no fim: itens lidos (contados como o cupom conta) x "Qtde. total de itens".
//   Faltou? Mostra ONDE: buraco entre as fotos (tirar o meio), foto borrada (tirar de
//   novo) ou o TOTAL nao apareceu (a ultima foto nao pegou o rodape).

type Parte = { id: number; foto: string; estado: "lendo" | "ok" | "erro"; cupom?: Cupom; erro?: string; desde: number; tentativa: number };

let proximoId = 1;

export function NotaEmPartes({
  titulo,
  lerArquivo,
  onPronto,
  onSair,
  comecarNaCamera = false,
}: {
  comecarNaCamera?: boolean;
  titulo: string;
  lerArquivo: (f: File) => Promise<string>;
  onPronto: (c: Cupom, confere: boolean) => void;
  onSair: () => void;
}) {
  const [partes, setPartes] = useState<Parte[]>([]);
  const [alvo, setAlvo] = useState(2); // quantas fotos o plano pede (1 = cupom pequeno)
  const [agora, setAgora] = useState(() => Date.now());
  // Camera do app (guia o enquadramento e separa as partes); a do celular fica de reserva.
  const [camera, setCamera] = useState(comecarNaCamera);
  const [semCamera, setSemCamera] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  // trocar: refaz uma foto; antesDe: poe uma foto nova antes desta (o pedaco que faltou)
  const destinoRef = useRef<{ trocar?: number; antesDe?: number }>({});

  const lendo = partes.some((p) => p.estado === "lendo");
  // relogio da leitura ("lendo... 18 s"): so anda enquanto alguma foto esta sendo lida
  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lendo]);

  function atualizar(id: number, patch: Partial<Parte>) {
    setPartes((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function ler(id: number, foto: string, tentativa = 1) {
    atualizar(id, { estado: "lendo", erro: undefined, desde: Date.now(), tentativa });
    let erro = "";
    try {
      const r = await fetch("/api/receipt-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: foto }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok?: boolean; erro?: string; itens?: Cupom["itens"]; total?: number; emitente?: string; chave?: string; qtd_itens?: number }
        | null;
      if (d?.ok && Array.isArray(d.itens)) {
        return atualizar(id, {
          estado: "ok",
          cupom: { itens: d.itens, total: Number(d.total) || 0, emitente: d.emitente ?? "", chave: d.chave ?? "", qtdItens: Number(d.qtd_itens) || 0 },
        });
      }
      erro = d?.erro === "limite" ? "A leitura está ocupada agora." : "Não consegui ler esta foto.";
    } catch {
      erro = "Sem internet?";
    }
    // Uma segunda tentativa sozinha: a IA as vezes fica sobrecarregada um instante.
    if (tentativa < 2) {
      await new Promise((ok) => setTimeout(ok, 3000));
      return ler(id, foto, tentativa + 1);
    }
    atualizar(id, { estado: "erro", erro });
  }

  async function chegou(arquivos: File[], galeria = false) {
    if (!arquivos.length) return;
    const fotos = (await Promise.all(arquivos.map((f) => lerArquivo(f).catch(() => "")))).filter(Boolean);
    if (!fotos.length) return;
    // Da galeria, de uma vez: as fotos escolhidas SAO o plano (1 foto = cupom pequeno).
    if (galeria && !partes.length && destinoRef.current.trocar == null) setAlvo(fotos.length);
    adicionar(fotos);
  }

  function adicionar(fotos: string[]) {
    const { trocar, antesDe } = destinoRef.current;
    destinoRef.current = {};
    if (trocar != null) {
      setPartes((l) => l.map((p) => (p.id === trocar ? { ...p, foto: fotos[0] } : p)));
      void ler(trocar, fotos[0]);
      return;
    }
    const novas: Parte[] = fotos.map((foto) => ({ id: proximoId++, foto, estado: "lendo", desde: Date.now(), tentativa: 1 }));
    setPartes((l) => {
      const i = antesDe != null ? l.findIndex((p) => p.id === antesDe) : -1;
      return i >= 0 ? [...l.slice(0, i), ...novas, ...l.slice(i)] : [...l, ...novas];
    });
    for (const p of novas) void ler(p.id, p.foto);
  }

  // Uma camera so: a do app (o dono tirou a opcao "camera do celular"). Refazer uma foto
  // ou o pedaco do meio tambem passa por ela e fecha depois de UMA foto. A do celular so
  // entra se a do app nao abrir (permissao negada).
  const umaFotoRef = useRef(false);
  function abrir(galeria = false, destino: { trocar?: number; antesDe?: number } = {}) {
    destinoRef.current = destino;
    if (galeria) return galRef.current?.click();
    if (semCamera) return camRef.current?.click();
    umaFotoRef.current = destino.trocar != null || destino.antesDe != null;
    setCamera(true);
  }

  // --- conta ---
  const faltaFoto = partes.length < alvo;
  const proxima = partes.length + 1;
  const okPartes = partes.filter((p) => p.estado === "ok");
  const comErro = partes.filter((p) => p.estado === "erro");
  const todasLidas = !faltaFoto && !lendo && !comErro.length && okPartes.length > 0;
  const junta = okPartes.length ? juntarComEmendas(okPartes.map((p) => p.cupom!)) : null;
  const cupom = junta?.cupom ?? null;
  const qtd = cupom?.qtdItens ?? 0;
  const lidos = cupom ? contarComoNoCupom(cupom.itens) : 0;
  const nome = (p: Parte) => `foto ${partes.indexOf(p) + 1}`;
  // Leu itens de sobra: nao e buraco (buraco so faz faltar), entao nao manda tirar o meio
  const sobra = qtd > 0 && lidos > qtd;
  const buracos = todasLidas && !sobra ? (junta?.semEmenda ?? []).map((i) => ({ antes: okPartes[i - 1], depois: okPartes[i] })) : [];
  const borradas = todasLidas ? okPartes.map((p) => ({ p, n: p.cupom!.itens.filter((it) => it.duvida).length })).filter((x) => x.n > 0) : [];
  const ultimaOk = okPartes[okPartes.length - 1];
  const semTotal = todasLidas && !qtd && !cupom?.total;
  const bate = todasLidas && qtd > 0 && lidos === qtd;
  const problema = todasLidas && !bate;

  const inputs = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void chegou(f); }} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void chegou(f, true); }} />
    </>
  );

  // ----- titulo e instrucao do momento -----
  let tituloAgora: string;
  let instrucao: React.ReactNode;
  if (faltaFoto) {
    if (alvo === 1) {
      tituloAgora = "1 foto do cupom inteiro";
      instrucao = <>Do <b>nome do mercado</b> até o <b>TOTAL</b>. Se as letras ficarem pequenas, use 2 fotos.</>;
    } else if (proxima === 1) {
      tituloAgora = "Fotografe o cupom";
      instrucao = <>Abra a <b>câmera</b> e fotografe o cupom <b>de perto</b>, em partes, de cima até o <b>TOTAL</b>. Você toca no botão em cada parte.</>;
    } else {
      tituloAgora = `Foto ${proxima}: metade de baixo`;
      instrucao = <>Do <b>meio</b> até o <b>TOTAL</b> e o QR. <b>Repita umas 3 linhas</b> do fim da foto {proxima - 1}: é assim que eu confiro se não pulou nada.</>;
    }
  } else if (lendo) {
    tituloAgora = "Lendo as fotos…";
    instrucao = <>Leva alguns segundos por foto.</>;
  } else if (comErro.length) {
    tituloAgora = "Uma foto não deu para ler";
    instrucao = <>Toque em <b>Tirar de novo</b> na foto marcada, mais de perto e com luz.</>;
  } else if (bate) {
    tituloAgora = `✓ ${qtd} de ${qtd} itens`;
    instrucao = <>Prova real ok: li todos os itens que o cupom diz. Toque em <b>Conferir itens</b>.</>;
  } else if (sobra) {
    tituloAgora = `${lidos - qtd} ${lidos - qtd === 1 ? "item" : "itens"} a mais`;
    instrucao = <>Alguma linha entrou repetida ou uma quantidade foi lida a mais. Confira na próxima tela.</>;
  } else {
    tituloAgora = qtd ? `Faltam ${qtd - lidos} itens` : "Confira o que faltou";
    instrucao = <>Veja abaixo <b>onde faltou</b> e toque no botão.</>;
  }

  const relogio = (p: Parte) => Math.max(0, Math.round((agora - p.desde) / 1000));

  const fimNaCamera = partes.some((p) => p.estado === "ok" && (p.cupom!.total > 0 || p.cupom!.qtdItens > 0));

  return (
    <div>
      {camera && (
        <CameraCupom
          partes={partes.map((p) => ({
            foto: p.foto,
            estado: p.estado,
            itens: p.cupom ? contarComoNoCupom(p.cupom.itens) : 0,
            temTotal: !!p.cupom && (p.cupom.total > 0 || p.cupom.qtdItens > 0),
          }))}
          fim={fimNaCamera}
          onFoto={(f) => {
            adicionar([f]);
            if (umaFotoRef.current) {
              umaFotoRef.current = false;
              setCamera(false);
            }
          }}
          onPronto={() => {
            setAlvo(partes.length);
            setCamera(false);
          }}
          onFechar={() => setCamera(false)}
          onSemCamera={() => {
            setCamera(false);
            setSemCamera(true);
          }}
        />
      )}
      <div className="mb-1 text-[13px] font-bold text-text-2">{titulo}</div>
      {semCamera && (
        <p className="mb-2 rounded-[12px] bg-warn-soft px-3 py-2 text-[13px] leading-snug">
          A câmera não abriu (permissão negada?). Libere a câmera para o app ou use a <b>Galeria</b>.
        </p>
      )}
      {cupom && (cupom.total > 0 || qtd > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[12px] font-bold">
          {cupom.total > 0 && <span className="rounded-full bg-card-2 px-2.5 py-1">Total {brl(cupom.total)}</span>}
          {qtd > 0 && <span className="rounded-full bg-card-2 px-2.5 py-1">{qtd} itens no cupom</span>}
        </div>
      )}
      <h2 className={`text-[22px] font-extrabold leading-tight ${problema ? "text-neg" : bate ? "text-pos" : ""}`}>{tituloAgora}</h2>

      <div className="mt-3 flex gap-4">
        <DesenhoCupom
          n={Math.max(alvo, partes.length)}
          atual={faltaFoto ? proxima : null}
          estados={partes.map((p) => (borradas.some((b) => b.p.id === p.id) || p.estado === "erro" ? "ruim" : p.estado === "ok" ? "ok" : "lendo"))}
          buracos={buracos.map((b) => partes.indexOf(b.depois))}
        />
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          <p>{instrucao}</p>
          {cupom && (
            <p className={`mt-3 text-[15px] font-extrabold ${bate ? "text-pos" : ""}`}>
              Li {lidos}{qtd ? ` de ${qtd}` : ""} itens
            </p>
          )}
        </div>
      </div>

      {/* Onde faltou: cada problema com o botao que resolve */}
      {problema && (
        <ul className="mt-4 space-y-2">
          {semTotal && ultimaOk && (
            <Problema
              titulo={`A ${nome(ultimaOk)} não pegou o TOTAL`}
              texto="Sem o rodapé eu não consigo conferir. Tire de novo pegando até o QR."
              botao={`📷 Tirar a ${nome(ultimaOk)} de novo`}
              onClick={() => abrir(false, { trocar: ultimaOk.id })}
            />
          )}
          {buracos.map((b, i) => (
            <Problema
              key={`b${i}`}
              titulo={`Faltou um pedaço entre a ${nome(b.antes)} e a ${nome(b.depois)}`}
              texto="As duas fotos não se encostaram. Fotografe só o meio, repetindo umas linhas de cada lado."
              botao="📷 Tirar o pedaço do meio"
              onClick={() => abrir(false, { antesDe: b.depois.id })}
            />
          ))}
          {borradas.map(({ p, n }) => (
            <Problema
              key={`r${p.id}`}
              titulo={`A ${nome(p)} tem ${n} ${n === 1 ? "linha borrada" : "linhas borradas"}`}
              texto="Chegue mais perto ou divida essa metade em duas fotos."
              botao={`📷 Tirar a ${nome(p)} de novo`}
              onClick={() => abrir(false, { trocar: p.id })}
            />
          ))}
          {!semTotal && !buracos.length && !borradas.length && (
            <li className="rounded-[12px] bg-warn-soft p-3 text-[13px] leading-snug">
              {lidos < qtd ? (
                <>As fotos se encostaram e estão legíveis: o mais provável é uma <b>quantidade</b> lida errada (ex.: 6 pacotes como 1). Confira na próxima tela. Cupom muito grande? Tire <b>mais uma foto do meio</b>.</>
              ) : (
                <>Alguma quantidade foi lida a mais. Confira as quantidades na próxima tela.</>
              )}
              {lidos < qtd && ultimaOk && (
                <button type="button" onClick={() => abrir(false, { antesDe: ultimaOk.id })} className="mt-2 h-10 w-full rounded-full border border-border bg-card text-[14px] font-bold">
                  📷 Mais uma foto do meio
                </button>
              )}
            </li>
          )}
        </ul>
      )}

      {/* As fotos tiradas */}
      {partes.length > 0 && (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {partes.map((p, i) => (
            <li key={p.id} className="relative w-[84px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.foto} alt={`Foto ${i + 1}`} className="h-24 w-full rounded-[10px] border border-border object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
              <div className="mt-1 text-center text-[11px] font-bold leading-tight">
                {p.estado === "lendo" && (
                  <span className="text-text-3">
                    lendo… {relogio(p)} s{p.tentativa > 1 ? " (2ª vez)" : ""}
                  </span>
                )}
                {p.estado === "ok" && <span className="text-pos">✓ {contarComoNoCupom(p.cupom!.itens)} itens</span>}
                {p.estado === "erro" && (
                  <button type="button" onClick={() => abrir(false, { trocar: p.id })} className="text-neg underline">
                    Tirar de novo
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div data-rodape className="mt-4 flex flex-col gap-2">
        {partes.length === 0 && !semCamera ? (
          <button type="button" onClick={() => abrir()} className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink">
            📷 Abrir câmera
          </button>
        ) : faltaFoto ? (
          <button type="button" onClick={() => abrir()} className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink">
            📷 {alvo === 1 ? "Tirar a foto do cupom" : proxima === 1 ? "Tirar foto 1 (metade de cima)" : `Tirar foto ${proxima} (metade de baixo)`}
          </button>
        ) : (
          <button
            type="button"
            disabled={!todasLidas}
            onClick={() => cupom && onPronto(cupom, totalConfere(cupom))}
            className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
          >
            {lendo ? "Lendo as fotos…" : bate ? "Conferir itens" : "Conferir assim mesmo"}
          </button>
        )}
        <div className="flex gap-2">
          {partes.length === 0 ? (
            <>
              <button type="button" onClick={onSair} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">Voltar</button>
            </>
          ) : (
            !faltaFoto && (
              <button type="button" onClick={() => abrir(false, { antesDe: partes[partes.length - 1].id })} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">
                + Foto do meio
              </button>
            )
          )}
          <button type="button" onClick={() => abrir(true)} className="h-11 flex-1 rounded-full border border-border text-[14px] font-bold">
            🖼 Galeria
          </button>
        </div>
      </div>
      {inputs}
    </div>
  );
}

function Problema({ titulo, texto, botao, onClick }: { titulo: string; texto: string; botao: string; onClick: () => void }) {
  return (
    <li className="rounded-[14px] border-2 border-neg/40 bg-neg-soft p-3">
      <div className="text-[14px] font-extrabold leading-snug text-text">🔴 {titulo}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-text-2">{texto}</div>
      <button type="button" onClick={onClick} className="mt-2 h-10 w-full rounded-full bg-brand text-[14px] font-extrabold text-brand-ink">
        {botao}
      </button>
    </li>
  );
}

// Desenho do cupom: n faixas de cima para baixo; a ultima traz o TOTAL e o QR. A faixa da
// vez fica laranja; lida, verde; com problema, vermelha. "? faltou" entre duas fotos que
// nao se encostaram.
function DesenhoCupom({
  n,
  atual,
  estados,
  buracos,
}: {
  n: number;
  atual: number | null;
  estados: ("ok" | "lendo" | "ruim")[];
  buracos: number[]; // indice da faixa (0-based) ANTES da qual faltou um pedaco
}) {
  const total = Math.min(Math.max(n, 1), 6);
  return (
    <div aria-hidden className="w-[92px] shrink-0 rounded-t-[6px] bg-card-2 p-1.5 shadow-[0_2px_8px_var(--shadow)] [clip-path:polygon(0_0,100%_0,100%_100%,90%_97%,80%_100%,70%_97%,60%_100%,50%_97%,40%_100%,30%_97%,20%_100%,10%_97%,0_100%)]">
      <div className="mx-auto mb-1 h-1.5 w-12 rounded bg-text-3/40" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: total }, (_, i) => {
          const k = i + 1;
          const est = estados[i];
          const daVez = atual === k;
          const ultima = k === total;
          const fundo = est === "ruim" ? "bg-neg-soft ring-2 ring-neg" : daVez ? "bg-brand-soft ring-2 ring-brand" : est === "ok" ? "bg-pos-soft" : "bg-card";
          return (
            <div key={k} className="flex flex-col gap-1">
              {buracos.includes(i) && (
                <div className="flex h-[16px] items-center rounded-[3px] border-2 border-dashed border-neg bg-neg-soft">
                  <span className="mx-auto text-[10px] font-extrabold leading-none text-neg">? faltou</span>
                </div>
              )}
              <div className={`relative flex flex-col justify-center gap-[3px] rounded-[4px] px-1.5 py-1.5 ${fundo} ${total <= 2 ? "min-h-[64px]" : "min-h-[40px]"}`}>
                {[0, 1, 2, 3].map((l) => (
                  <div key={l} className={`h-[3px] rounded ${daVez ? "bg-brand/50" : "bg-text-3/30"}`} style={{ width: `${88 - l * 9}%` }} />
                ))}
                {ultima && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`text-[8px] font-extrabold ${daVez ? "text-brand" : "text-text-2"}`}>TOTAL</span>
                    <span className="grid h-4 w-4 grid-cols-3 gap-[1px] rounded-[1px] bg-text/80 p-[1px]">
                      {Array.from({ length: 9 }, (_, q) => (
                        <span key={q} className={q % 2 ? "bg-card" : "bg-transparent"} />
                      ))}
                    </span>
                  </div>
                )}
                <span className={`absolute right-1 top-0.5 text-[10px] font-extrabold ${est === "ruim" ? "text-neg" : daVez ? "text-brand" : est === "ok" ? "text-pos" : "text-text-3"}`}>
                  {est === "ruim" ? "!" : est === "ok" ? "✓" : k}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
