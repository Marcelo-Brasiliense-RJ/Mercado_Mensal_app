"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  ReceiptIcon,
  TelegramIcon,
  CheckIcon,
  ChevronRight,
} from "@/components/ui/icons";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BOT_URL } from "@/lib/config";

// Amostra usada quando nao ha OCR real (ainda). ponytail: itens fixos ate a
// leitura de nota fiscal ser ligada no backend.
const SAMPLE = [
  { name: "Arroz Tio João 5kg", qty: 1, price: 24.9 },
  { name: "Café Pilão 500g", qty: 2, price: 12.9 },
  { name: "Leite Integral 1L", qty: 6, price: 4.5 },
  { name: "Feijão Carioca 1kg", qty: 2, price: 7.2 },
  { name: "Óleo de Soja 900ml", qty: 2, price: 7.5 },
  { name: "Detergente Ypê", qty: 3, price: 2.8 },
  { name: "Sabão em pó OMO 1kg", qty: 1, price: 18.9 },
  { name: "Açúcar União 1kg", qty: 1, price: 4.5 },
];

type Phase = "capture" | "processing" | "review";
const botUrl = BOT_URL;

export function ReceiptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { confirmReceipt, showToast } = useStore();
  const [phase, setPhase] = useState<Phase>("capture");

  function close() {
    onClose();
    setPhase("capture");
  }

  function scan() {
    setPhase("processing");
    setTimeout(() => setPhase("review"), 1600);
  }

  function confirm() {
    confirmReceipt(SAMPLE);
    showToast(`${SAMPLE.length} itens adicionados ao estoque`);
    close();
  }

  const total = SAMPLE.reduce((a, i) => a + i.qty * i.price, 0);

  return (
    <Modal open={open} onClose={close}>
      {phase === "capture" && (
        <>
          <div className="mb-1 text-[20px] font-extrabold">Registrar compra</div>
          <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
            Escolha como registrar sua compra. As duas formas funcionam igual de
            bem:
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
                <ReceiptIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">
                  Foto da nota fiscal
                </span>
                <span className="block text-[13px] leading-snug text-text-2">
                  A gente lê os itens e preços automaticamente.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-text-3" />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={scan}
                className="hidden"
              />
            </label>
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-[#2AABEE] bg-card p-4"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#2AABEE] text-white">
                <TelegramIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">
                  Áudio no Telegram
                </span>
                <span className="block text-[13px] leading-snug text-text-2">
                  Fale o que comprou e o bot registra pra você.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-[#2AABEE]" />
            </a>
          </div>
          <button
            onClick={scan}
            className="mt-3.5 h-10 w-full text-[13px] font-bold text-brand"
          >
            Ver com uma nota de exemplo
          </button>
        </>
      )}

      {phase === "processing" && (
        <div className="py-2.5 text-center">
          <div className="relative mx-auto mb-5 h-[216px] w-[170px] overflow-hidden rounded-[14px] border border-border bg-card-2">
            <div className="absolute inset-x-0 top-0 h-[38%] animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-brand/45 to-transparent" />
          </div>
          <div className="mb-1 text-[18px] font-extrabold">Lendo sua nota fiscal...</div>
          <div className="text-[13px] text-text-2">Identificando itens e preços</div>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-pos-soft text-pos">
              <CheckIcon size={14} />
            </span>
            <div className="text-[20px] font-extrabold">
              Encontramos {SAMPLE.length} itens
            </div>
          </div>
          <div className="mb-3.5 text-[14px] text-text-2">
            Confira e confirme para adicionar ao seu estoque.
          </div>
          <div className="mb-4 overflow-hidden rounded-[16px] border border-border">
            {SAMPLE.map((r, i) => (
              <div
                key={r.name}
                className={`flex items-center gap-2.5 px-4 py-3 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold">{r.name}</div>
                  <div className="text-[12px] text-text-3">
                    {r.qty} × {brl(r.price)}
                  </div>
                </div>
                <span className="text-[14px] font-extrabold">{brl(r.qty * r.price)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border bg-card-2 px-4 py-3.5">
              <span className="text-[13px] font-extrabold uppercase tracking-wide text-text-2">
                Total
              </span>
              <span className="text-[20px] font-extrabold">{brl(total)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={close}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              Confirmar e adicionar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
