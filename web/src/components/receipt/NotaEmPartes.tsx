"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { contarItens, juntarComEmendas, totalConfere, type Cupom } from "@/lib/cupomPartes";
import { brl } from "@/lib/format";
import { CameraCupom } from "./CameraCupom";
import { adicionarFotos, definirAlvo, descartarNota, lerDeNovo, marcarNotaAberta, tirarFoto, useFilaNota, type Parte } from "@/lib/filaNota";

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

export function NotaEmPartes({
  titulo,
  lerArquivo,
  onPronto,
  onSair,
  onFechar,
  comecarNaCamera = false,
}: {
  onFechar?: () => void; // fecha a nota; a leitura continua em segundo plano
  comecarNaCamera?: boolean;
  titulo: string;
  lerArquivo: (f: File) => Promise<string>;
  onPronto: (c: Cupom, confere: boolean, fotos: string[]) => void;
  onSair: () => void;
}) {
  // As fotos e a leitura moram na fila (lib/filaNota): fechar esta tela nao para a
  // leitura; um aviso flutuante chama de volta quando ficar pronta.
  const { partes, alvo } = useFilaNota();
  useEffect(() => {
    marcarNotaAberta(true);
    return () => marcarNotaAberta(false);
  }, []);
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

  async function chegou(arquivos: File[], galeria = false) {
    if (!arquivos.length) return;
    const fotos = (await Promise.all(arquivos.map((f) => lerArquivo(f).catch(() => "")))).filter(Boolean);
    if (!fotos.length) return;
    // Da galeria, de uma vez: as fotos escolhidas SAO o plano (1 foto = cupom pequeno).
    if (galeria && !partes.length && destinoRef.current.trocar == null) definirAlvo(fotos.length);
    adicionar(fotos);
  }

  function adicionar(fotos: string[]) {
    const destino = destinoRef.current;
    destinoRef.current = {};
    adicionarFotos(fotos, destino);
  }

  // Uma camera so: a do app (o dono tirou a opcao "camera do celular"). Refazer uma foto
  // ou o pedaco do meio tambem passa por ela e fecha depois de UMA foto. A do celular so
  // entra se a do app nao abrir (permissao negada).
  // Refazendo UMA foto (tirar de novo / pedaco do meio): a camera nao diz "chegou ao
  // TOTAL" e fecha depois dela. Antes o botao de foto ficava desligado quando outra foto
  // ja tinha o TOTAL e o "Tirar de novo" abria uma camera sem botao (print do dono).
  const [umaFoto, setUmaFoto] = useState(false);
  function abrir(galeria = false, destino: { trocar?: number; antesDe?: number } = {}) {
    destinoRef.current = destino;
    if (galeria) return galRef.current?.click();
    if (semCamera) return camRef.current?.click();
    setUmaFoto(destino.trocar != null || destino.antesDe != null);
    setCamera(true);
  }

  // --- conta ---
  const faltaFoto = partes.length < alvo;
  const proxima = partes.length + 1;
  const okPartes = partes.filter((p) => p.estado === "ok");
  const comErro = partes.filter((p) => p.estado === "erro");
  // Foto que falhou nao trava: as que leram ja dao para conferir (print do dono: a 1 leu
  // 45 de 46 com o TOTAL e a 2 falhou; o botao Conferir ficava desligado).
  const todasLidas = !faltaFoto && !lendo && okPartes.length > 0;
  // Juntar e o quebra-cabeca das fotos (pode levar ~1 s no celular com 15 fotos): so
  // refaz quando uma foto muda, nao a cada segundo do relogio "lendo... N s".
  const junta = useMemo(() => {
    const oks = partes.filter((p) => p.estado === "ok");
    return oks.length ? juntarComEmendas(oks.map((p) => p.cupom!)) : null;
  }, [partes]);
  const cupom = junta?.cupom ?? null;
  const qtd = cupom?.qtdItens ?? 0;
  const lidos = cupom ? contarItens(cupom.itens, qtd).lidos : 0;
  const nome = (p: Parte) => `foto ${partes.indexOf(p) + 1}`;
  // Leu itens de sobra: nao e buraco (buraco so faz faltar), entao nao manda tirar o meio
  const sobra = qtd > 0 && lidos > qtd;
  // A conta e do app, nao da pessoa (dono: "nao cabe ao usuario saber o que sao esses
  // itens a mais"). Diferenca pequena vai para a conferencia, onde a FaltaNaNota aponta
  // a linha. Aqui so se pede foto quando o problema e de FOTO: faltou o rodape, ou um
  // pedaco grande do cupom ficou de fora (as fotos nao se encostaram e faltam 3+ itens).
  const faltam = qtd > 0 ? qtd - lidos : 0;
  const buracos = todasLidas && faltam >= 3 ? (junta?.semEmenda ?? []).map((i) => ({ antes: okPartes[i - 1], depois: okPartes[i] })) : [];
  // foto aberta em tela cheia (tocar na miniatura)
  const [vendo, setVendo] = useState<number | null>(null);
  const fotoAberta = partes.find((p) => p.id === vendo);
  const ultimaOk = okPartes[okPartes.length - 1];
  const semTotal = todasLidas && !qtd && !cupom?.total;
  const bate = todasLidas && qtd > 0 && lidos === qtd;
  const problema = todasLidas && !bate && (semTotal || buracos.length > 0);

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
      instrucao = <>Abra a <b>câmera</b> e fotografe o cupom <b>de perto</b>, em partes, de cima até o <b>TOTAL</b>. Na dúvida, tire foto a mais: pode repetir pedaço, eu junto <b>sem duplicar</b>.</>;
    } else {
      tituloAgora = `Foto ${proxima}: metade de baixo`;
      instrucao = <>Do <b>meio</b> até o <b>TOTAL</b> e o QR. <b>Repita umas 3 linhas</b> do fim da foto {proxima - 1}: é assim que eu confiro se não pulou nada.</>;
    }
  } else if (lendo) {
    tituloAgora = "Lendo as fotos…";
    instrucao = (
      <>
        Pode <b>fechar</b> e usar o app: eu continuo lendo e aviso quando a nota ficar pronta.
      </>
    );
  } else if (comErro.length && !(todasLidas && qtd > 0 && lidos === qtd)) {
    const daIa = comErro.some((p) => p.erro === "ia");
    tituloAgora = daIa ? "A leitura está ocupada" : "Uma foto não deu para ler";
    instrucao = daIa ? (
      <>Não é a sua foto: a IA está sobrecarregada agora. Toque em <b>Ler de novo</b> daqui a pouco (a foto fica guardada), ou em <b>Conferir itens</b> com o que já leu.</>
    ) : (
      <>Não achei itens na foto marcada. Toque nela para ver e tire de novo mais de perto, ou <b>Tirar fora</b>.</>
    );
  } else if (bate) {
    tituloAgora = `✓ ${qtd} de ${qtd} itens`;
    instrucao = <>Prova real ok: li todos os itens que o cupom diz. Toque em <b>Conferir itens</b>.</>;
  } else if (problema) {
    tituloAgora = semTotal ? "Faltou o rodapé" : `Faltam ${faltam} itens`;
    instrucao = <>Veja abaixo qual foto tirar.</>;
  } else {
    tituloAgora = `Li ${lidos}${qtd ? ` de ${qtd}` : ""} itens`;
    instrucao = <>Toque em <b>Conferir itens</b>: na próxima tela eu aponto onde está a diferença{sobra ? "" : " e você preenche"}.</>;
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
            itens: p.cupom ? p.cupom.itens.length : 0,
            temTotal: !!p.cupom && (p.cupom.total > 0 || p.cupom.qtdItens > 0),
          }))}
          fim={fimNaCamera && !umaFoto}
          onFoto={(f) => {
            adicionar([f]);
            if (umaFoto) {
              setUmaFoto(false);
              setCamera(false);
            }
          }}
          onPronto={() => {
            definirAlvo(partes.length);
            setCamera(false);
          }}
          onFechar={() => setCamera(false)}
          onSemCamera={() => {
            setCamera(false);
            setSemCamera(true);
          }}
        />
      )}
      {/* Foto em tela cheia: ver o que a foto pegou antes de decidir tirar de novo. Tocar na
          foto alterna zoom (2x, arrastando para ver). */}
      {fotoAberta && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setVendo(null)} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-[18px]">
              ✕
            </button>
            <span className="text-[15px] font-extrabold">
              Foto {partes.indexOf(fotoAberta) + 1}
              {fotoAberta.estado === "ok" ? ` · ${fotoAberta.cupom!.itens.length} linhas` : fotoAberta.estado === "erro" ? " · não deu para ler" : " · lendo…"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoAberta.foto}
              alt="Foto da nota"
              onClick={(e) => e.currentTarget.classList.toggle("w-[200%]")}
              className="mx-auto block w-full max-w-none object-contain"
            />
          </div>
          <div className="flex gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => {
                const id = fotoAberta.id;
                setVendo(null);
                tirarFoto(id);
              }}
              className="h-12 flex-1 rounded-full bg-white/15 text-[15px] font-bold"
            >
              Tirar fora
            </button>
            <button
              type="button"
              onClick={() => {
                const id = fotoAberta.id;
                setVendo(null);
                abrir(false, { trocar: id });
              }}
              className="h-12 flex-[2] rounded-full bg-[#FF7A1A] text-[15px] font-extrabold text-black"
            >
              📷 Tirar de novo
            </button>
          </div>
        </div>
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
          estados={partes.map((p) => (p.estado === "erro" ? "ruim" : p.estado === "ok" ? "ok" : "lendo"))}
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
              texto="O fim de uma não aparece no começo da outra. Toque nas fotos para ver. Fotografe só o meio, repetindo umas linhas de cada lado."
              botao="📷 Tirar o pedaço do meio"
              onClick={() => abrir(false, { antesDe: b.depois.id })}
              fotos={[b.antes, b.depois].map((p) => ({ src: p.foto, rotulo: String(partes.indexOf(p) + 1), onVer: () => setVendo(p.id) }))}
            />
          ))}
        </ul>
      )}

      {/* As fotos tiradas */}
      {partes.length > 0 && (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {partes.map((p, i) => (
            <li key={p.id} className="relative w-[84px] shrink-0">
              <button type="button" onClick={() => setVendo(p.id)} aria-label={`Ver a foto ${i + 1}`} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.foto} alt={`Foto ${i + 1}`} className="h-24 w-full rounded-[10px] border border-border object-cover" />
              </button>
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
              <div className="mt-1 text-center text-[11px] font-bold leading-tight">
                {p.estado === "lendo" && (
                  <span className="text-text-3">
                    {p.tentativa > 1 ? `IA ocupada, ${p.tentativa}ª tentativa…` : `lendo… ${relogio(p)} s`}
                  </span>
                )}
                {p.estado === "ok" && <span className="text-pos">✓ {p.cupom!.itens.length} linhas</span>}
                {p.estado === "erro" && (
                  <span className="flex flex-col gap-0.5">
                    {p.erro === "ia" ? (
                      <button type="button" onClick={() => lerDeNovo(p.id)} className="text-neg underline">
                        Ler de novo
                      </button>
                    ) : (
                      <button type="button" onClick={() => abrir(false, { trocar: p.id })} className="text-neg underline">
                        Tirar de novo
                      </button>
                    )}
                    <button type="button" onClick={() => tirarFoto(p.id)} className="text-text-3 underline">
                      Tirar fora
                    </button>
                  </span>
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
        ) : lendo && onFechar ? (
          // nao trava a pessoa esperando a IA: fecha e o aviso flutuante chama quando ficar pronta
          <button type="button" onClick={onFechar} className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink">
            Fechar · aviso quando ficar pronta
          </button>
        ) : (
          <button
            type="button"
            disabled={!todasLidas}
            onClick={() => cupom && onPronto(cupom, totalConfere(cupom), okPartes.map((p) => p.foto))}
            className="h-[52px] rounded-full bg-brand text-[16px] font-extrabold text-brand-ink disabled:opacity-50"
          >
            {lendo ? "Lendo as fotos…" : "Conferir itens"}
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
        {partes.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Descartar as fotos desta nota?")) {
                descartarNota();
                onSair();
              }
            }}
            className="h-9 text-[13px] font-bold text-text-3 underline"
          >
            Descartar esta nota
          </button>
        )}
      </div>
      {inputs}
    </div>
  );
}

function Problema({
  titulo,
  texto,
  botao,
  onClick,
  fotos = [],
}: {
  titulo: string;
  texto: string;
  botao: string;
  onClick: () => void;
  fotos?: { src: string; rotulo: string; onVer: () => void }[];
}) {
  return (
    <li className="rounded-[14px] border-2 border-neg/40 bg-neg-soft p-3">
      <div className="text-[14px] font-extrabold leading-snug text-text">🔴 {titulo}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-text-2">{texto}</div>
      {fotos.length > 0 && (
        <div className="mt-2 flex gap-2">
          {fotos.map((f) => (
            <button key={f.rotulo} type="button" onClick={f.onVer} className="relative h-20 w-16 overflow-hidden rounded-[8px] border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt={`Foto ${f.rotulo}`} className="h-full w-full object-cover" />
              <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{f.rotulo}</span>
            </button>
          ))}
        </div>
      )}
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
