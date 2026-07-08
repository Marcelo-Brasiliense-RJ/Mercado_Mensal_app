"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/BrandMark";
import { createClient } from "@/lib/supabase/client";

const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";
const primary =
  "h-[52px] w-full rounded-[15px] bg-brand text-[16px] font-bold text-brand-ink disabled:opacity-50";

const MIN = 8;

// Destino do link de recuperacao (/auth/confirm redireciona pra ca com a sessao
// de recovery ativa). O usuario define a nova senha e vai pro app.
export default function RedefinirSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function salvar() {
    setErro(null);
    if (senha.length < MIN) return setErro(`A senha precisa ter ao menos ${MIN} caracteres.`);
    if (senha !== confirma) return setErro("As senhas nao conferem.");

    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    setLoading(false);

    if (error) {
      setErro(
        error.message.toLowerCase().includes("session")
          ? "Link expirado ou invalido. Peca a recuperacao de novo."
          : "Nao foi possivel salvar. Tente novamente.",
      );
      return;
    }
    router.replace("/app/estoque");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-fit">
            <BrandMark size={56} radius={15} />
          </div>
          <h1 className="text-[26px] font-extrabold">Nova senha</h1>
        </div>
        <div className="rounded-[22px] border border-border bg-card p-7 shadow-[0_8px_30px_var(--shadow)]">
          <label className={labelCls}>Nova senha</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Ao menos 8 caracteres"
            className={`${field} mb-3.5`}
          />
          <label className={labelCls}>Confirmar senha</label>
          <input
            type="password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            placeholder="Repita a senha"
            className={`${field} mb-2`}
          />
          {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
          <button onClick={salvar} disabled={loading} className={`${primary} mt-2`}>
            {loading ? "Salvando..." : "Salvar senha"}
          </button>
        </div>
      </div>
    </div>
  );
}
