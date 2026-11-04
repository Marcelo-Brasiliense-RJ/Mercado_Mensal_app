"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, ListIcon, ChartIcon, HeartIcon, TagIcon } from "@/components/ui/icons";

const tabs = [
  { href: "/app/estoque", label: "Estoque", Icon: BoxIcon },
  { href: "/app/lista", label: "Lista", Icon: ListIcon },
  { href: "/app/ofertas", label: "Ofertas", Icon: TagIcon },
  { href: "/app/livelo", label: "Livelo", Icon: HeartIcon },
  { href: "/app/economia", label: "Economia", Icon: ChartIcon },
];

export function TabBar({ className = "" }: { className?: string }) {
  const path = usePathname();
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] ${className}`}
    >
      {tabs.map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`ic-toque relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 ${
              active ? "text-brand" : "text-text-3"
            }`}
          >
            {active && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-brand" aria-hidden />}
            {/* key: ao trocar de aba, o icone da aba nova "salta" uma vez */}
            <span key={String(active)} className={active ? "ic-pop" : ""}>
              <Icon size={23} />
            </span>
            <span className="text-[11px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
