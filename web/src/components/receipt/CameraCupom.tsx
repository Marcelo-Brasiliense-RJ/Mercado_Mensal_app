"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abrirCamera, soltarCamera } from "@/lib/camera";
import { DICA, medir, recorteNoVideo, veredito, type Veredito } from "@/lib/quadroCupom";

// Camera do PROPRIO app para fotografar a nota (pedido do dono: "a aplicacao vai
// identificando se o enquadramento ta bom e vai separando as partes"). A camera do
// iPhone nao sabe nada do cupom; aqui o app:
// - mostra uma moldura e diz ao vivo se da para ler (luz, perto, firme, foco);
// - a foto e SEMPRE no botao. A automatica saiu (2026-11-12): luz, papel e nitidez num
//   quadro pequeno nao dizem se as letras dao para ler. Medido nas fotos do dono: o
//   cupom inteiro de longe e o celular virando davam as MESMAS notas que a foto boa, e o
//   app tirava 3 fotos ruins em segundos ("ta se precipitando");
// - depois da Parte 1, mostra o fim dela "fantasma" no topo da moldura, para a proxima
//   repetir umas linhas (como foto panoramica);
// - para quando uma parte lida traz o TOTAL ("chegou ao fim do cupom").

export type ParteCamera = { foto: string; estado: "lendo" | "ok" | "erro"; itens: number; temTotal: boolean };

const ANALISE_W = 120; // quadro reduzido para medir (rapido no celular)
const FOTO_MAX = 1600;
const FAIXA = 0.2; // pedaco do fim da parte anterior mostrado no topo da moldura

