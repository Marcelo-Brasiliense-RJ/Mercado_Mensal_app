import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conferir, detectar } from "@/lib/server/prateleira";

// Foto da prateleira: {foto} -> quadrados com o que a IA leu; {grade, n} -> o nome de
// cada recorte numerado (a conferencia que segura o quadrado no produto certo).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  let b: { foto?: unknown; grade?: unknown; n?: unknown; nomes?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    /* cai no sem_imagem */
  }
  const img = typeof b.foto === "string" ? b.foto : typeof b.grade === "string" ? b.grade : "";
  if (!img.startsWith("data:image/")) return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });
  if (img.length > 4_000_000) return NextResponse.json({ ok: false, erro: "imagem_grande" }, { status: 413 });

  const r = typeof b.foto === "string" ? await detectar(img, b.nomes) : await conferir(img, Math.min(60, Number(b.n) || 0), b.nomes);
  if (r.ok) return NextResponse.json(r);
  if (r.erro === "limite") return NextResponse.json({ ok: false, erro: "limite", espera: r.espera }, { status: 429 });
  return NextResponse.json({ ok: false, erro: r.erro }, { status: r.erro === "ia_indisponivel" ? 503 : 502 });
}
