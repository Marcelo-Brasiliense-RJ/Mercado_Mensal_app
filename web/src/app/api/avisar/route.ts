import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient as clienteSessao } from "@/lib/supabase/server";
import { createClient as clienteServidor } from "@supabase/supabase-js";
import { agrupar, textoAviso, type Aviso, type TipoAviso } from "@/lib/avisos";

// Avisos para a familia: quem mexe no app manda os eventos aqui, e cada OUTRO celular
// da mesma casa com avisos ligados (push_inscricoes, 0039) recebe uma notificacao.
// Precisa, na Vercel: VAPID_PRIVATE_KEY (o mesmo par da chave publica do app) e
// SUPABASE_SERVICE_ROLE_KEY (ler as inscricoes da casa, que o RLS esconde de todos).
// Sem elas a rota responde ok:false e o app segue normal.
export const runtime = "nodejs";

const TIPOS: TipoAviso[] = ["lista", "tirou", "acabou", "mercado", "compra"];
const PUBLICA =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BKpvmQt6Xm_XohnnVTjtGv87rb3BlCv0fP7Dha6zeIgMKoI5pwjVRTBLLZfebanJJmN1Ff2HNNZSCGsESErR8nI";

export async function POST(req: Request) {
  const sessao = await clienteSessao();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const privada = process.env.VAPID_PRIVATE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!privada || !url || !servico) return NextResponse.json({ ok: false, erro: "avisos_desligados" });

  let avisos: Aviso[] = [];
  try {
    const b = (await req.json()) as { avisos?: Aviso[] };
    avisos = (b.avisos ?? [])
      .filter((a) => TIPOS.includes(a.tipo))
      .slice(0, 20)
      .map((a) => ({
        tipo: a.tipo,
        nomes: (Array.isArray(a.nomes) ? a.nomes : []).map((n) => String(n).slice(0, 60)).slice(0, 50),
        total: typeof a.total === "number" ? a.total : undefined,
        itens: typeof a.itens === "number" ? a.itens : undefined,
      }));
  } catch {
    /* corpo invalido: nada a enviar */
  }
  if (!avisos.length) return NextResponse.json({ ok: true, enviados: 0 });

  const db = clienteServidor(url, servico, { auth: { persistSession: false } });
  const { data: eu } = await db.from("household_members").select("household_id, name").eq("auth_user_id", user.id).maybeSingle();
  if (!eu?.household_id) return NextResponse.json({ ok: false, erro: "sem_familia" });
  const quem =
    (eu.name as string | null)?.trim().split(/\s+/)[0] ||
    (user.user_metadata?.name as string | undefined)?.split(/\s+/)[0] ||
    (user.email ?? "Alguém").split("@")[0].replace(/[._-]+/g, " ").split(" ")[0].replace(/^./, (c) => c.toUpperCase());

  // Os outros aparelhos da casa (o proprio usuario nao recebe o que ele mesmo fez).
  const { data: subs } = await db
    .from("push_inscricoes")
    .select("endpoint, p256dh, auth, auth_user_id")
    .eq("household_id", eu.household_id)
    .neq("auth_user_id", user.id);

  webpush.setVapidDetails("mailto:avisos@despensa.app", PUBLICA, privada);
  let enviados = 0;
  const mortos: string[] = [];
  for (const a of agrupar(avisos)) {
    const t = textoAviso(quem, a);
    await Promise.all(
      (subs ?? []).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(t), { TTL: 6 * 3600 })
          .then(() => void enviados++)
          .catch((e: { statusCode?: number }) => {
            // Aparelho que desinstalou ou trocou: sai da lista para nao tentar de novo.
            if (e?.statusCode === 404 || e?.statusCode === 410) mortos.push(s.endpoint);
          }),
      ),
    );
  }
  if (mortos.length) await db.from("push_inscricoes").delete().in("endpoint", [...new Set(mortos)]);
  return NextResponse.json({ ok: true, enviados });
}
