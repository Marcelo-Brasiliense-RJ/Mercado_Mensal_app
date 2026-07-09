"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FamilyOnboarding } from "@/components/familia/FamilyOnboarding";
import { HouseholdProvider, useHousehold } from "@/lib/household";
import { useStore } from "@/lib/store";

function Gate({ children }: { children: React.ReactNode }) {
  const { household, loading } = useHousehold();
  const { reloadData } = useStore();

  // Assim que a familia esta resolvida, carrega estoque/lista/economia do banco.
  useEffect(() => {
    if (household) reloadData();
  }, [household, reloadData]);

  // O bot (Telegram) grava no banco por fora do app. Recarrega ao voltar o foco
  // ou a aba ficar visivel, para o que foi registrado no celular aparecer aqui
  // sem reload manual. ponytail: focus/visibility cobre o fluxo comum; polling
  // continuo so se quiser atualizacao ao vivo com as duas telas abertas.
  useEffect(() => {
    if (!household) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadData();
    };
    window.addEventListener("focus", reloadData);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", reloadData);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [household, reloadData]);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-brand" />
      </div>
    );
  }
  if (!household) return <FamilyOnboarding />;
  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HouseholdProvider>
      <Gate>{children}</Gate>
    </HouseholdProvider>
  );
}
