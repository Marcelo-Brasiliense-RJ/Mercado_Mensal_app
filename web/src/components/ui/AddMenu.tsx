"use client";

import { Modal } from "@/components/ui/Modal";
import { ChevronRight, TelegramIcon, PlusIcon, BarcodeIcon } from "@/components/ui/icons";
import { BOT_URL } from "@/lib/config";

// Menu de "Adicionar" reusado no Estoque e na Lista: audio no Telegram (bot),
// manual (abre o popup da tela) e, onde faz sentido, o leitor de codigo de barras.
// O que "manual" significa e decidido por quem usa (onManual + textos); o leitor so
// aparece para quem passa onScan (hoje, a Lista, porque ele enche o carrinho).
export function AddMenu({
  open,
  onClose,
  onManual,
  onScan,
  title = "Adicionar",
  manualLabel,
  manualDesc,
}: {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
  onScan?: () => void;
  title?: string;
  manualLabel: string;
  manualDesc: string;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={440}>
      <div className="mb-4 text-[19px] font-extrabold">{title}</div>
      <div className="flex flex-col gap-3">
        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-[#2AABEE] bg-card p-4"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#2AABEE] text-white">
            <TelegramIcon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">Áudio no Telegram</span>
            <span className="block text-[13px] leading-snug text-text-2">
              Fale o que comprou que o bot registra pra você.
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-[#2AABEE]" />
        </a>
        {onScan && (
          <button
            onClick={() => {
              onClose();
              onScan();
            }}
            className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
              <BarcodeIcon size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Ler código de barras</span>
              <span className="block text-[13px] leading-snug text-text-2">
                Aponte para a embalagem, diga a quantidade e vai pro carrinho.
              </span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-text-3" />
          </button>
        )}
        <button
          onClick={() => {
            onClose();
            onManual();
          }}
          className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
            <PlusIcon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{manualLabel}</span>
            <span className="block text-[13px] leading-snug text-text-2">{manualDesc}</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-text-3" />
        </button>
      </div>
    </Modal>
  );
}
