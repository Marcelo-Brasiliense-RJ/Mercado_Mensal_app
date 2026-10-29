import { createClient } from "@/lib/supabase/server";

// Miniatura de uma oferta (webp, ~3 KB). A lista de ofertas nao traz a foto para
// abrir rapido; cada card pede a sua aqui, e o navegador guarda por uma semana.
// Exige sessao: a RPC devolve null sem usuario logado (migration 0038).
// ?desejo=ID: a foto guardada de um produto "De olho" (0039), so da propria casa.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const desejo = q.has("desejo");
  const evitar = q.has("evitar"); // miniatura de um produto do "Não compro" (0045)
  const id = Number(desejo ? q.get("desejo") : evitar ? q.get("evitar") : q.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const { data } = desejo
    ? await supabase.rpc("mercado_desejo_foto_web", { p_id: id })
    : evitar
      ? await supabase.rpc("mercado_evitar_foto_web", { p_id: id })
      : await supabase.rpc("mercado_oferta_foto_web", { p_id: id });
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
