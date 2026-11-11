"use client";

import { useEffect, useRef } from "react";
import { chaveDoQr } from "@/lib/nfce";
import { obterDetector } from "@/lib/detector";
import { abrirCamera, soltarCamera } from "@/lib/camera";

// Leitura de QR pela camera: leitor do sistema (Android) ou zxing-cpp em WebAssembly
// (iPhone, lib/detector), com jsQR de reserva. Le o QR de NFC-e de QUALQUER estado
// (tem a chave de 44 digitos) e chama onResult com o texto do QR.

export function QrScanner({
  onResult,
  onError,
  cheia = false,
}: {
  onResult: (qrUrl: string) => void;
  onError: (msg: string) => void;
  cheia?: boolean; // ocupa a tela toda (tela da nota fiscal)
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let vivo = true;
    doneRef.current = false; // o efeito pode rodar de novo (montagem dupla): reabre a leitura
    const el = videoRef.current;
    let detector: Awaited<ReturnType<typeof obterDetector>>["detector"] | null = null;

    async function start() {
      try {
        // Mesma camera do leitor de codigo de barras (lib/camera): sem pedir permissao de novo.
        const stream = await abrirCamera();
        if (!vivo) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        try {
          detector = (await obterDetector(["qr_code"])).detector;
        } catch {
          detector = null;
        }
        const canvas = document.createElement("canvas");
        const jsQR = detector ? null : (await import("jsqr")).default;

        const tick = async () => {
          if (doneRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            let value = "";
            if (detector) {
              try {
                const codes = await detector.detect(v);
                value = codes[0]?.rawValue ?? "";
              } catch {
                // quadro ruim: tenta o proximo
              }
            } else if (jsQR) {
              // A camera vem em alta (por causa do codigo de barras); para o QR,
              // 1280 de largura basta e o jsQR fica bem mais rapido.
              const k = Math.min(1, 1280 / v.videoWidth);
              canvas.width = Math.round(v.videoWidth * k);
              canvas.height = Math.round(v.videoHeight * k);
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(img.data, img.width, img.height)?.data ?? "";
            }
            if (value && chaveDoQr(value)) {
              doneRef.current = true;
              onResult(value);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        onError("camera_indisponivel");
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
  }, [onResult, onError]);

  return (
    <div className={cheia ? "absolute inset-0 bg-black" : "relative mx-auto h-[280px] w-full overflow-hidden rounded-[14px] border border-border bg-black"}>
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[22px] border-[3px] border-white/85 ${
          cheia ? "top-[22%] h-[min(68vw,300px)] w-[min(68vw,300px)]" : "top-8 bottom-8 w-[70%]"
        }`}
      />
    </div>
  );
}
