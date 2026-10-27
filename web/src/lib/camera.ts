"use client";

// Uma camera para o app inteiro, reaproveitada entre leituras.
//
// Por que existe: o iPhone pergunta "permitir camera?" a cada getUserMedia. Fechar a
// camera ao fim de cada leitura (o certo pela privacidade) fazia a pergunta voltar a
// cada produto no mercado. Aqui o leitor "solta" a camera em vez de desligar: ela fica
// pausada (track.enabled = false) por alguns minutos e a proxima leitura pega a mesma,
// sem perguntar. Desliga de verdade depois do prazo ou quando o app sai da tela.
// ponytail: o iOS ainda pergunta de novo quando o app e reaberto; isso e do sistema.
const PAUSA_MS = 5 * 60 * 1000;

// Resolucao alta e foco continuo, para todo leitor (a camera e uma so).
//
// Por que existe: com o default do navegador (tipicamente 640x480, foco fixo) as
// barras finas de um EAN ocupam menos de um pixel cada e o decodificador nunca
// fecha a leitura. Em uso real no iPhone isso apareceu como "a camera abre, eu
// encosto no codigo e nao acontece nada".
//
// focusMode nao esta na lib de tipos do TS e nem todo navegador aceita; vai em
// `advanced`, que por definicao e ignorado por quem nao suporta.
const VIDEO = {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [{ focusMode: "continuous" }],
} as unknown as MediaTrackConstraints;

let atual: MediaStream | null = null;
let pedindo: Promise<MediaStream> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let ouvindo = false;

const viva = (s: MediaStream | null) => !!s?.getVideoTracks().some((t) => t.readyState === "live");

export function desligarCamera() {
  clearTimeout(timer);
  atual?.getTracks().forEach((t) => t.stop());
  atual = null;
}

export async function abrirCamera(): Promise<MediaStream> {
  clearTimeout(timer);
  if (!ouvindo && typeof document !== "undefined") {
    ouvindo = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") desligarCamera();
    });
  }
  if (viva(atual)) {
    atual!.getVideoTracks().forEach((t) => (t.enabled = true));
    return atual!;
  }
  pedindo ??= navigator.mediaDevices
    .getUserMedia({ video: VIDEO })
    .then((s) => (atual = s))
    .finally(() => (pedindo = null));
  return pedindo;
}

// Fim de uma leitura: pausa e agenda o desligamento.
export function soltarCamera() {
  atual?.getVideoTracks().forEach((t) => (t.enabled = false));
  clearTimeout(timer);
  timer = setTimeout(desligarCamera, PAUSA_MS);
}
