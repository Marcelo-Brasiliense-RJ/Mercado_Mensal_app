"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxIcon,
  ListIcon,
  ChartIcon,
  ReceiptIcon,
  UsersIcon,
  SunIcon,
  MoonIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/BrandMark";
import { useHousehold } from "@/lib/household";
import { useStore } from "@/lib/store";
import { useTheme } from "@/theme/useTheme";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { href: "/app/estoque", label: "Estoque", Icon: BoxIcon },
  { href: "/app/lista", label: "Lista de compras", Icon: ListIcon },
  { href: "/app/economia", label: "Economia", Icon: ChartIcon },
];

export function Sidebar({ onRegistrar }: { onRegistrar: () => void }) {
  const path = usePathname();
  const { household } = useHousehold();
  const { reloadData, dataLoading } = useStore();
  const { isDark, toggle } = useTheme();

  async function sair() {
    await createClient().auth.signOut();
    window.location.assign("/entrar");
  }

  return (
    <aside className="flex w-[270px] shrink-0 flex-col border-r border-border bg-card px-4 py-[22px]">
      <div className="flex items-center gap-3 px-2 pb-[22px]">
        <BrandMark size={42} radius={12} />
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold leading-[1.15]">Despensa</div>
          <div className="truncate text-[12px] text-text-2">{household?.familia}</div>
        </div>
        <button
          onClick={reloadData}
          disabled={dataLoading}
          aria-label="Atualizar"
          title="Atualizar"
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-text-2 hover:bg-card-2"
        >
          <RefreshIcon size={18} className={dataLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[46px] items-center gap-3 rounded-[12px] px-3.5 text-[15px] font-bold ${
                active
                  ? "bg-brand-soft text-brand"
                  : "text-text-2 hover:bg-card-2"
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        onClick={onRegistrar}
        className="mb-2.5 flex h-12 items-center justify-center gap-2.5 rounded-[14px] bg-brand text-[14px] font-extrabold text-brand-ink shadow-[0_6px_16px_var(--shadow)]"
      >
        <ReceiptIcon size={18} />
        Registrar compra
      </button>

      <Link
        href="/app/config"
        aria-current={path.startsWith("/app/config") ? "page" : undefined}
        className={`flex h-[46px] items-center gap-3 rounded-[12px] px-3.5 text-[14px] font-bold ${
          path.startsWith("/app/config")
            ? "bg-brand-soft text-brand"
            : "text-text-2 hover:bg-card-2"
        }`}
      >
        <UsersIcon size={18} />
        Família e ajustes
      </Link>

      <div className="mt-2 flex gap-2">
        <button
          onClick={toggle}
          className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-[11px] border border-border bg-card text-[13px] font-bold text-text-2 hover:bg-card-2"
        >
          {isDark ? <SunIcon size={19} /> : <MoonIcon size={19} />}
          Tema
        </button>
        <button
          onClick={sair}
          className="flex h-[42px] flex-1 items-center justify-center rounded-[11px] border border-border bg-card text-[13px] font-bold text-neg hover:bg-card-2"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
