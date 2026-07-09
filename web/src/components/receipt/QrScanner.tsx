"use client";

import { useEffect, useRef } from "react";
import { isRjQrUrl } from "@/lib/nfce";

// Leitura de QR pela camera. BarcodeDetector existe em Chrome/Android; iOS Safari
// cai no fallback jsQR. Ao ler um QR de NFC-e do RJ, chama onResult com a URL.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (qrUrl: string) => void;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector: Detector | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const BD = (globalThis as unknown as {
          BarcodeDetector?: new (o: object) => Detector;
        }).BarcodeDetector;
        if (BD) detector = new BD({ formats: ["qr_code"] });

        const canvas = document.createElement("canvas");
        const jsQR = BD ? null : (await import("jsqr")).default;

        const tick = async () => {
          if (doneRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            let value = "";
            if (detector) {
              const codes = await detector.detect(v);
              value = codes[0]?.rawValue ?? "";
            } else if (jsQR) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(img.data, img.width, img.height)?.data ?? "";
            }
            if (value && isRjQrUrl(value)) {
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
      doneRef.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult, onError]);

  return (
    <div className="relative mx-auto h-[280px] w-full overflow-hidden rounded-[14px] border border-border bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-8 rounded-[12px] border-2 border-white/70" />
    </div>
  );
}
