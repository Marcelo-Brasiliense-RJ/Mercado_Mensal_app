"use client";

import { Modal } from "@/components/ui/Modal";
import { ReceiptIcon, TelegramIcon, ChevronRight } from "@/components/ui/icons";
import { BOT_HANDLE, BOT_URL } from "@/lib/config";

// O registro de compra (foto da nota ou audio) e feito pelo bot do Telegram, que
// faz a leitura de verdade (visao/transcricao) e grava no estoque. O site ainda
// nao le a nota; por isso encaminha para o bot em vez de inventar itens.
// ponytail: quando houver leitura de nota pelo site (endpoint de visao + RPC
// _web de aplicar), trocar estes atalhos por upload real com revisao.
export function ReceiptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={460}>
      <div className="mb-1 text-[20px] font-extrabold">Registrar compra</div>
      <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
        O registro é pelo bot no Telegram: ele lê a foto da nota (itens e preços)
        ou entende seu áudio, e o resultado aparece aqui no estoque e na economia.
      </p>
      <div className="flex flex-col gap-3">
        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
            <ReceiptIcon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">Foto da nota fiscal</span>
            <span className="block text-[13px] leading-snug text-text-2">
              Abra o bot e mande a foto; ele lê os itens e preços.
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-text-3" />
        </a>
        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
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
      </div>
      <p className="mt-3.5 text-center text-[12px] text-text-3">
        Abre o {BOT_HANDLE} no Telegram.
      </p>
    </Modal>
  );
}
