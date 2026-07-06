import { AppShell } from "@/components/layout/AppShell";
import { TopBar } from "@/components/layout/TopBar";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { StockView } from "@/components/estoque/StockView";
import { stock } from "@/lib/seed";

export default function EstoquePage() {
  return (
    <AppShell
      top={<TopBar title="Estoque" subtitle="Dispensa" right={<ThemeToggle />} />}
    >
      <StockView items={stock} />
    </AppShell>
  );
}
