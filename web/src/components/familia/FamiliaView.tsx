"use client";

import { useState } from "react";
import { TelegramIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { useHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/client";
import { BOT_HANDLE, botDeepLink } from "@/lib/config";

const cardCls =
  "rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]";

export function FamiliaView() {
  const { household, reload } = useHousehold();
  const { showToast } = useStore();
  const [trocar, setTrocar] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // O gate garante que household existe antes de montar esta tela.
  const family = household!;

  async function copy() {
    try {
      await navigator.clipboard.writeText(family.invite_code);
      showToast("Código copiado");
    } catch {}
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Dispensa",
          text: `Entre na nossa família no Dispensa com o código ${family.invite_code}`,
        });
        return;
      } catch {}
    }
    copy();
  }

  async function trocarFamilia() {
    setErro(null);
    const c = novoCodigo.trim().toUpperCase();
    if (c.length < 4) return setErro("Informe o código.");
    setLoading(true);
    const { data, error } = await createClient().rpc("mercado_join_family_web", {
      p_code: c,
    });
    setLoading(false);
    if (error) return setErro("Não foi possível trocar. Tente novamente.");
    if (!data?.ok) return setErro("Código inválido. Confira e tente de novo.");
    showToast(`Você entrou na família ${data.familia}`);
    setTrocar(false);
    setNovoCodigo("");
    await reload();
  }

  async function sair() {
    await createClient().auth.signOut();
    // Reload completo: limpa o estado do cliente e o proxy ja ve sem sessao.
    window.location.assign("/entrar");
  }

  return (
    <div className="lg:max-w-[720px]">
      <ScreenHeader title="Família e ajustes" />

      <div className="space-y-[18px]">
        {/* Codigo de convite */}
        <div className={cardCls}>
          <div className="mb-4 text-[20px] font-extrabold">{family.familia}</div>
          <div className="mb-2 text-xs font-bold text-text-2">Código de convite</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[12px] bg-brand-soft px-5 py-3 font-mono text-[24px] font-extrabold tracking-[0.18em] text-brand">
              {family.invite_code}
            </div>
            <button
              onClick={copy}
              className="h-12 rounded-[12px] border border-border bg-card-2 px-4 text-[14px] font-bold"
            >
              Copiar
            </button>
            <button
              onClick={share}
              className="h-12 rounded-[12px] border border-border bg-card-2 px-4 text-[14px] font-bold"
            >
              Compartilhar
            </button>
          </div>
        </div>

        {/* Conectar Telegram */}
        <div className={cardCls}>
          <div className="mb-1.5 text-[15px] font-extrabold">Conectar Telegram</div>
          <div className="mb-4 text-[14px] leading-relaxed text-text-2">
            Abra o bot <span className="font-bold text-text">{BOT_HANDLE}</span>. Ele
            já vem com o código pronto para registrar compras por áudio.
          </div>
          <a
            href={botDeepLink(family.invite_code)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#2AABEE] px-[22px] text-[15px] font-bold text-white"
          >
            <TelegramIcon size={18} />
            Abrir no Telegram
          </a>
        </div>

        {/* Trocar de familia */}
        <div className={cardCls}>
          <div className="mb-1.5 text-[15px] font-extrabold">Trocar de família</div>
          {!trocar ? (
            <>
              <div className="mb-4 text-[14px] leading-relaxed text-text-2">
                Entre em outra família com um código de convite. Você deixa a
                família atual.
              </div>
              <button
                onClick={() => { setErro(null); setTrocar(true); }}
                className="h-11 rounded-[12px] border border-border bg-card-2 px-4 text-[14px] font-bold"
              >
                Usar outro código
              </button>
            </>
          ) : (
            <>
              <input
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                placeholder="Código de convite"
                className="mb-3 h-12 w-full rounded-[12px] border border-border bg-card-2 px-3.5 text-center font-mono text-[18px] font-extrabold uppercase tracking-[0.14em]"
              />
              {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { setTrocar(false); setErro(null); }}
                  className="h-11 flex-1 rounded-[12px] border border-border bg-card text-[14px] font-bold"
                >
                  Cancelar
                </button>
                <button
                  onClick={trocarFamilia}
                  disabled={loading}
                  className="h-11 flex-[1.4] rounded-[12px] bg-brand text-[14px] font-bold text-brand-ink disabled:opacity-50"
                >
                  {loading ? "Trocando..." : "Trocar"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sair (so no mobile: no desktop fica na sidebar) */}
        <button
          onClick={sair}
          className="flex h-[50px] items-center justify-center rounded-[16px] border border-border bg-card font-bold text-neg lg:hidden"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
