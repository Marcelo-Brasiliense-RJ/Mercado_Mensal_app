"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { ReceiptModal } from "@/components/receipt/ReceiptModal";
import { ReceiptIcon, RefreshIcon } from "@/components/ui/icons";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { useStore } from "@/lib/store";
import { useHousehold } from "@/lib/household";

const META: Record<string, { title: string; subtitle: string }> = {
  "/app/estoque": { title: "Estoque", subtitle: "Dispensa" },
  "/app/lista": { title: "Lista", subtitle: "de compras" },
  "/app/economia": { title: "Economia", subtitle: "do mês" },
  "/app/config": { title: "Família", subtitle: "e ajustes" },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { receiptOpen, openReceipt, closeReceipt, reloadData, dataLoading } =
    useStore();
  const { household } = useHousehold();
  const meta =
    Object.entries(META).find(([href]) => path.startsWith(href))?.[1] ??
    META["/app/estoque"];

  // Nome curto da familia (sem o prefixo "familia ") pro selo do topo mobile.
  const familia = (household?.familia ?? "").replace(/^fam[íi]lia\s+/i, "").trim();

  return (
    <div className="h-dvh overflow-hidden bg-bg lg:flex">
      <div className="hidden lg:flex">
        <Sidebar onRegistrar={openReceipt} />
      </div>

      <div className="flex h-dvh min-w-0 flex-col lg:flex-1">
        <TopBar
          className="lg:hidden"
          title={meta.title}
          subtitle={meta.subtitle}
          left={
            familia && (
              <Link
                href="/app/config"
                aria-label={`Família ${familia}`}
                title={`Família ${familia}`}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-card-2"
              >
                <AvatarInitial name={familia} size={30} />
              </Link>
            )
          }
          right={
            <div className="flex items-center">
              <button
                onClick={reloadData}
                disabled={dataLoading}
                aria-label="Atualizar"
                className="grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
              >
                <RefreshIcon size={19} className={dataLoading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={openReceipt}
                aria-label="Registrar compra"
                className="grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
              >
                <ReceiptIcon size={20} />
              </button>
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

      <ReceiptModal open={receiptOpen} onClose={closeReceipt} />
    </div>
  );
}
