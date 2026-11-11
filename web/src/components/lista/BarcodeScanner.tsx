"use client";

import { useEffect, useRef, useState } from "react";
import { isValidBarcode, onlyDigits } from "@/lib/barcode";
import { abrirCamera, soltarCamera } from "@/lib/camera";
import { criarLeitor, PASSOS } from "@/lib/leituraCodigo";
import { obterDetector } from "@/lib/detector";

// Leitura de codigo de barras pela camera. Mesmo desenho do QrScanner da nota:
// BarcodeDetector nativo quando existe (Chrome/Android, que e o celular no mercado),
// e ZXing carregado sob demanda no resto (iOS Safari). O import dinamico mantem a
// biblioteca fora do bundle de quem nunca abre o leitor.

// 1D de produto. QR fica de fora de proposito: quem le nota fiscal e o outro fluxo.
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"];

// Alguns aparelhos ignoram focusMode na negociacao inicial mas aceitam depois que
// a track esta viva. Falhar aqui nao e erro: a leitura segue com o foco que veio.
async function pedirFocoContinuo(s: MediaStream | null) {
  const track = s?.getVideoTracks()[0];
  if (!track?.getCapabilities) return;
  try {
    const caps = track.getCapabilities() as Record<string, unknown>;
    if ("focusMode" in caps) {
      await track.applyConstraints({
        advanced: [{ focusMode: "continuous" }],
      } as unknown as MediaTrackConstraints);
    }
  } catch {
    // sem foco continuo, segue com o padrao do aparelho
  }
}

