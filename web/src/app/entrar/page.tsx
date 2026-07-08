"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/BrandMark";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

// Fluxo de acesso: login, cadastro e recuperacao via Supabase Auth. Apos entrar,
// o gate do /app (HouseholdProvider) decide se mostra o onboarding de familia.
type Phase = "login" | "signup" | "forgot" | "checkEmail";

const MIN_SENHA = 8;

// Traduz as mensagens do Supabase Auth para PT-BR sem vazar detalhe demais.
function mapErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("already registered")) return "Este e-mail ja tem conta. Faca login.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um instante.";
  return "Nao foi possivel concluir. Tente novamente.";
}

function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";
const primary =
  "h-[52px] w-full rounded-[15px] bg-brand text-[16px] font-bold text-brand-ink disabled:opacity-50";
const linkBtn = "font-bold text-brand";

export default function Entrar() {
  const router = useRouter();
  const { showToast } = useStore();
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] = useState<Phase>("login");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mensagem quando o link de e-mail falha (vem de /auth/confirm).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "link_invalido")
      setErro("Link expirado ou invalido. Refaca o processo.");
  }, []);

  async function entrar() {
    setErro(null);
    if (!emailValido(email) || !senha) return setErro("Informe e-mail e senha.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) return setErro(mapErro(error.message));
    router.replace("/app/estoque");
    router.refresh();
  }

  async function criarConta() {
    setErro(null);
    if (!nome.trim()) return setErro("Informe seu nome.");
    if (!emailValido(email)) return setErro("Informe um e-mail valido.");
    if (senha.length < MIN_SENHA)
      return setErro(`A senha precisa ter ao menos ${MIN_SENHA} caracteres.`);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { name: nome.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/app/estoque`,
      },
    });
    setLoading(false);
    if (error) return setErro(mapErro(error.message));
    setPhase("checkEmail");
  }

  async function recuperar() {
    setErro(null);
    if (!emailValido(email)) return setErro("Informe um e-mail valido.");
    setLoading(true);
    // Ignora o retorno de proposito: nunca revelar se o e-mail existe.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir-senha`,
    });
    setLoading(false);
    showToast("Se existir uma conta, enviamos o link de recuperacao.");
    setPhase("login");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      {phase === "login" && (
        <div className="w-full max-w-[420px]">
          <Head title="Entrar" />
          <Panel>
            <label className={labelCls}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className={`${field} mb-3.5`}
            />
            <label className={labelCls}>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="********"
              className={`${field} mb-2.5`}
            />
            <div className="mb-[18px] text-right">
              <button
                onClick={() => { setErro(null); setPhase("forgot"); }}
                className="text-[13px] font-bold text-brand"
              >
                Esqueci a senha
              </button>
            </div>
            {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
            <button onClick={entrar} disabled={loading} className={primary}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </Panel>
          <Foot>
            Não tem conta?{" "}
            <button onClick={() => { setErro(null); setPhase("signup"); }} className={linkBtn}>
              Criar conta
            </button>
          </Foot>
        </div>
      )}

      {phase === "signup" && (
        <div className="w-full max-w-[420px]">
          <Head title="Criar conta" />
          <Panel>
            <label className={labelCls}>Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              className={`${field} mb-3.5`}
            />
            <label className={labelCls}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className={`${field} mb-3.5`}
            />
            <label className={labelCls}>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Crie uma senha"
              className={`${field} mb-5`}
            />
            {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
            <button onClick={criarConta} disabled={loading} className={primary}>
              {loading ? "Criando..." : "Criar conta"}
            </button>
          </Panel>
          <Foot>
            Já tem conta?{" "}
            <button onClick={() => { setErro(null); setPhase("login"); }} className={linkBtn}>
              Entrar
            </button>
          </Foot>
        </div>
      )}

      {phase === "forgot" && (
        <div className="w-full max-w-[420px]">
          <Head title="Recuperar senha" />
          <Panel>
            <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
              Informe seu e-mail e enviaremos um link para criar uma nova senha.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className={`${field} mb-[18px]`}
            />
            {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
            <button onClick={recuperar} disabled={loading} className={primary}>
              {loading ? "Enviando..." : "Enviar link"}
            </button>
          </Panel>
          <Foot>
            <button onClick={() => { setErro(null); setPhase("login"); }} className={linkBtn}>
              Voltar para o login
            </button>
          </Foot>
        </div>
      )}

      {phase === "checkEmail" && (
        <div className="w-full max-w-[440px]">
          <div className="rounded-[22px] border border-border bg-card p-8 text-center shadow-[0_8px_30px_var(--shadow)]">
            <div className="mx-auto mb-3.5 grid h-[60px] w-[60px] place-items-center rounded-[18px] bg-pos-soft text-pos">
              <CheckIcon size={30} />
            </div>
            <h2 className="mb-1.5 text-[22px] font-extrabold">Verifique seu e-mail</h2>
            <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
              Enviamos um link de confirmação para{" "}
              <span className="font-bold text-text">{email}</span>. Abra o link
              para ativar sua conta e entrar.
            </p>
            <button onClick={() => { setErro(null); setPhase("login"); }} className={primary}>
              Voltar para o login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Head({ title }: { title: string }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 w-fit">
        <BrandMark size={56} radius={15} />
      </div>
      <h1 className="text-[26px] font-extrabold">{title}</h1>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-border bg-card p-7 shadow-[0_8px_30px_var(--shadow)]">
      {children}
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 text-center text-[14px] text-text-2">{children}</div>;
}
