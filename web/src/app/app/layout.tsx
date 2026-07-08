"use client";

import { AppShell } from "@/components/layout/AppShell";
import { FamilyOnboarding } from "@/components/familia/FamilyOnboarding";
import { HouseholdProvider, useHousehold } from "@/lib/household";

function Gate({ children }: { children: React.ReactNode }) {
  const { household, loading } = useHousehold();

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
