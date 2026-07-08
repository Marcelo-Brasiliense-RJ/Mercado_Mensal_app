"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, UsersIcon, TelegramIcon, CheckIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/BrandMark";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

// Fluxo de acesso. Login/cadastro/recuperacao usam o Supabase Auth (built-in).
// ponytail: as fases de familia (familyChoice/Create/Join/telegram) seguem mock
// ate a camada de dados ligar no Supabase; hoje nao sao alcancadas pelo fluxo de
// auth (cadastro exige confirmar e-mail antes de qualquer coisa).
type Phase =
  | "login"
  | "signup"
  | "forgot"
  | "checkEmail"
  | "familyChoice"
  | "familyCreate"
  | "familyJoin"
  | "telegram";

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
  const { family, showToast } = useStore();
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] = useState<Phase>("login");
  const [created, setCreated] = useState(false);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mensagem quando o link de e-mail falha (vem de /auth/confirm).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "link_invalido")
      setErro("Link expirado ou invalido. Refaca o processo.");
  }, []);

  const botUrl = `https://t.me/${family.botHandle.replace("@", "")}`;
  const enterApp = () => router.push("/app/estoque");

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

      {phase === "familyChoice" && (
        <div className="w-full max-w-[640px]">
          <div className="mb-6 text-center">
            <h1 className="mb-1.5 text-[28px] font-extrabold">Sua família</h1>
            <p className="text-[15px] text-text-2">
              Crie uma família ou entre em uma com um código.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => {
                setCreated(false);
                setPhase("familyCreate");
              }}
              className="rounded-[20px] border border-border bg-card p-6 text-left shadow-[0_2px_12px_var(--shadow)]"
            >
              <div className="mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-brand-soft text-brand">
                <PlusIcon size={18} />
              </div>
              <div className="mb-1 text-[17px] font-extrabold">Criar família</div>
              <div className="text-[13px] text-text-2">Comece do zero e convide todo mundo.</div>
            </button>
            <button
              onClick={() => setPhase("familyJoin")}
              className="rounded-[20px] border border-border bg-card p-6 text-left shadow-[0_2px_12px_var(--shadow)]"
            >
              <div className="mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-brand-soft text-brand">
                <UsersIcon size={18} />
              </div>
              <div className="mb-1 text-[17px] font-extrabold">Entrar em uma família</div>
              <div className="text-[13px] text-text-2">Recebeu um código? Entre aqui.</div>
            </button>
          </div>
        </div>
      )}

      {phase === "familyCreate" && !created && (
        <div className="w-full max-w-[440px]">
          <Head title="Criar família" />
          <Panel>
            <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
              Dê um nome para identificar sua casa. Você recebe um código para
              convidar a família.
            </p>
            <label className={labelCls}>Nome da família</label>
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ex.: Família Oliveira"
              className={`${field} mb-5`}
            />
            <button onClick={() => setCreated(true)} className={primary}>
              Criar família
            </button>
          </Panel>
        </div>
      )}

      {phase === "familyCreate" && created && (
        <div className="w-full max-w-[440px]">
          <div className="rounded-[22px] border border-border bg-card p-8 text-center shadow-[0_8px_30px_var(--shadow)]">
            <div className="mx-auto mb-3.5 grid h-[60px] w-[60px] place-items-center rounded-[18px] bg-pos-soft text-pos">
              <CheckIcon size={30} />
            </div>
            <h2 className="mb-1.5 text-[22px] font-extrabold">Família criada!</h2>
            <p className="mb-[18px] text-[14px] text-text-2">
              Compartilhe este código para a família entrar:
            </p>
            <div className="mb-3.5 rounded-[16px] bg-brand-soft p-[18px] font-mono text-[32px] font-extrabold tracking-[0.2em] text-brand">
              {family.code}
            </div>
            <button onClick={() => setPhase("telegram")} className={primary}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {phase === "familyJoin" && (
        <div className="w-full max-w-[420px]">
          <Head title="Entrar em família" />
          <Panel>
            <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
              Digite o código de convite que você recebeu.
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ex.: K7P2QX"
              className="mb-[18px] h-14 w-full rounded-[14px] border border-border bg-card-2 px-3.5 text-center font-mono text-[24px] font-extrabold uppercase tracking-[0.16em]"
            />
            <button
              onClick={() => setPhase("telegram")}
              disabled={joinCode.trim().length < 4}
              className={primary}
            >
              Entrar na família
            </button>
          </Panel>
        </div>
      )}

      {phase === "telegram" && (
        <div className="w-full max-w-[440px] text-center">
          <div className="mx-auto mb-3.5 grid h-[60px] w-[60px] place-items-center rounded-[18px] bg-[#2AABEE] text-white shadow-[0_8px_20px_var(--shadow-lg)]">
            <TelegramIcon size={18} />
          </div>
          <h1 className="mb-2 text-[26px] font-extrabold">Conecte o Telegram</h1>
          <p className="mx-auto mb-5 max-w-[360px] text-[15px] leading-relaxed text-text-2">
            Abra o bot <span className="font-bold text-text">{family.botHandle}</span> e
            envie o código da sua família.
          </p>
          <div className="mb-[18px] flex items-center gap-2.5">
            <div className="flex-1 rounded-[12px] bg-brand-soft p-3.5 font-mono text-[22px] font-extrabold tracking-[0.16em] text-brand">
              {family.code}
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(family.code);
                  showToast("Código copiado");
                } catch {}
              }}
              className="h-[52px] rounded-[12px] border border-border bg-card-2 px-[18px] text-[14px] font-bold"
            >
              Copiar
            </button>
          </div>
          <a
            href={botUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2.5 flex h-[52px] items-center justify-center gap-2.5 rounded-[15px] bg-[#2AABEE] text-[16px] font-bold text-white"
          >
            <TelegramIcon size={18} /> Abrir no Telegram
          </a>
          <button
            onClick={enterApp}
            className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
          >
            Ir para o app
          </button>
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
