"use client";

import { useStore } from "@/lib/store";

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 animate-[toastIn_0.22s_ease_both] rounded-xl bg-text px-5 py-3 text-sm font-semibold text-bg shadow-[0_10px_26px_var(--shadow-lg)]"
    >
      {toast}
    </div>
  );
}
