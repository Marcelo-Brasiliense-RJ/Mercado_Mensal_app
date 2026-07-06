"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "@/components/ui/icons";

export function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="grid h-10 w-10 place-items-center rounded-xl bg-card-2 text-text-2"
      aria-label="Copiar codigo"
    >
      {done ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
    </button>
  );
}
