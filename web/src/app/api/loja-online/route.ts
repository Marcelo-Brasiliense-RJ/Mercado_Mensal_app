// Plano B da vitrine Livelo: quando o celular nao consegue falar direto com a loja, o app
// pede aqui. Busca no catalogo publico VTEX (src/lib/lojasOnline.ts) e devolve o JSON cru;
// quem normaliza e o app (produtosVtex). Guardado 6 horas pela borda.
// Carrefour bloqueia servidor (Cloudflare): para ele isto quase sempre falha.
import { lojaDe, urlBusca } from "@/lib/lojasOnline";

export const runtime = "nodejs";

const SEIS_HORAS = 60 * 60 * 6;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const loja = lojaDe(u.get("loja") ?? "");
  if (!loja) return Response.json([], { status: 400 });
  const q = (u.get("q") ?? "").trim().slice(0, 60) || undefined;
  const fq = (u.get("fq") ?? "").match(/^C:\/\d+\/$/)?.[0];
  const ate = Math.min(49, Math.max(0, Number(u.get("ate")) || 23));
  try {
    const r = await fetch(urlBusca(loja, { q, fq, ate }), {
      headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: SEIS_HORAS },
    });
    if (!r.ok && r.status !== 206) throw new Error(String(r.status));
    return Response.json(await r.json(), {
      headers: { "cache-control": `public, max-age=3600, s-maxage=${SEIS_HORAS}` },
    });
  } catch (e) {
    console.error("loja-online: falhou", loja.codigo, q ?? fq ?? "promo", String(e));
    return Response.json([], { status: 502, headers: { "cache-control": "public, max-age=600" } });
  }
}
