// Carrefour Mercado para a vitrine Livelo: le os cartoes de produto das paginas de
// categoria e de busca do site (a API de catalogo e bloqueada para servidor, as paginas
// nao). Guardado 3 horas pela borda: serve a todas as casas.
import { lerCartoes, paginaCarrefour } from "@/lib/carrefourHtml";

export const runtime = "nodejs";

const TRES_HORAS = 60 * 60 * 3;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const categoria = u.get("categoria")?.match(/^[a-z0-9-]{2,60}$/)?.[0];
  const q = (u.get("q") ?? "").trim().slice(0, 60) || undefined;
  const pagina = Math.min(5, Math.max(1, Number(u.get("pagina")) || 1));
  if (!categoria && !q) return Response.json({ ok: false, itens: [] }, { status: 400 });
  try {
    const r = await fetch(paginaCarrefour({ categoria, q, pagina }), {
      headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: TRES_HORAS },
    });
    if (!r.ok) throw new Error(String(r.status));
    const itens = lerCartoes(await r.text());
    return Response.json(
      { ok: true, itens },
      { headers: { "cache-control": `public, max-age=1800, s-maxage=${TRES_HORAS}` } },
    );
  } catch (e) {
    console.error("carrefour: pagina falhou", categoria ?? q, String(e));
    return Response.json({ ok: false, itens: [] }, { status: 502, headers: { "cache-control": "public, max-age=300" } });
  }
}
