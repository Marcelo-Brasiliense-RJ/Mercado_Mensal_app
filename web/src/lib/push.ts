"use client";

import { createClient } from "@/lib/supabase/client";

// Aviso no celular (Web Push) dos produtos "De olho". Quem envia e o monitor de
// promocoes (promocoes/coletor, comando avisar) com a chave privada do par abaixo,
// guardada no Secret VAPID_PRIVATE_KEY do GitHub. A publica nao e segredo.
const VAPID_PUBLICA =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BKpvmQt6Xm_XohnnVTjtGv87rb3BlCv0fP7Dha6zeIgMKoI5pwjVRTBLLZfebanJJmN1Ff2HNNZSCGsESErR8nI";

// sem-suporte: navegador sem push. instalar: iPhone fora da Tela de Inicio (o iOS so
// entrega aviso para app instalado). negado: a pessoa bloqueou nos Ajustes.
export type EstadoPush = "sem-suporte" | "instalar" | "negado" | "ligado" | "desligado";

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === "undefined") return "sem-suporte";
  if (ehIphone() && !instalado()) return "instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "sem-suporte";
  }
  if (Notification.permission === "denied") return "negado";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ligado" : "desligado";
}

function chaveBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Precisa ser chamado direto do toque no botao: o iOS so pede permissao com gesto.
export async function ligarPush(): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return { ok: false, erro: "Sem permissão: os avisos ficaram desligados." };
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) }));
    const j = sub.toJSON();
    const { data, error } = await createClient().rpc("mercado_push_inscrever_web", {
      p_endpoint: j.endpoint,
      p_p256dh: j.keys?.p256dh,
      p_auth: j.keys?.auth,
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      await sub.unsubscribe();
      return { ok: false, erro: "Não deu para ligar os avisos. Tente de novo." };
    }
    // Aviso de teste na hora: a pessoa ve que funciona sem esperar uma promocao.
    await reg.showNotification("🔔 Avisos ligados", {
      body: "Quando um produto De olho entrar em promoção, ele aparece aqui.",
      icon: "/icon-192.png",
      tag: "de-olho",
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: "Este celular não deixou ligar os avisos." };
  }
}

export async function desligarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await createClient().rpc("mercado_push_cancelar_web", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
