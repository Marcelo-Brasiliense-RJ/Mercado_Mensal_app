"use client";

import { useState } from "react";
import { PlusIcon, UsersIcon, TelegramIcon, CheckIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/BrandMark";
import { createClient } from "@/lib/supabase/client";
import { useHousehold } from "@/lib/household";
import { BOT_HANDLE, botDeepLink } from "@/lib/config";
import { useStore } from "@/lib/store";

// Onboarding de familia mostrado pelo gate quando o usuario esta logado mas
// ainda sem familia. Cria/entra chamando as RPCs _web (auth.uid()) do Supabase.
type Phase = "choice" | "create" | "join" | "telegram";

const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const primary =
  "h-[52px] w-full rounded-[15px] bg-brand text-[16px] font-bold text-brand-ink disabled:opacity-50";

export function FamilyOnboarding() {
  const { reload } = useHousehold();
  const { showToast } = useStore();
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] = useState<Phase>("choice");
  const [familyName, setFamilyName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [code, setCode] = useState(""); // codigo da familia (para o passo Telegram)
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function criar() {
    setErro(null);
    if (!familyName.trim()) return setErro("Dê um nome para a família.");
    setLoading(true);
    const { data, error } = await supabase.rpc("mercado_create_family_web", {
      p_name: familyName.trim(),
    });
    setLoading(false);
    if (error) return setErro(`Não foi possível criar: ${error.message}`);
    if (!data?.ok)
      return setErro(
        data?.erro === "nao_autenticado"
          ? "Sua sessão expirou. Entre novamente."
          : "Não foi possível criar. Tente novamente.",
      );
    setCode(data.invite_code);
    setPhase("telegram");
  }

  async function entrar() {
    setErro(null);
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return setErro("Informe o código de convite.");
    setLoading(true);
    const { data, error } = await supabase.rpc("mercado_join_family_web", {
      p_code: c,
    });
    setLoading(false);
    if (error) return setErro(`Não foi possível entrar: ${error.message}`);
    if (!data?.ok)
      return setErro(
        data?.erro === "nao_autenticado"
          ? "Sua sessão expirou. Entre novamente."
          : "Código inválido. Confira e tente de novo.",
      );
    setCode(c);
    setPhase("telegram");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      {phase === "choice" && (
        <div className="w-full max-w-[640px]">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 w-fit">
              <BrandMark size={56} radius={15} />
            </div>
            <h1 className="mb-1.5 text-[28px] font-extrabold">Sua família</h1>
            <p className="text-[15px] text-text-2">
              Crie uma família ou entre em uma com um código.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => { setErro(null); setPhase("create"); }}
              className="rounded-[20px] border border-border bg-card p-6 text-left shadow-[0_2px_12px_var(--shadow)]"
            >
              <div className="mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-brand-soft text-brand">
                <PlusIcon size={18} />
              </div>
              <div className="mb-1 text-[17px] font-extrabold">Criar família</div>
              <div className="text-[13px] text-text-2">Comece do zero e convide todo mundo.</div>
            </button>
            <button
              onClick={() => { setErro(null); setPhase("join"); }}
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

      {phase === "create" && (
        <div className="w-full max-w-[440px]">
          <Head title="Criar família" />
          <Panel>
            <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
              Dê um nome para identificar sua casa. Você recebe um código para
              convidar a família.
            </p>
            <label className="mb-1.5 block text-xs font-bold text-text-2">Nome da família</label>
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ex.: Família Oliveira"
              className={`${field} mb-5`}
            />
            {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
            <button onClick={criar} disabled={loading} className={primary}>
              {loading ? "Criando..." : "Criar família"}
            </button>
          </Panel>
          <Foot onClick={() => { setErro(null); setPhase("choice"); }}>Voltar</Foot>
        </div>
      )}

      {phase === "join" && (
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
            {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
            <button onClick={entrar} disabled={loading} className={primary}>
              {loading ? "Entrando..." : "Entrar na família"}
            </button>
          </Panel>
          <Foot onClick={() => { setErro(null); setPhase("choice"); }}>Voltar</Foot>
        </div>
      )}

      {phase === "telegram" && (
        <div className="w-full max-w-[440px] text-center">
          <div className="mx-auto mb-3.5 grid h-[60px] w-[60px] place-items-center rounded-[18px] bg-[#2AABEE] text-white shadow-[0_8px_20px_var(--shadow-lg)]">
            <TelegramIcon size={18} />
          </div>
          <h1 className="mb-2 text-[26px] font-extrabold">Conecte o Telegram</h1>
          <p className="mx-auto mb-5 max-w-[360px] text-[15px] leading-relaxed text-text-2">
            Abra o bot <span className="font-bold text-text">{BOT_HANDLE}</span>. Ele
            já vem com o código pronto, é só tocar em Iniciar.
          </p>
          <div className="mb-[18px] flex items-center gap-2.5">
            <div className="flex-1 rounded-[12px] bg-brand-soft p-3.5 font-mono text-[22px] font-extrabold tracking-[0.16em] text-brand">
              {code}
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  showToast("Código copiado");
                } catch {}
              }}
              className="h-[52px] rounded-[12px] border border-border bg-card-2 px-[18px] text-[14px] font-bold"
            >
              Copiar
            </button>
          </div>
          <a
            href={botDeepLink(code)}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2.5 flex h-[52px] items-center justify-center gap-2.5 rounded-[15px] bg-[#2AABEE] text-[16px] font-bold text-white"
          >
            <TelegramIcon size={18} /> Abrir no Telegram
          </a>
          <button
            onClick={() => reload()}
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

function Foot({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div className="mt-5 text-center text-[14px] text-text-2">
      <button onClick={onClick} className="font-bold text-brand">
        {children}
      </button>
    </div>
  );
}
