"use client";

import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { TelegramIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

const cardCls =
  "rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]";

export function FamiliaView() {
  const { family, members, showToast } = useStore();
  const botUrl = `https://t.me/${family.botHandle.replace("@", "")}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(family.code);
      showToast("Código copiado");
    } catch {}
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Dispensa",
          text: `Entre na nossa família no Dispensa com o código ${family.code}`,
        });
        return;
      } catch {}
    }
    copy();
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
          <div className="mb-4 text-[20px] font-extrabold">{family.name}</div>
          <div className="mb-2 text-xs font-bold text-text-2">Código de convite</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[12px] bg-brand-soft px-5 py-3 font-mono text-[24px] font-extrabold tracking-[0.18em] text-brand">
              {family.code}
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

        {/* Membros */}
        <div className={cardCls}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-text-3">
              Membros
            </span>
            <span className="rounded-full bg-card-2 px-2.5 py-0.5 text-[12px] font-bold text-text-3">
              {members.length}
            </span>
          </div>
          {members.map((m) => (
            <div
              key={m.name}
              className="flex items-center gap-3.5 border-t border-border py-3.5 first:border-t-0"
            >
              <AvatarInitial name={m.name} size={42} />
              <div className="flex-1">
                <div className="text-[15px] font-bold">{m.name}</div>
                <div className={`text-[12px] ${m.telegram ? "text-pos" : "text-text-3"}`}>
                  {m.telegram ? "Telegram conectado" : "Telegram pendente"}
                </div>
              </div>
              <span className="text-[13px] font-bold text-text-3">{m.role}</span>
            </div>
          ))}
        </div>

        {/* Conectar Telegram */}
        <div className={cardCls}>
          <div className="mb-1.5 text-[15px] font-extrabold">Conectar Telegram</div>
          <div className="mb-4 text-[14px] leading-relaxed text-text-2">
            Envie o código para o bot{" "}
            <span className="font-bold text-text">{family.botHandle}</span> para
            registrar compras por áudio.
          </div>
          <a
            href={botUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#2AABEE] px-[22px] text-[15px] font-bold text-white"
          >
            <TelegramIcon size={18} />
            Abrir no Telegram
          </a>
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
