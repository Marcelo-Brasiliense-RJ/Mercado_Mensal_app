"use client";

import { useEffect, useRef, useState } from "react";
import { isValidBarcode, onlyDigits } from "@/lib/barcode";

// Leitura de codigo de barras pela camera. Mesmo desenho do QrScanner da nota:
// BarcodeDetector nativo quando existe (Chrome/Android, que e o celular no mercado),
// e ZXing carregado sob demanda no resto (iOS Safari). O import dinamico mantem a
// biblioteca fora do bundle de quem nunca abre o leitor.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

// 1D de produto. QR fica de fora de proposito: quem le nota fiscal e o outro fluxo.
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"];

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
    let stream: MediaStream | null = null;
    let raf = 0;
    let parar: (() => void) | null = null;
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

        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new BD({ formats: FORMATOS });

          const tick = async () => {
            if (doneRef.current || !videoRef.current) return;
            const v = videoRef.current;
            if (v.readyState === v.HAVE_ENOUGH_DATA) {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) aceitar(codes[0].rawValue);
            }
            if (!doneRef.current) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          return;
        }

        // Fallback (iOS Safari, Firefox): ZXing cuida da propria camera.
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
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (res) => {
            if (!doneRef.current && res) aceitar(res.getText());
          },
        );
        parar = () => controls.stop();
      } catch {
        cbRef.current.onError("camera_indisponivel");
      }
    }
    start();

    return () => {
      doneRef.current = true;
      cancelAnimationFrame(raf);
      parar?.();
      stream?.getTracks().forEach((t) => t.stop());
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
