"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, ListIcon, ChartIcon } from "@/components/ui/icons";

const tabs = [
  { href: "/app/estoque", label: "Estoque", Icon: BoxIcon },
  { href: "/app/lista", label: "Lista", Icon: ListIcon },
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
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 ${
              active ? "text-brand" : "text-text-3"
            }`}
          >
            <Icon size={24} />
            <span className="text-[11px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
