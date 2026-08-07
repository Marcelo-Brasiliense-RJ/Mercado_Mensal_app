import Link from "next/link";
import { TelegramIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { BOT_HANDLE, BOT_URL } from "@/lib/config";

const steps = [
  { n: 1, title: "Crie sua conta", desc: "E-mail e senha, sem complicação." },
  { n: 2, title: "Monte sua família", desc: "Crie ou entre com um código curto." },
  { n: 3, title: "Conecte o Telegram", desc: `Fale com o bot ${BOT_HANDLE}.` },
  { n: 4, title: "Áudio ou nota fiscal", desc: "Diga o que comprou ou fotografe a nota." },
];
const botUrl = BOT_URL;

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-5 py-5 lg:px-10">
        <div className="flex items-center gap-3">
          <BrandMark size={40} radius={11} />
          <span className="text-[18px] font-extrabold">Despensa</span>
        </div>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/entrar"
            className="flex h-[42px] items-center rounded-[12px] bg-brand px-5 text-[14px] font-bold text-brand-ink"
          >
            Entrar
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-extrabold leading-[1.05] tracking-[-0.03em] text-balance lg:text-[52px]">
            Sua despensa sob controle
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-relaxed text-text-2 lg:text-[18px]">
            Fale por áudio no Telegram ou fotografe a nota fiscal. Acompanhe
            estoque, lista de compras e economia da família, em qualquer tela.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {/* Valor antes de cadastro: o primario leva a uma despensa que da
                pra mexer. O "Entrar" do header continua servindo quem ja tem conta,
                e some a duplicacao de rotulo que a auditoria apontou. */}
            <Link
              href="/exemplo"
              className="flex h-[54px] items-center justify-center rounded-[15px] bg-brand px-[30px] text-[16px] font-bold text-brand-ink shadow-[0_10px_24px_var(--shadow-lg)]"
            >
              Ver uma despensa de exemplo
            </Link>
            {/* Secundario de verdade: o azul do Telegram ficou so no icone. Cheio
                contra cheio, o azul saturado vencia o primario em atencao e a pagina
                nao tinha um caminho obvio. Paleta e tipografia intactas. */}
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[54px] items-center justify-center gap-2 rounded-[15px] border border-border bg-card px-[26px] text-[16px] font-bold text-text-2"
            >
              <TelegramIcon size={18} className="text-[#2AABEE]" /> Abrir no Telegram
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1080px] px-6 pb-14 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-[18px] border border-border bg-card p-[22px] shadow-[0_1px_3px_var(--shadow)]"
            >
              <div className="mb-3.5 grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-brand font-extrabold text-brand-ink">
                {s.n}
              </div>
              <div className="mb-1.5 text-[16px] font-extrabold">{s.title}</div>
              <div className="text-[13px] leading-snug text-text-2">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
