import { AppShell } from "@/components/layout/AppShell";
import { TopBar } from "@/components/layout/TopBar";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { ListView } from "@/components/lista/ListView";
import { shopping } from "@/lib/seed";

export default function ListaPage() {
  return (
    <AppShell
      top={<TopBar title="Lista" subtitle="de compras" right={<ThemeToggle />} />}
    >
      <ListView items={shopping} />
    </AppShell>
  );
}
