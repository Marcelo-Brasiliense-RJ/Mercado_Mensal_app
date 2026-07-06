import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { CopyButton } from "@/components/familia/CopyButton";
import { TelegramIcon } from "@/components/ui/icons";
import { family, members } from "@/lib/seed";

export default function ConfigPage() {
  return (
    <AppShell
      top={
        <TopBar
          title="Sua familia"
          subtitle="configuracoes"
          back="/app/estoque"
          right={<ThemeToggle />}
        />
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="text-[13px] text-text-2">Familia</div>
          <div className="text-[20px] font-extrabold">{family.name}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 rounded-[14px] bg-brand-soft px-4 py-3 text-center font-mono text-[22px] font-extrabold tracking-[0.2em] text-brand">
              {family.code}
            </div>
            <CopyButton value={family.code} />
          </div>
          <div className="mt-2 text-[12px] text-text-3">
            Compartilhe este codigo para alguem entrar na familia.
          </div>
        </Card>

        <Card>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[13px] font-extrabold uppercase tracking-wide text-text-3">
              Membros
            </span>
            <span className="rounded-full bg-card-2 px-2 py-0.5 text-[11px] font-bold text-text-3">
              {members.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.name} className="flex items-center gap-3 py-2.5">
                <AvatarInitial name={m.name} size={40} />
                <div className="flex-1">
                  <div className="font-bold">{m.name}</div>
                  <div
                    className={`text-[12px] ${
                      m.telegram ? "text-pos" : "text-text-3"
                    }`}
                  >
                    {m.telegram ? "Telegram conectado" : "Telegram pendente"}
                  </div>
                </div>
                <span className="text-[12px] font-semibold text-text-2">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <a
          href={`https://t.me/${family.botHandle.replace("@", "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[50px] items-center justify-center gap-2 rounded-[16px] bg-[#2AABEE] font-bold text-white"
        >
          <TelegramIcon size={20} /> Abrir o bot no Telegram
        </a>

        <Link
          href="/"
          className="flex h-[50px] items-center justify-center rounded-[16px] border border-border bg-card font-bold text-neg"
        >
          Sair da conta
        </Link>
      </div>
    </AppShell>
  );
}
