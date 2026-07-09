// Edge Function nfce-consulta: recebe a URL do QR (decodificada no navegador),
// busca a pagina da SEFAZ-RJ, parseia os itens, normaliza (Groq) e valida o total.
// Fase 1: so o modo { qr_url }. O modo { image_base64 } (decode no servidor, p/
// Telegram) fica para a Fase 2.

import { parseNfceHtml } from "./parse.ts";
import { normalizeItems } from "./normalize.ts";

const RJ_HOST = "consultadfe.fazenda.rj.gov.br";

function chaveFromQr(qrUrl: string): string {
  try {
    const p = new URL(qrUrl).searchParams.get("p") ?? "";
    return (p.split("|")[0] ?? "").replace(/\D/g, "");
  } catch {
    return "";
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

  let body: { qr_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, erro: "qr_invalido" }, 400);
  }

  const qrUrl = (body.qr_url ?? "").trim();
  if (!qrUrl || !qrUrl.includes(RJ_HOST)) return json({ ok: false, erro: "qr_invalido" }, 400);

  // 1. Buscar a pagina da SEFAZ-RJ
  let html: string;
  try {
    const r = await fetch(qrUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Android) AppleWebKit/537.36 Chrome" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return json({ ok: false, erro: "sefaz_indisponivel" }, 502);
    html = await r.text();
  } catch {
    return json({ ok: false, erro: "sefaz_indisponivel" }, 502);
  }

  if (/captcha/i.test(html) && !/tabResult/.test(html)) {
    return json({ ok: false, erro: "captcha_detectado" }, 502);
  }

  // 2. Parse
  let parsed;
  try {
    parsed = parseNfceHtml(html);
  } catch {
    return json({ ok: false, erro: "parse_falhou" }, 502);
  }
  if (parsed.itens.length === 0) return json({ ok: false, erro: "parse_falhou" }, 502);

  // 3. Normalizar (nome/marca). Se o Groq falhar, cai para o desc_fiscal cru.
  const apiKey = Deno.env.get("GROQ_API_KEY") ?? "";
  let itens;
  try {
    itens = await normalizeItems(parsed.itens, apiKey);
  } catch {
    itens = parsed.itens.map((it) => ({
      nome: it.desc_fiscal.toLowerCase(),
      marca: "",
      qtd: it.qtd,
      preco: it.preco,
      unidade: it.unidade,
      desc_fiscal: it.desc_fiscal,
    }));
  }

  // 4. Validar total (soma dos itens x total da nota)
  const total_itens = round2(itens.reduce((a, i) => a + i.qtd * i.preco, 0));
  const total_nota = round2(parsed.total_nota);
  const tol = Math.max(1, total_nota * 0.02);
  const total_confere = total_nota === 0 ? true : Math.abs(total_itens - total_nota) <= tol;

  const chave = parsed.chave || chaveFromQr(qrUrl);
  return json({
    ok: true,
    chave,
    emitente: parsed.emitente,
    data: null,
    total_nota,
    total_itens,
    total_confere,
    itens,
  });
});
