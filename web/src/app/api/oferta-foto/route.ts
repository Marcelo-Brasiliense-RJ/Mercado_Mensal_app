import { createClient } from "@/lib/supabase/server";

// Miniatura de uma oferta (webp, ~3 KB). A lista de ofertas nao traz a foto para
// abrir rapido; cada card pede a sua aqui, e o navegador guarda por uma semana.
// Exige sessao: a RPC devolve null sem usuario logado (migration 0038).
export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase.rpc("mercado_oferta_foto_web", { p_id: id });
  const m = typeof data === "string" ? data.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
  if (!m) return new Response(null, { status: 404 });

  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "content-type": m[1],
      // private: a resposta depende da sessao; a foto da mesma oferta nao muda.
      "cache-control": "private, max-age=604800, immutable",
    },
  });
}
