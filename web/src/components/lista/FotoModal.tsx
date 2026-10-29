"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CameraIcon } from "@/components/ui/icons";
import { DestinoSwitch, type Destino } from "@/components/ui/Destino";
import { useStore } from "@/lib/store";
import { useLugar } from "@/lib/lugar";
import { enfileirarFoto, marcarLeitor, useFilaFotos } from "@/lib/filaFotos";

// Modo foto: o jeito principal de anotar (no lugar do Digitar). Tira uma foto atras da
// outra, ou escolhe varias da galeria de uma vez; cada uma vai para a fila da IA e a
// pessoa nao espera nada. Ao fechar, cada produto reconhecido vira um popup "e isso
// mesmo?" (FilaFotos). Digitar continua aqui dentro, para quem preferir.
export function FotoModal({
  onClose,
  onDigitar,
  destinoPadrao = "carrinho",
}: {
  onClose: () => void;
  onDigitar: () => void;
  destinoPadrao?: "estoque" | "carrinho";
}) {
  const { showToast } = useStore();
  const { noMercado } = useLugar();
  const [destino, setDestino] = useState<Destino>(noMercado ? "carrinho" : destinoPadrao);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [desta, setDesta] = useState(0); // fotos mandadas nesta abertura
  const { fila } = useFilaFotos();
  const trabalhando = fila.filter((x) => x.estado === "preparando" || x.estado === "esperando" || x.estado === "reconhecendo");
  const prontas = fila.filter((x) => x.estado === "pronto" || x.estado === "falhou").length;

  // Os popups de conferir esperam o modo foto fechar: a pessoa segue fotografando.
  useEffect(() => {
    marcarLeitor(true);
    return () => marcarLeitor(false);
  }, []);

  async function mandar(arquivos: FileList | null) {
    const fs = Array.from(arquivos ?? []).filter((f) => f.type.startsWith("image/"));
    if (!fs.length) return;
    setDesta((n) => n + fs.length);
    for (const f of fs) await enfileirarFoto(f, destino === "estoque" ? "estoque" : "carrinho");
    if (fs.length > 1) showToast(`📷 ${fs.length} fotos na fila`);
  }

  return (
    <Modal open onClose={onClose} maxWidth={440}>
      <div className="mb-3 pr-12">
        <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
          <CameraIcon size={18} />
          Modo foto
        </div>
        <div className="text-[20px] font-extrabold">Tire foto dos produtos</div>
        <p className="text-[13px] text-text-2">Um atrás do outro. A IA reconhece em fila e você confere no fim.</p>
      </div>

      <DestinoSwitch valor={destino} opcoes={["estoque", "carrinho"]} onChange={setDestino} />

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Tirar foto"
        onChange={(e) => {
          void mandar(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Fotos da galeria"
        onChange={(e) => {
          void mandar(e.target.files);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => camera.current?.click()}
        className="flex h-[88px] w-full flex-col items-center justify-center gap-1 rounded-[18px] bg-brand text-brand-ink"
      >
        <CameraIcon size={30} />
        <span className="text-[17px] font-extrabold">{desta ? "Tirar a próxima" : "Tirar foto"}</span>
      </button>
      <button
        onClick={() => galeria.current?.click()}
        className="mt-2 h-12 w-full rounded-[14px] border-2 border-border bg-card text-[15px] font-bold"
      >
        🖼 Escolher várias da galeria
      </button>

      {(desta > 0 || trabalhando.length > 0 || prontas > 0) && (
        <div className="mt-3 rounded-[14px] bg-card-2 p-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {fila.slice(-12).map((x) => (
              <div key={x.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local, da fila */}
                <img src={x.img} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-card text-[11px] shadow">
                  {x.estado === "pronto" ? "✓" : x.estado === "falhou" ? "?" : "…"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[13px] text-text-2">
            {trabalhando.length > 0 && <b>{trabalhando.length} reconhecendo</b>}
            {trabalhando.length > 0 && prontas > 0 && " · "}
            {prontas > 0 && `${prontas} ${prontas > 1 ? "prontas" : "pronta"}`}
            {". Você confere ao tocar em Pronto."}
          </div>
        </div>
      )}

      <div data-rodape className="mt-3 flex flex-col gap-1">
        <button onClick={onClose} className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold">
          {prontas || trabalhando.length ? "Pronto, conferir" : "Fechar"}
        </button>
        <button onClick={onDigitar} className="h-10 text-[13px] font-bold text-text-2 underline">
          ⌨️ Prefiro digitar
        </button>
      </div>
    </Modal>
  );
}
