import Link from "next/link";
import { BoxIcon, TelegramIcon } from "@/components/ui/icons";
import { family } from "@/lib/seed";

const steps = [
  { n: 1, title: "Crie sua conta", desc: "Login por e-mail e senha, rapido." },
  { n: 2, title: "Monte sua familia", desc: "Crie ou entre por um codigo de convite." },
  { n: 3, title: "Abra o Telegram", desc: "Conecte o bot da sua familia." },
  { n: 4, title: "Mande um audio", desc: '"Comprei arroz 5 reais, dois pacotes."' },
];

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col bg-bg px-5 pb-8 pt-8">
      <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-brand text-brand-ink shadow-[0_8px_20px_var(--shadow-lg)]">
        <BoxIcon size={30} />
      </div>
      <h1 className="mt-6 text-[32px] font-extrabold leading-[1.1] tracking-tight">
        Sua dispensa sob controle
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-2">
        Controle o estoque de casa e as compras do mes falando por audio no
        Telegram. O painel mostra estoque, lista e o quanto voce esta
        economizando.
      </p>

      <div className="mt-7 space-y-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="flex items-start gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[0_1px_3px_var(--shadow)]"
          >
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-brand-ink">
              {s.n}
            </div>
            <div>
              <div className="font-bold">{s.title}</div>
              <div className="text-[13px] text-text-2">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <Link
          href="/app/estoque"
          className="flex h-[52px] items-center justify-center rounded-[16px] bg-brand text-[16px] font-bold text-brand-ink shadow-[0_8px_20px_var(--shadow-lg)]"
        >
          Entrar no app
        </Link>
        <a
          href={`https://t.me/${family.botHandle.replace("@", "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[50px] items-center justify-center gap-2 rounded-[16px] border border-border bg-card font-bold text-text"
        >
          <TelegramIcon size={20} /> Abrir no Telegram
        </a>
      </div>
    </div>
  );
}
