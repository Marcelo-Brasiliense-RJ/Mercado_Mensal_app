"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ReceiptIcon, TelegramIcon, CheckIcon, ChevronRight } from "@/components/ui/icons";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BOT_HANDLE, BOT_URL } from "@/lib/config";
import { QrScanner } from "./QrScanner";
import { invokeNfce } from "@/lib/nfce";

type Item = {
  nome: string;
  marca?: string;
  qtd: number;
  preco: number;
  unidade: string;
  duvida?: boolean;
};
type Phase = "capture" | "scanning" | "processing" | "review" | "error";

// Reduz a foto antes de mandar (payload menor, leitura mais rapida). Cai no
// FileReader se createImageBitmap nao existir.
async function fileToDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
}

const inp =
  "h-9 rounded-[9px] border border-border bg-card-2 px-2 text-[14px] text-text";

export function ReceiptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { confirmReceipt, showToast } = useStore();
  const [phase, setPhase] = useState<Phase>("capture");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  // Origem da leitura: "qr" (SEFAZ) usa dedup pela chave; "ocr" (foto) nao tem chave.
  const [source, setSource] = useState<"qr" | "ocr">("qr");
  const [chave, setChave] = useState("");
  const [emitente, setEmitente] = useState("");
  const [totalNota, setTotalNota] = useState(0);
  const [confere, setConfere] = useState(true);

  function close() {
    onClose();
    setPhase("capture");
    setItems([]);
    setSaving(false);
    setSource("qr");
    setChave("");
    setEmitente("");
    setTotalNota(0);
    setConfere(true);
  }

  // Caminho principal: QR do cupom -> Edge Function nfce-consulta -> itens da SEFAZ.
  async function onQr(qrUrl: string) {
    setSource("qr");
    setPhase("processing");
    const resp = await invokeNfce(qrUrl);
    if (!resp.ok) {
      setPhase("error");
      return;
    }
    setItems(
      resp.itens.map((it) => ({
        nome: it.nome || "",
        marca: it.marca || "",
        qtd: Number(it.qtd) || 1,
        preco: Number(it.preco) || 0,
        unidade: it.unidade || "un",
      })),
    );
    setChave(resp.chave);
    setEmitente(resp.emitente);
    setTotalNota(resp.total_nota);
    setConfere(resp.total_confere);
    setPhase("review");
  }

  // Fallback: foto da nota -> OCR via n8n (rota /api/receipt-ocr).
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSource("ocr");
    setChave("");
    setPhase("processing");
    try {
      const image = await fileToDataUrl(file);
      const r = await fetch("/api/receipt-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await r.json().catch(() => null);
      const lidos = data?.ok && Array.isArray(data.itens) ? (data.itens as Item[]) : [];
      if (!lidos.length) {
        setPhase("error");
        return;
      }
      setItems(
        lidos.map((it) => ({
          nome: it.nome || "",
          marca: it.marca || "",
          qtd: Number(it.qtd) || 1,
          preco: Number(it.preco) || 0,
          unidade: it.unidade || "un",
          duvida: !!it.duvida,
        })),
      );
      setConfere(true);
      setPhase("review");
    } catch {
      setPhase("error");
    }
  }

  function patch(i: number, field: "nome" | "qtd" | "preco", value: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? {
              ...it,
              [field]:
                field === "nome" ? value : Number(value.replace(",", ".")) || 0,
            }
          : it,
      ),
    );
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = items.reduce((a, i) => a + (Number(i.qtd) || 0) * (Number(i.preco) || 0), 0);

  async function confirm() {
    const clean = items.filter((i) => i.nome.trim());
    if (!clean.length) return;
    setSaving(true);
    try {
      const res = await confirmReceipt(
        clean,
        source === "qr" && chave ? { chave, emitente, total: totalNota } : undefined,
      );
      if (res && res.ok === false) {
        if (res.erro === "ja_importada") {
          showToast("Essa nota já foi importada");
          close();
        } else {
          setSaving(false);
          showToast("Não consegui salvar. Tente de novo.");
        }
        return;
      }
      showToast(`${clean.length} itens adicionados ao estoque`);
      close();
    } catch {
      setSaving(false);
      showToast("Não consegui salvar. Tente de novo.");
    }
  }

  return (
    <Modal open={open} onClose={close}>
      {phase === "capture" && (
        <>
          <div className="mb-1 text-[20px] font-extrabold">Registrar compra</div>
          <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
            Escaneie o QR code do cupom fiscal que a gente puxa os itens da nota.
            Sem QR? Dá pra fotografar a nota ou registrar por áudio no Telegram.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPhase("scanning")}
              className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
                <ReceiptIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">Escanear QR da nota</span>
                <span className="block text-[13px] leading-snug text-text-2">
                  Uma leitura só, itens e preços direto da SEFAZ.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-text-3" />
            </button>
            <label className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border border-border bg-card p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-card-2 text-text-2">
                <ReceiptIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">Foto da nota fiscal</span>
                <span className="block text-[13px] leading-snug text-text-2">
                  Sem QR à mão? A gente lê os itens pela foto.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-text-3" />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFile}
                className="hidden"
              />
            </label>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
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
        </>
      )}

      {phase === "scanning" && (
        <>
          <div className="mb-3 text-[18px] font-extrabold">Aponte para o QR code</div>
          <QrScanner onResult={onQr} onError={() => setPhase("error")} />
          <button
            onClick={() => setPhase("capture")}
            className="mt-3 h-10 w-full text-[13px] font-bold text-text-2"
          >
            Cancelar
          </button>
        </>
      )}

      {phase === "processing" && (
        <div className="py-2.5 text-center">
          <div className="relative mx-auto mb-5 h-[216px] w-[170px] overflow-hidden rounded-[14px] border border-border bg-card-2">
            <div className="absolute inset-x-0 top-0 h-[38%] animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-brand/45 to-transparent" />
          </div>
          <div className="mb-1 text-[18px] font-extrabold">Lendo sua nota fiscal...</div>
          <div className="text-[13px] text-text-2">
            {source === "qr" ? "Consultando a SEFAZ e identificando itens" : "Identificando itens e preços"}
          </div>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-pos-soft text-pos">
              <CheckIcon size={14} />
            </span>
            <div className="text-[20px] font-extrabold">
              {items.length} {items.length === 1 ? "item" : "itens"}
            </div>
          </div>
          {!confere && (
            <div className="mb-2 rounded-[10px] bg-warn-soft px-3 py-2 text-[12px] font-bold text-warn">
              O total dos itens não bateu com o total da nota. Confira antes de confirmar.
            </div>
          )}
          <div className="mb-3.5 text-[14px] text-text-2">
            Confira e ajuste antes de adicionar ao estoque. Toque para editar.
          </div>
          <div className="mb-4 max-h-[45vh] overflow-y-auto rounded-[16px] border border-border">
            {items.map((it, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2.5 ${
                  i > 0 ? "border-t border-border" : ""
                } ${it.duvida ? "border-l-[3px] border-l-warn" : ""}`}
              >
                <input
                  value={it.nome}
                  onChange={(e) => patch(i, "nome", e.target.value)}
                  className={`${inp} min-w-0 flex-1`}
                  aria-label="Nome"
                />
                <input
                  value={String(it.qtd)}
                  onChange={(e) => patch(i, "qtd", e.target.value)}
                  inputMode="decimal"
                  className={`${inp} w-12 text-center`}
                  aria-label="Quantidade"
                />
                <span className="text-text-3">×</span>
                <input
                  value={String(it.preco)}
                  onChange={(e) => patch(i, "preco", e.target.value)}
                  inputMode="decimal"
                  className={`${inp} w-[68px] text-right`}
                  aria-label="Preço"
                />
                <button
                  onClick={() => remove(i)}
                  aria-label="Remover"
                  className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-[18px] text-text-3 hover:bg-card-2"
                >
                  ×
                </button>
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
              disabled={saving || items.length === 0}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Confirmar e adicionar"}
            </button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="text-center">
          <div className="mb-1 text-[20px] font-extrabold">Não consegui ler a nota</div>
          <p className="mb-5 text-[14px] leading-relaxed text-text-2">
            A leitura falhou ou a imagem ficou difícil de entender. Tente escanear o
            QR de novo, fotografar a nota, ou mandar no {BOT_HANDLE} no Telegram.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPhase("capture")}
              className="h-[50px] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              Tentar de novo
            </button>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] border border-border bg-card text-[15px] font-bold"
            >
              <TelegramIcon size={18} className="text-[#2AABEE]" /> Mandar no Telegram
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
