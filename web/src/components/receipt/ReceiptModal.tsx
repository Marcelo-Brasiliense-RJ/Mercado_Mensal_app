"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TelegramIcon, CheckIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { BOT_HANDLE, BOT_URL } from "@/lib/config";
import { QrScanner } from "./QrScanner";
import { chaveDoQr, invokeNfce, ufDaChave } from "@/lib/nfce";
import { ItemGrid, type GridItem } from "./ItemGrid";

type Item = GridItem;
type Phase = "capture" | "scanning" | "fotos" | "processing" | "review" | "error";

// Cupom de compra do mes e comprido: ate 6 fotos, de cima para baixo.
const MAX_FOTOS = 6;

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

export function ReceiptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { confirmReceipt, showToast } = useStore();
  // QR da nota (qualquer estado): tenta a SEFAZ e, se ela barrar (a do RJ barra
  // servidor), guarda a chave e pede a foto. qr = o que o QR/link trouxe.
  const [qr, setQr] = useState<{ url: string; chave: string; uf: string } | null>(null);
  const [colando, setColando] = useState(false);
  const [link, setLink] = useState("");
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("capture");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  // Origem da leitura: "qr" (SEFAZ) usa dedup pela chave; "ocr" (foto) nao tem chave.
  const [source, setSource] = useState<"qr" | "ocr">("qr");
  const [chave, setChave] = useState("");
  const [emitente, setEmitente] = useState("");
  const [totalNota, setTotalNota] = useState(0);
  const [confere, setConfere] = useState(true);
  const [fotos, setFotos] = useState<string[]>([]);

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
    setFotos([]);
    setQr(null);
    setColando(false);
    setLink("");
  }

  // QR ou link da nota: tenta a SEFAZ (itens prontos, sem foto). A do RJ barra acesso de
  // servidor (bloqueio por IP, confirmado em 2026-11-11), entao la a resposta e a foto,
  // mas com a chave do QR guardada: nota repetida fica barrada com certeza.
  const onQr = useCallback(async (texto: string) => {
    const ch = chaveDoQr(texto);
    if (!ch) return;
    navigator.vibrate?.(40);
    setQr({ url: texto, chave: ch, uf: ufDaChave(ch) });
    setChave(ch);
    setSource("qr");
    setPhase("processing");
    const resp = await Promise.race([
      invokeNfce(texto).catch(() => ({ ok: false as const, erro: "falhou" })),
      new Promise<{ ok: false; erro: string }>((ok) => setTimeout(() => ok({ ok: false, erro: "demorou" }), 8000)),
    ]);
    if (!resp.ok || !resp.itens?.length) {
      setPhase("capture"); // volta para a tela da nota, agora pedindo a foto
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
    setChave(resp.chave || ch);
    setEmitente(resp.emitente);
    setTotalNota(resp.total_nota);
    setConfere(resp.total_confere);
    setPhase("review");
  }, []);
  const semCamera = useCallback(() => {}, []);

  // Foto da nota (qualquer estado): junta as fotos do cupom e manda tudo de uma vez
  // para /api/receipt-ocr (Gemini). Com a chave impressa no cupom, nota repetida e barrada.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!arquivos.length) return;
    const novas = await Promise.all(arquivos.map((f) => fileToDataUrl(f).catch(() => "")));
    setFotos((l) => [...l, ...novas.filter(Boolean)].slice(0, MAX_FOTOS));
    setPhase("fotos");
  }

  async function lerFotos() {
    if (!fotos.length) return;
    setSource("ocr");
    setPhase("processing");
    try {
      const r = await fetch("/api/receipt-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images: fotos }),
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
      setChave(qr?.chave || (typeof data.chave === "string" ? data.chave : ""));
      setEmitente(typeof data.emitente === "string" ? data.emitente : "");
      setTotalNota(typeof data.total === "number" ? data.total : 0);
      setConfere(data.confere !== false);
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

  async function confirm() {
    const clean = items.filter((i) => i.nome.trim());
    if (!clean.length) return;
    setSaving(true);
    try {
      const res = await confirmReceipt(
        clean,
        chave ? { chave, emitente, total: totalNota } : undefined,
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

  // Tela cheia da nota, como os apps de mercado: camera lendo o QR e, embaixo, foto,
  // galeria e colar link. Depois do QR de um estado que nao deixa ler, vira o aviso
  // "pela foto" com a chave ja guardada.
  if (open && phase === "capture") {
    const inputs = (
      <>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        <input ref={galRef} type="file" accept="image/*" multiple onChange={onFile} className="hidden" />
      </>
    );
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
        {!qr && <QrScanner cheia onResult={onQr} onError={semCamera} />}
        <div className="relative z-10 flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <button onClick={close} aria-label="Fechar" className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-[20px] backdrop-blur">
            ✕
          </button>
          <span className="rounded-full bg-white/15 px-4 py-2 text-[15px] font-bold backdrop-blur">Nota fiscal</span>
          <span className="w-12" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 text-center">
          {qr ? (
            <>
              <span className="mb-4 rounded-full bg-brand px-3.5 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em] text-brand-ink">
                Pela foto
              </span>
              <p className="text-[21px] font-bold leading-snug">
                Nota{qr.uf ? ` do ${qr.uf}` : ""} reconhecida ✓<br />O site do governo não deixa ler pelo QR. Tire uma foto que eu leio.
              </p>
              <p className="mt-3 text-[14px] text-white/60">De perto, com boa luz. Cupom comprido: em partes, até 6 fotos.</p>
            </>
          ) : (
            <p className="mt-[78vw] text-[17px] font-bold drop-shadow sm:mt-80">
              Aponte para o QR code da nota
              <span className="block text-[14px] font-normal text-white/70">Ele fica no pé do cupom</span>
            </p>
          )}
        </div>

        <div className="relative z-10 mx-3 mb-[max(14px,env(safe-area-inset-bottom))] rounded-[28px] bg-[#1c1c1e] p-2.5">
          {colando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (chaveDoQr(link)) void onQr(link);
                else showToast("Link sem a chave da nota.");
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Cole o link da nota"
                className="h-14 min-w-0 flex-1 rounded-full bg-white/10 px-5 text-[16px] text-white placeholder:text-white/40"
              />
              <button type="submit" className="h-14 shrink-0 rounded-full bg-brand px-5 font-extrabold text-brand-ink">Ler</button>
            </form>
          ) : (
            <button onClick={() => camRef.current?.click()} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-extrabold text-brand-ink">
              📷 Tirar foto da nota
            </button>
          )}
          <div className="mt-1 grid grid-cols-2">
            <button onClick={() => galRef.current?.click()} className="h-12 text-[15px] font-bold text-white/85">🖼 Da galeria</button>
            <button onClick={() => setColando((c) => !c)} className="h-12 text-[15px] font-bold text-white/85">
              {colando ? "📷 Foto" : "🔗 Colar link"}
            </button>
          </div>
        </div>
        {inputs}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={close}>
      {phase === "fotos" && (
        <>
          <div className="mb-1 text-[20px] font-extrabold">
            {fotos.length} {fotos.length === 1 ? "foto" : "fotos"} do cupom
          </div>
          <p className="mb-3 text-[13px] leading-snug text-text-2">
            Cupom comprido? Tire a parte de baixo também (pode repetir um pedaço, eu não conto duas vezes).
          </p>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {fotos.map((f, i) => (
              <div key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt={`Parte ${i + 1} do cupom`} className="h-28 w-20 rounded-lg border border-border object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                <button
                  onClick={() => setFotos((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Tirar foto ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-card text-[13px] font-bold shadow"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div data-rodape className="flex gap-3">
            {fotos.length < MAX_FOTOS && (
              <label className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[14px] border border-border bg-card text-[15px] font-bold">
                + Mais uma parte
                <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
              </label>
            )}
            <button
              onClick={lerFotos}
              disabled={!fotos.length}
              className="h-[50px] flex-[1.4] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              Ler nota
            </button>
          </div>
        </>
      )}

      {phase === "processing" && (
        <div className="py-2.5 text-center">
          <div className="relative mx-auto mb-5 h-[216px] w-[170px] overflow-hidden rounded-[14px] border border-border bg-card-2">
            <div className="absolute inset-x-0 top-0 h-[38%] animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-brand/45 to-transparent" />
          </div>
          <div className="mb-1 text-[18px] font-extrabold">Lendo sua nota fiscal...</div>
          <div className="text-[13px] text-text-2">
            {source === "qr"
              ? "Consultando a SEFAZ e identificando itens"
              : `Lendo item por item${fotos.length > 1 ? ` nas ${fotos.length} fotos` : ""}. Cupom grande leva até 1 minuto.`}
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
          <ItemGrid items={items} onPatch={patch} onRemove={remove} />
          <div data-rodape className="flex gap-3">
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
