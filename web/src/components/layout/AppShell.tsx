"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { ReceiptModal } from "@/components/receipt/ReceiptModal";
import { ReceiptIcon, UsersIcon } from "@/components/ui/icons";

const META: Record<string, { title: string; subtitle: string }> = {
  "/app/estoque": { title: "Estoque", subtitle: "Dispensa" },
  "/app/lista": { title: "Lista", subtitle: "de compras" },
  "/app/economia": { title: "Economia", subtitle: "do mês" },
  "/app/config": { title: "Família", subtitle: "e ajustes" },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const meta =
    Object.entries(META).find(([href]) => path.startsWith(href))?.[1] ??
    META["/app/estoque"];

  return (
    <div className="h-dvh overflow-hidden bg-bg lg:flex">
      <div className="hidden lg:flex">
        <Sidebar onRegistrar={() => setReceiptOpen(true)} />
      </div>

      <div className="flex h-dvh min-w-0 flex-col lg:flex-1">
        <TopBar
          className="lg:hidden"
          title={meta.title}
          subtitle={meta.subtitle}
          right={
            <div className="flex items-center">
              <button
                onClick={() => setReceiptOpen(true)}
                aria-label="Registrar compra"
                className="grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
              >
                <ReceiptIcon size={20} />
              </button>
              <Link
                href="/app/config"
                aria-label="Família e ajustes"
                className="grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
              >
                <UsersIcon size={20} />
              </Link>
              <ThemeToggle />
            </div>
          }
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[640px] px-4 pb-[104px] pt-4 lg:max-w-[1120px] lg:px-9 lg:pb-14 lg:pt-7">
            {children}
          </div>
        </main>

        <TabBar className="lg:hidden" />
      </div>

      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}
