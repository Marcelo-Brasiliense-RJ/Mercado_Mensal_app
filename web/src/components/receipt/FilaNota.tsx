"use client";

import { useStore } from "@/lib/store";
import { useFilaNota } from "@/lib/filaNota";

// Aviso flutuante da nota lida em segundo plano (lib/filaNota), como o das fotos de
// produto: "Lendo a nota · 3 de 7 fotos" enquanto a IA trabalha e "Nota pronta · tocar
// para conferir" quando termina. Tocar abre a nota (da compra certa) ja nas fotos.
export function FilaNota() {
  const nota = useFilaNota();
  const { receiptOpen, openReceipt, abrirNotaDaCompra } = useStore();
  if (!nota.partes.length || nota.aberta || receiptOpen) return null;
  const total = nota.partes.length;
  const lendo = nota.partes.filter((p) => p.estado === "lendo").length;
  const erros = nota.partes.filter((p) => p.estado === "erro").length;
  const prontas = total - lendo;
  const ocupada = nota.partes.some((p) => p.estado === "lendo" && p.tentativa > 1);
  const texto = lendo
    ? `🧾 ${ocupada ? "IA ocupada, tentando" : "Lendo a nota"} · ${prontas} de ${total} ${total > 1 ? "fotos" : "foto"}`
    : erros
      ? `🧾 Nota: ${erros} ${erros > 1 ? "fotos" : "foto"} sem ler · tocar`
      : "🧾 Nota pronta · tocar para conferir";
  return (
    // colado em cima da barra de baixo (dono: "nao pode ficar voando no meio da tela");
    // a barra: bottom 10px + area segura, 62px de altura
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(10px+env(safe-area-inset-bottom)+66px)] z-30 flex justify-center px-6 lg:bottom-6">
      <button
        type="button"
        onClick={() => (nota.compra ? abrirNotaDaCompra(nota.compra) : openReceipt())}
        className={`pointer-events-auto flex max-w-full items-center gap-2 truncate rounded-full px-3.5 py-1.5 text-[12px] font-bold shadow-md ${lendo ? "bg-text text-bg" : "bg-brand text-brand-ink"}`}
      >
        {lendo > 0 && <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
        {texto}
      </button>
    </div>
  );
}
