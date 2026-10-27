"use client";

import { useEffect, useRef, useState } from "react";
import { isValidBarcode, onlyDigits } from "@/lib/barcode";
import { abrirCamera, soltarCamera } from "@/lib/camera";

// Leitura de codigo de barras pela camera. Mesmo desenho do QrScanner da nota:
// BarcodeDetector nativo quando existe (Chrome/Android, que e o celular no mercado),
// e ZXing carregado sob demanda no resto (iOS Safari). O import dinamico mantem a
// biblioteca fora do bundle de quem nunca abre o leitor.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

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
}: {
  onResult: (code: string) => void;
  onError: (msg: string) => void;
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
        const BD = (globalThis as unknown as {
          BarcodeDetector?: new (o: object) => Detector;
        }).BarcodeDetector;

        // A camera vem de lib/camera: a mesma das leituras anteriores, sem o
        // iPhone perguntar a permissao de novo a cada produto.
        const stream = await abrirCamera();
        if (!vivo) return;
        await pedirFocoContinuo(stream);
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        // Nativo (Chrome/Android) ou ZXing (iOS Safari, Firefox), no mesmo laco.
        // O ZXing nao abre camera aqui: le quadro a quadro do video que ja esta
        // tocando, para a camera continuar sendo uma so.
        let ler: (v: HTMLVideoElement) => Promise<string>;
        let intervalo = 0;
        if (BD) {
          const detector = new BD({ formats: FORMATOS });
          ler = async (v) => (await detector.detect(v))[0]?.rawValue ?? "";
        } else {
          const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
          const hints = new Map();
          hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
            zxing.BarcodeFormat.EAN_13,
            zxing.BarcodeFormat.EAN_8,
            zxing.BarcodeFormat.UPC_A,
            zxing.BarcodeFormat.UPC_E,
            zxing.BarcodeFormat.ITF,
            zxing.BarcodeFormat.CODE_128,
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          ler = async (v) => {
            try {
              return reader.decode(v).getText();
            } catch {
              return ""; // quadro sem codigo
            }
          };
          intervalo = 120; // decodificar em JS e pesado: nao precisa ser todo quadro
        }

        let ultimo = 0;
        const tick = async (agora: number) => {
          if (doneRef.current || !videoRef.current) return;
          const v = videoRef.current;
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
      soltarCamera();
    };
  }, []);

  return (
    <div className="relative mx-auto h-[220px] w-full overflow-hidden rounded-[14px] border border-border bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      {/* Mira deitada: codigo de barras e largo e baixo, e a faixa ensina onde mirar. */}
      <div className="pointer-events-none absolute inset-x-6 top-1/2 h-[86px] -translate-y-1/2 rounded-[10px] border-2 border-white/70" />
      <div className="pointer-events-none absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 bg-brand/80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 px-3 text-center text-[12px] font-bold text-white/90">
        {!lendo
          ? "Código lido"
          : recusado
            ? `Quase: ${recusado}. Chegue mais perto.`
            : "Encoste no código, bem de perto"}
      </div>
    </div>
  );
}
