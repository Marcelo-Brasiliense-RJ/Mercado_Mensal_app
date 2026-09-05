import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Proxy (era "middleware" ate o Next 16). Faz duas coisas a cada request:
// 1. Renova a sessao do Supabase e propaga os cookies atualizados.
// 2. Guarda de rota: /app/* exige login; usuario logado nao fica em /entrar.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Nao coloque codigo entre createServerClient e getUser(): getUser revalida
  // o token no servidor Auth (nao confia so no cookie) e mantem a sessao em dia.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url);
  }

  // App de uma pessoa so: abrir o endereco principal nao pode custar uma tela de
  // apresentacao mais uma de login. Sem sessao vai direto para o carrinho do
  // aparelho (que funciona sem conta); com sessao, para a dispensa da familia.
  // A pagina de apresentacao continua no repositorio e volta trocando estas
  // quatro linhas, se um dia o app for divulgado para outras pessoas.
  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/app/estoque" : "/mercado";
    return NextResponse.redirect(url);
  }

  if (user && path === "/entrar") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/estoque";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Roda em tudo, menos assets estaticos e imagens.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
