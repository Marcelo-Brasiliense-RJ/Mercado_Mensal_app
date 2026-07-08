import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Landing dos links de e-mail: confirmacao de cadastro e recuperacao de senha.
// Aceita o fluxo token_hash (templates com {{ .TokenHash }}) e, como fallback,
// o fluxo PKCE (?code=). Em sucesso, cria a sessao e segue para `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/entrar?erro=link_invalido");
}

// So permite caminho interno relativo. Exige "/" seguido de char que nao seja
// "/" nem "\": barra dupla e "/\" sao normalizados por navegadores para
// protocolo-relativo (//host), o que abriria open redirect.
function safeNext(next: string | null): string {
  if (next && /^\/[^/\\]/.test(next)) return next;
  return "/app/estoque";
}
