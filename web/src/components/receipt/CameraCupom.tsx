"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abrirCamera, soltarCamera } from "@/lib/camera";
import { DICA, MUDOU_DE_PARTE, medir, mudanca, veredito, type Veredito } from "@/lib/quadroCupom";

// Camera do PROPRIO app para fotografar a nota (pedido do dono: "a aplicacao vai
// identificando se o enquadramento ta bom e vai separando as partes"). A camera do
// iPhone nao sabe nada do cupom; aqui o app:
// - mostra uma moldura e diz ao vivo se da para ler (luz, perto, firme, foco);
// - tira a foto SOZINHO quando fica bom por ~1 s (o botao manual continua la);
// - depois da Parte 1, mostra o fim dela "fantasma" no topo da moldura, para a proxima
//   repetir umas linhas (como foto panoramica);
// - para quando uma parte lida traz o TOTAL ("chegou ao fim do cupom").

export type ParteCamera = { foto: string; estado: "lendo" | "ok" | "erro"; itens: number; temTotal: boolean };

const ANALISE_W = 120; // quadro reduzido para medir (rapido no celular)
const FOTO_MAX = 1600;

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
  const [dica, setDica] = useState<Veredito | null>(null);
  const [bons, setBons] = useState(0);
  const [flash, setFlash] = useState(false);
  const melhorRef = useRef(0);
  const anteriorRef = useRef<Uint8ClampedArray | null>(null);
  const ultimaFotoRef = useRef(0);
  const bonsRef = useRef(0);
  const okRef = useRef(0); // quadros com luz e cupom na moldura (mesmo tremendo um pouco)
  const movsRef = useRef<number[]>([]);
  // Depois de cada foto, a automatica so volta quando o quadro muda de verdade (o celular
  // desceu para a proxima parte). Parado no mesmo lugar, nao tira de novo.
  const fotoCinzaRef = useRef<Uint8ClampedArray | null>(null);
  const liberadoRef = useRef(true);
  const [descer, setDescer] = useState(false);

  // As funcoes do pai chegam novas a cada render (o relogio "lendo... N s" redesenha a
  // tela 1x por segundo). Ficam em ref: se fossem dependencia dos efeitos, a camera
  // desligava e religava a cada segundo enquanto lia a foto anterior (tela piscando,
  // contagem do quadro bom zerada = a Parte 2 nunca saia sozinha, e foto preta no botao).
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
    ultimaFotoRef.current = Date.now();
    fotoCinzaRef.current = anteriorRef.current;
    liberadoRef.current = false;
    setDescer(true);
    bonsRef.current = 0;
    setBons(0);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(30);
    onFotoRef.current(c.toDataURL("image/jpeg", 0.85));
  }, []);

  // mede o quadro 4x por segundo; 4 quadros bons seguidos = foto automatica
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
      if (!liberadoRef.current && mudanca(cinza, fotoCinzaRef.current) > MUDOU_DE_PARTE) {
        liberadoRef.current = true;
        setDescer(false);
      }
      anteriorRef.current = cinza;
      // movimento pela media dos ultimos 3 quadros: um tranco isolado nao zera a contagem
      movsRef.current = [...movsRef.current.slice(-2), bruto.movimento];
      const m = { ...bruto, movimento: movsRef.current.reduce((a, b) => a + b, 0) / movsRef.current.length };
      if (m.papel >= 0.35 && m.movimento < 30) melhorRef.current = Math.max(melhorRef.current, m.nitidez);
      const vd = veredito(m, melhorRef.current);
      setDica(vd);
      bonsRef.current = vd === "bom" ? bonsRef.current + 1 : 0;
      okRef.current = vd === "bom" || vd === "firme" || vd === "foco" ? okRef.current + 1 : 0;
      setBons(bonsRef.current);
      const desde = Date.now() - ultimaFotoRef.current;
      // ~0,6 s de quadro bom, ou ~2 s com luz e cupom na moldura (plano B: nao travar)
      if (liberadoRef.current && desde > 2500 && (bonsRef.current >= 3 || okRef.current >= 10)) {
        okRef.current = 0;
        tirar();
      }
    }, 200);
    return () => clearInterval(t);
  }, [fim, tirar]);

  const n = partes.length + 1;
  const ultima = partes[partes.length - 1];
  const orientacao = fim
    ? "✓ Chegou ao TOTAL. Toque em Pronto."
    : n === 1
      ? "Parte 1: enquadre o TOPO do cupom (nome do mercado)"
      : `Parte ${n}: desça o celular e encaixe as linhas de cima`;
  const corDica = dica === "bom" && !descer ? "bg-pos text-white" : "bg-white/15 text-white";

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
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-3">
        <div className="relative aspect-[3/4] w-full max-w-[360px] rounded-[18px] border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
          {!fim && ultima && (
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[18%] rounded-t-[15px] opacity-45"
              style={{ backgroundImage: `url(${ultima.foto})`, backgroundSize: "100% auto", backgroundPosition: "bottom", backgroundRepeat: "no-repeat" }}
            />
          )}
          {!fim && ultima && (
            <span className="absolute left-1/2 top-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-bold">
              encaixe estas linhas
            </span>
          )}
          {!fim && dica && (
            <div className={`absolute inset-x-3 bottom-3 rounded-full px-3 py-2 text-center text-[14px] font-extrabold ${corDica}`}>
              {descer ? `✓ Parte ${partes.length} tirada. Desça o celular` : DICA[dica]}
              {dica === "bom" && !descer && (
                <span className="ml-1.5 inline-block h-2 w-10 overflow-hidden rounded-full bg-white/30 align-middle">
                  <span className="block h-full bg-white transition-[width]" style={{ width: `${Math.min(100, (bons / 3) * 100)}%` }} />
                </span>
              )}
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
          <span className="w-[88px] text-[12px] font-bold text-white/60">{partes.length ? `${partes.length} ${partes.length === 1 ? "parte" : "partes"}` : "Auto: tiro sozinho"}</span>
          <button
            onClick={tirar}
            disabled={fim}
            aria-label="Tirar foto"
            className="grid h-[72px] w-[72px] place-items-center rounded-full border-[4px] border-white disabled:opacity-30"
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
