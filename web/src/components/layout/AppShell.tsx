import { TabBar } from "./TabBar";

export function AppShell({
  top,
  children,
}: {
  top: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col bg-bg">
      {top}
      <main className="flex-1 px-4 pt-4 pb-[104px]">{children}</main>
      <TabBar />
    </div>
  );
}