export function CameraCupom({
  partes,
  fim,
  onFoto,
  onPronto,
  onFechar,
  onSemCamera,
}: {
  partes: ParteCamera[];
  fim: boolean; // alguma parte lida trouxe o TOTAL
  onFoto: (dataUrl: string) => void;
  onPronto: () => void;
  onFechar: () => void;
  onSemCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  // Fim da parte anterior, recortado de DENTRO da moldura no momento da foto.
  const [fantasma, setFantasma] = useState<string | null>(null);
  const [dica, setDica] = useState<Veredito | null>(null);
  const [flash, setFlash] = useState(false);
  const melhorRef = useRef(0);
  const anteriorRef = useRef<Uint8ClampedArray | null>(null);
  const movsRef = useRef<number[]>([]);

  // As funcoes do pai chegam novas a cada render (o relogio "lendo... N s" redesenha a
  // tela 1x por segundo). Ficam em ref: se fossem dependencia dos efeitos, a camera
  // desligava e religava a cada segundo enquanto lia a foto anterior (tela piscando,
  // e foto preta no botao).
  const onFotoRef = useRef(onFoto);
  const onSemCameraRef = useRef(onSemCamera);
  useEffect(() => {
    onFotoRef.current = onFoto;
    onSemCameraRef.current = onSemCamera;
  });

  // liga a camera (uma vez so, enquanto a tela da camera estiver aberta)
  useEffect(() => {
    let vivo = true;
    abrirCamera()
      .then((s) => {
        if (!vivo || !videoRef.current) return;
        videoRef.current.srcObject = s;
        void videoRef.current.play().catch(() => {});
      })
      .catch(() => vivo && onSemCameraRef.current());
    return () => {
      vivo = false;
      soltarCamera();
    };
  }, []);

  const tirar = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, FOTO_MAX / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * escala);
    c.height = Math.round(v.videoHeight * escala);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    // Fim da moldura (o que a pessoa via na faixa de baixo dela), para encaixar a proxima
    const mold = molduraRef.current?.getBoundingClientRect();
    const tela = v.getBoundingClientRect();
    if (mold && tela.width) {
      const r = recorteNoVideo(v.videoWidth, v.videoHeight, { x: tela.x, y: tela.y, w: tela.width, h: tela.height }, { x: mold.x, y: mold.bottom - mold.height * FAIXA, w: mold.width, h: mold.height * FAIXA });
      const f = document.createElement("canvas");
      f.width = Math.round(Math.min(720, r.w));
      f.height = Math.round((f.width * r.h) / r.w);
      f.getContext("2d")!.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, f.width, f.height);
      setFantasma(f.toDataURL("image/jpeg", 0.75));
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(30);
    onFotoRef.current(c.toDataURL("image/jpeg", 0.85));
  }, []);

  // mede o quadro 5x por segundo so para ORIENTAR (luz, perto, firme, foco); quem tira e o botao
  useEffect(() => {
    if (fim) return;
    const c = document.createElement("canvas");
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || v.paused) return;
      const h = Math.round((ANALISE_W * v.videoHeight) / v.videoWidth);
      c.width = ANALISE_W;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, ANALISE_W, h);
      const px = ctx.getImageData(0, 0, ANALISE_W, h).data;
      const cinza = new Uint8ClampedArray(ANALISE_W * h);
      for (let i = 0; i < cinza.length; i++) cinza[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
      const bruto = medir(cinza, ANALISE_W, h, anteriorRef.current ?? undefined);
      anteriorRef.current = cinza;
      // movimento pela media dos ultimos 3 quadros: um tranco isolado nao zera a contagem
      movsRef.current = [...movsRef.current.slice(-2), bruto.movimento];
      const m = { ...bruto, movimento: movsRef.current.reduce((a, b) => a + b, 0) / movsRef.current.length };
      if (m.papel >= 0.35 && m.movimento < 30) melhorRef.current = Math.max(melhorRef.current, m.nitidez);
      const vd = veredito(m, melhorRef.current);
      setDica(vd);
    }, 200);
    return () => clearInterval(t);
  }, [fim]);

  const n = partes.length + 1;
  const orientacao = fim
    ? "✓ Chegou ao TOTAL. Toque em Pronto."
    : n === 1
      ? "Parte 1: o TOPO do cupom, bem de perto (letras grandes). Toque no botão."
      : `Parte ${n}: desça e encaixe as linhas de cima. Toque no botão.`;
  const corDica = dica === "bom" ? "bg-pos text-white" : "bg-white/15 text-white";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      {flash && <div className="absolute inset-0 z-20 bg-white/70" />}

      {/* topo: fechar e o que fazer agora */}
      <div className="relative z-10 flex items-start gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <button onClick={onFechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/50 text-[18px] backdrop-blur">
          ✕
        </button>
        <div className="min-w-0 flex-1 rounded-[16px] bg-black/55 px-3.5 py-2.5 text-[15px] font-extrabold leading-snug backdrop-blur">
          {orientacao}
        </div>
      </div>

      {/* moldura do cupom, com o fantasma da parte anterior no topo */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-3">
        <div ref={molduraRef} className="relative aspect-[3/4] w-full max-w-[360px] rounded-[18px] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline outline-[3px] outline-white/90">
          {!fim && fantasma && partes.length > 0 && (
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[20%] rounded-t-[18px] opacity-50"
              style={{ backgroundImage: `url(${fantasma})`, backgroundSize: "100% 100%" }}
            />
          )}
          {!fim && fantasma && partes.length > 0 && (
            <span className="absolute left-1/2 top-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-bold">
              encaixe estas linhas
            </span>
          )}
          {!fim && dica && (
            <div className={`absolute inset-x-0 top-full mt-2 rounded-full px-3 py-1.5 text-center text-[13px] font-extrabold ${corDica}`}>
              {dica === "bom" ? "✓ Luz e foco ok: toque no botão" : DICA[dica]}
            </div>
          )}
        </div>
      </div>

      {/* partes tiradas + botoes */}
      <div className="relative z-10 rounded-t-[28px] bg-black/75 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {partes.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {partes.map((p, i) => (
              <div key={i} className="w-[64px] shrink-0 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.foto} alt={`Parte ${i + 1}`} className="h-16 w-full rounded-[10px] object-cover" />
                <div className="mt-0.5 text-[10px] font-bold leading-tight">
                  {p.estado === "lendo" ? <span className="text-white/60">lendo…</span> : p.estado === "erro" ? <span className="text-[#FF8A80]">falhou</span> : <span className="text-[#7CE3A8]">✓ {p.itens}{p.temTotal ? " · TOTAL" : ""}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="w-[88px] text-[12px] font-bold text-white/60">{partes.length ? `${partes.length} ${partes.length === 1 ? "parte" : "partes"}` : "Toque para tirar"}</span>
          <button
            onClick={tirar}
            aria-label="Tirar foto"
            className="grid h-[72px] w-[72px] place-items-center rounded-full border-[4px] border-white"
          >
            <span className="h-[56px] w-[56px] rounded-full bg-white" />
          </button>
          <button
            onClick={onPronto}
            disabled={!partes.length}
            className={`h-12 w-[88px] rounded-full text-[15px] font-extrabold disabled:opacity-30 ${fim ? "bg-[#FF7A1A] text-black" : "bg-white/15"}`}
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
