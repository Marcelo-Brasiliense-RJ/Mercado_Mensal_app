"use client";

import { Modal } from "@/components/ui/Modal";
import { ChevronRight, TelegramIcon, PlusIcon, BarcodeIcon, MicIcon } from "@/components/ui/icons";
import { BOT_URL } from "@/lib/config";

// Menu de "Adicionar" reusado no Estoque e na Lista: falar aqui no app, ler codigo
// de barras (onde faz sentido), digitar, e o Telegram por ultimo.
// O que "manual" significa e decidido por quem usa (onManual + textos); leitor e
// microfone so aparecem para quem passa onScan/onVoice.
// A ordem e deliberada: desde que o ditado passou a existir dentro do app, sair
// para o Telegram deixou de ser o caminho principal de entrada por voz.
export function AddMenu({
  open,
  onClose,
  onManual,
  onScan,
  onVoice,
  title = "Adicionar",
  manualLabel,
  manualDesc,
}: {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
  onScan?: () => void;
  onVoice?: () => void;
  title?: string;
  manualLabel: string;
  manualDesc: string;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={440}>
      <div className="mb-4 text-[19px] font-extrabold">{title}</div>
      <div className="flex flex-col gap-3">
        {onVoice && (
          <button
            onClick={() => {
              onClose();
              onVoice();
            }}
            className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
              <MicIcon size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Falar aqui no app</span>
              <span className="block text-[13px] leading-snug text-text-2">
                Diga o que comprou ou o que precisa. Você confere antes de salvar.
              </span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-text-3" />
          </button>
        )}
        {onScan && (
          <button
            onClick={() => {
              onClose();
              onScan();
            }}
            className="flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-4 text-left"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-card-2 text-brand">
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
          className="flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-4 text-left"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-card-2 text-brand">
            <PlusIcon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{manualLabel}</span>
            <span className="block text-[13px] leading-snug text-text-2">{manualDesc}</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-text-3" />
        </button>
        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-4"
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
      </div>
    </Modal>
  );
}