export function BarcodeScanner({
  onResult,
  onError,
  onFoto,
  procurando = false,
}: {
  onResult: (code: string) => void;
  onError: (msg: string) => void;
  // Botao de foto na propria camera: tira o quadro atual (sem abrir a camera do
  // sistema) e a tela reconhece o produto pela embalagem ou pela etiqueta.
  onFoto?: (dataUrl: string) => void;
  procurando?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  // Callbacks em ref, e o efeito sem dependencia deles: a tela que abre o leitor
  // re-renderiza sozinha (o carrinho recarrega a cada 4s), e com os callbacks nas
  // dependencias a camera reiniciava a cada re-render, no meio da leitura.
  const cbRef = useRef({ onResult, onError });
  useEffect(() => {
    cbRef.current = { onResult, onError };
  });
  // Aceita na PRIMEIRA leitura valida. A regra antes era exigir duas iguais
  // seguidas, e no mercado de verdade isso virou "nao le nunca": no iPhone o
  // decodificador entrega um quadro bom de vez em quando, e casar dois seguidos
  // pedia uma mao parada que ninguem tem com o carrinho na frente. O digito
  // verificador GS1 ja rejeita leitura quebrada, que era o medo original.
  const [lendo, setLendo] = useState(true);
  // Ultimo codigo que chegou e foi RECUSADO, so para dar retorno na tela em vez
  // de ficar mudo enquanto a pessoa insiste no mesmo produto.
  const [recusado, setRecusado] = useState("");
  // Lanterna (quando o aparelho deixa) e aviso de escuro: no escuro extremo nao ha
  // realce que recupere o codigo, so luz.
  const trilha = useRef<MediaStreamTrack | null>(null);
  const [temLanterna, setTemLanterna] = useState(false);
  const [lanterna, setLanterna] = useState(false);
  const [escuro, setEscuro] = useState(false);
  // Zoom 1x/2x (como os apps de mercado): optico quando a camera deixa, senao digital
  // (a leitura usa so o meio do quadro e a imagem amplia na tela).
  const [zoom, setZoom] = useState<1 | 2>(1);

  function tirarFoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !onFoto) return;
    // 1024 px: sobe rapido no 4G e e o que a IA de um produto precisa.
    const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    navigator.vibrate?.(30);
    onFoto(c.toDataURL("image/jpeg", 0.8));
  }
  const zoomRef = useRef<1 | 2>(1);
  const [zoomOptico, setZoomOptico] = useState(false);
  const opticoRef = useRef(false);

  async function trocarZoom() {
    const novo = zoom === 1 ? 2 : 1;
    setZoom(novo);
    zoomRef.current = novo;
    const t = trilha.current;
    const caps = (t?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
    if (t && caps.zoom) {
      try {
        const z = novo === 2 ? Math.min(2, caps.zoom.max) : Math.max(1, caps.zoom.min);
        await t.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
        setZoomOptico(true);
        opticoRef.current = true;
        return;
      } catch {
        /* sem zoom optico: fica o digital */
      }
    }
    setZoomOptico(false);
    opticoRef.current = false;
  }

  async function alternarLanterna() {
    const t = trilha.current;
    if (!t) return;
    const nova = !lanterna;
    try {
      await t.applyConstraints({ advanced: [{ torch: nova } as MediaTrackConstraintSet] });
      setLanterna(nova);
    } catch {
      setTemLanterna(false);
    }
  }

  useEffect(() => {
    let raf = 0;
    let vivo = true;
    const el = videoRef.current;
    doneRef.current = false;

    function aceitar(bruto: string) {
      const code = onlyDigits(bruto);
      if (!isValidBarcode(code)) {
        if (code.length >= 6) setRecusado(code);
        return;
      }
      doneRef.current = true;
      setLendo(false);
      navigator.vibrate?.(60);
      cbRef.current.onResult(code);
    }

    async function start() {
      try {

        // A camera vem de lib/camera: a mesma das leituras anteriores, sem o
        // iPhone perguntar a permissao de novo a cada produto.
        const stream = await abrirCamera();
        if (!vivo) return;
        await pedirFocoContinuo(stream);
        const t = stream.getVideoTracks()[0] ?? null;
        trilha.current = t;
        const caps = (t?.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (vivo) setTemLanterna(!!caps.torch);
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        // Leitor do sistema (Android) ou o zxing-cpp em WebAssembly (iPhone), com a
        // mesma interface (lib/detector). Quadro sim, quadro nao (sem leitura), uma tentativa
        // com realce contra reflexo pelo ZXing JS (carregado so quando precisa).
        const { detector } = await obterDetector(FORMATOS);
        if (!vivo) return;
        let volta = 0;
        let vazios = 0;
        let reforco: Awaited<ReturnType<typeof criarLeitor>> | null = null;
        const realces = PASSOS.filter((p) => p.realce);
        const intervalo = 0;
        const ler = async (v: HTMLVideoElement): Promise<string> => {
          // zoom digital: so o meio do quadro (o optico ja vem aproximado da camera)
          const z = opticoRef.current ? 1 : zoomRef.current;
          let fonte: ImageBitmapSource = v;
          if (z > 1) {
            const w = v.videoWidth / z;
            const h = v.videoHeight / z;
            recorte.width = w;
            recorte.height = h;
            recorte.getContext("2d")!.drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
            fonte = recorte;
          }
          const achado = (await detector.detect(fonte))[0]?.rawValue ?? "";
          if (achado) return achado;
          if (++vazios % 2) return "";
          reforco ??= await criarLeitor();
          return reforco(v, v.videoWidth, v.videoHeight, realces[volta++ % realces.length]);
        };
        const recorte = document.createElement("canvas");

        // Brilho medio numa miniatura do quadro, a cada segundo: escuro pede lanterna.
        const amostra = document.createElement("canvas");
        amostra.width = 32;
        amostra.height = 18;
        let ultimaLuz = 0;
        let ultimo = 0;
        const tick = async (agora: number) => {
          if (doneRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA && agora - ultimaLuz > 1000) {
            ultimaLuz = agora;
            const c = amostra.getContext("2d", { willReadFrequently: true })!;
            c.drawImage(v, 0, 0, 32, 18);
            const px = c.getImageData(0, 0, 32, 18).data;
            let soma = 0;
            for (let i = 0; i < px.length; i += 4) soma += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
            setEscuro(soma / (px.length / 4) < 50);
          }
          if (v.readyState === v.HAVE_ENOUGH_DATA && agora - ultimo >= intervalo) {
            ultimo = agora;
            const valor = await ler(v);
            if (valor && !doneRef.current) aceitar(valor);
          }
          if (!doneRef.current) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        cbRef.current.onError("camera_indisponivel");
      }
    }
    start();

    return () => {
      vivo = false;
      doneRef.current = true;
      cancelAnimationFrame(raf);
      if (el) el.srcObject = null;
      // lanterna nao fica acesa depois de fechar o leitor
      trilha.current?.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
      soltarCamera();
    };
  }, []);

  return (
    <div className="relative mx-auto h-[260px] w-full overflow-hidden rounded-[18px] border border-border bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-full w-full object-cover transition-transform duration-200"
        style={zoom === 2 && !zoomOptico ? { transform: "scale(2)" } : undefined}
      />
      {onFoto && (
        <button
          type="button"
          onClick={tirarFoto}
          disabled={procurando}
          aria-label="Tirar foto do produto"
          className="absolute bottom-8 right-3 grid h-14 w-14 place-items-center rounded-full border-4 border-white/90 bg-white/25 backdrop-blur active:scale-90 disabled:opacity-40"
        >
          <span className="h-9 w-9 rounded-full bg-white" />
        </button>
      )}
      {procurando && (
        <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
            <span className="text-[15px] font-extrabold">Procurando o produto…</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => void trocarZoom()}
        aria-label={zoom === 2 ? "Zoom normal" : "Aproximar 2x"}
        className="absolute bottom-9 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 p-1 text-[12px] font-extrabold text-white"
      >
        <span className={`grid h-7 w-8 place-items-center rounded-full ${zoom === 1 ? "bg-white text-black" : ""}`}>1×</span>
        <span className={`grid h-7 w-8 place-items-center rounded-full ${zoom === 2 ? "bg-white text-black" : ""}`}>2×</span>
      </button>
      {/* Mira quadrada: o codigo pode estar deitado, em pe ou inclinado. */}
      <div className="pointer-events-none absolute left-1/2 top-[45%] h-[120px] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.25)]" />
      {temLanterna && (
        <button
          type="button"
          onClick={alternarLanterna}
          aria-pressed={lanterna}
          aria-label={lanterna ? "Apagar lanterna" : "Acender lanterna"}
          className={`absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-[20px] ${
            lanterna ? "bg-white text-black" : "bg-black/50 text-white"
          }`}
        >
          🔦
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 px-3 text-center text-[12px] font-bold text-white/90">
        {!lendo
          ? "Código lido"
          : recusado
            ? `Quase: ${recusado}. Chegue mais perto.`
            : escuro && !lanterna
              ? temLanterna
                ? "Está escuro: toque na lanterna 🔦"
                : "Está escuro: chegue perto de uma luz"
              : onFoto
                ? "Mire no código · ou ⚪ foto da embalagem"
                : "Aponte para o código, em qualquer posição"}
      </div>
    </div>
  );
}
