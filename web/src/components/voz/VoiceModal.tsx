"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ItemGrid, type GridItem } from "@/components/receipt/ItemGrid";
import { MicIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { findByName, unitFor } from "@/lib/defaults";
import {
  ERRO_VOZ,
  escolherMime,
  extensaoDe,
  interpretarLocal,
  reconhecimentoDoNavegador,
  segundosFmt,
  type VozIntencao,
  type VozItem,
  type VozResposta,
} from "@/lib/voz";

// SpeechRecognition nao esta na lib de tipos do TS. So o que usamos daqui.
type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

// Falar dentro do app, sem passar pelo Telegram.
//
// O ciclo e sempre falar -> CONFERIR -> gravar. A tela de conferencia nao e
// enfeite: a falha numero 1 do bot em uso real foi classificacao errada de
// intencao (item ia para o estoque quando era da lista, e vice-versa), e la nao
// havia nada entre o modelo e o banco. Aqui o destino aparece em tres botoes e a
// pessoa troca com um toque antes de qualquer escrita.

const MAX_SEGUNDOS = 60;

const DESTINOS: { id: VozIntencao; label: string; desc: string }[] = [
  { id: "lista", label: "Lista", desc: "ainda vou comprar" },
  { id: "carrinho", label: "Carrinho", desc: "peguei agora no mercado" },
  { id: "estoque", label: "Estoque", desc: "já tenho em casa" },
];

type Fase = "gravar" | "gravando" | "enviando" | "conferir" | "salvando";

export function VoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addShopItem, addTripItem, addStock, showToast, stock } = useStore();

  const [fase, setFase] = useState<Fase>("gravar");
  const [segundos, setSegundos] = useState(0);
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<VozIntencao>("lista");
  const [itens, setItens] = useState<GridItem[]>([]);
  const [erro, setErro] = useState("");

  // Plano B ligado: o servidor de transcricao nao esta configurado, entao quem
  // ouve e o proprio navegador e quem entende a frase e o interpretador local.
  const [modoLocal, setModoLocal] = useState(false);
  const falaRef = useRef<Reconhecedor | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Para a gravacao e solta o microfone quando o popup fecha ou a tela sai do ar:
  // microfone aberto sem tela e a pior falha possivel de privacidade.
  useEffect(() => {
    if (open) return;
    falaRef.current?.stop();
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [open]);

  useEffect(() => {
    if (fase !== "gravando") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [fase]);

  // Corte automatico: passou de um minuto, para sozinho. O limite existe porque a
  // rota recusa audio grande, e descobrir isso depois de falar dois minutos e cruel.
  useEffect(() => {
    if (fase === "gravando" && segundos >= MAX_SEGUNDOS) parar();
  }, [fase, segundos]);

  function limpar() {
    setFase("gravar");
    setSegundos(0);
    setTexto("");
    setItens([]);
    setErro("");
    setDestino("lista");
  }

  function fechar() {
    falaRef.current?.stop();
    falaRef.current = null;
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
    limpar();
  }

  async function gravar() {
    setErro("");
    if (modoLocal) return escutarNoAparelho();
    const mime = escolherMime((m) =>
      typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(m) : false,
    );
    if (!mime) return setErro("Este navegador não grava áudio. Use o campo digitado.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        enviar(new Blob(chunksRef.current, { type: mime }), mime);
      };
      recRef.current = rec;
      rec.start();
      setSegundos(0);
      setFase("gravando");
    } catch {
      setErro("Não consegui abrir o microfone. Verifique a permissão do navegador.");
    }
  }

  function parar() {
    if (falaRef.current) {
      falaRef.current.stop();
      return;
    }
    if (recRef.current?.state === "recording") {
      recRef.current.stop();
      setFase("enviando");
    }
  }

  async function enviar(blob: Blob, mime: string) {
    setFase("enviando");
    try {
      const fd = new FormData();
      fd.append("audio", blob, `audio.${extensaoDe(mime)}`);
      const r = await fetch("/api/voz", { method: "POST", body: fd });
      const data = (await r.json().catch(() => null)) as VozResposta | null;
      if (!data?.ok) {
        // Sem chave no servidor: em vez de travar, passa a ouvir pelo aparelho.
        if (data?.erro === "voz_indisponivel" && reconhecimentoDoNavegador()) {
          setModoLocal(true);
          setErro("");
          setFase("gravar");
          escutarNoAparelho();
          return;
        }
        setErro(ERRO_VOZ[data?.erro ?? ""] ?? "Não deu para entender agora. Tente de novo.");
        setFase("gravar");
        return;
      }
      mostrarResultado(data.texto, data.intencao, data.itens);
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setFase("gravar");
    }
  }

  function mostrarResultado(frase: string, intencao: VozIntencao, lidos: VozItem[]) {
    setTexto(frase);
    setDestino(intencao);
    setItens(
      lidos.map((i) => ({
        nome: i.nome,
        qtd: i.qtd,
        preco: i.preco ?? 0,
        unidade: i.unidade,
      })),
    );
    setFase("conferir");
  }

  // Ouvir pelo proprio aparelho. Nao sobe audio nenhum: o navegador devolve o
  // texto e a interpretacao acontece aqui.
  function escutarNoAparelho() {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => Reconhecedor)
      | undefined;
    if (!SR) {
      setErro("Este aparelho não transcreve sozinho. Use Código de barras ou Digitar.");
      setFase("gravar");
      return;
    }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const frase = e.results[0][0].transcript ?? "";
      const r = interpretarLocal(frase);
      mostrarResultado(frase, r.intencao, r.itens);
    };
    rec.onerror = () => {
      setErro("Não consegui ouvir. Tente de novo, mais perto do microfone.");
      setFase("gravar");
    };
    rec.onend = () => setFase((f) => (f === "gravando" ? "gravar" : f));
    falaRef.current = rec;
    setSegundos(0);
    setErro("");
    setFase("gravando");
    rec.start();
  }

  function patch(i: number, campo: "nome" | "qtd" | "preco", valor: string) {
    setItens((l) =>
      l.map((it, idx) => {
        if (idx !== i) return it;
        if (campo === "nome") return { ...it, nome: valor, unidade: unitFor(valor) };
        const n = Number(valor.replace(",", ".")) || 0;
        return { ...it, [campo]: n };
      }),
    );
  }

  // Grava pelas RPCs _web que ja existem, uma por item. Nada de rota nova de
  // escrita: o caminho de dados continua o mesmo do que se digita na tela.
  // ponytail: uma chamada por item, em serie, como o BatchAddModal. O upgrade e a
  // RPC de lote (C1), que ainda nao existe.
  async function salvar() {
    const validos = itens.filter((i) => i.nome.trim());
    if (!validos.length) return showToast("Nenhum item para salvar.");
    setFase("salvando");
    let gravados = 0;
    let falha = "";
    for (const it of validos) {
      const nome = it.nome.trim();
      const qtd = Number(it.qtd) || 1;
      const preco = Number(it.preco) || 0;
      const r =
        destino === "lista"
          ? await addShopItem({
              name: nome,
              desired_quantity: qtd,
              unit: it.unidade,
              estimated_price: preco > 0 ? preco : null,
            })
          : destino === "carrinho"
            ? await addTripItem({
                name: nome,
                price: preco > 0 ? preco : null,
                qty: qtd,
                unit: it.unidade,
              })
            : await addStock({ name: nome, qty: qtd, unit: it.unidade });
      if (r.ok) gravados += 1;
      else falha = r.erro;
    }
    setFase("conferir");
    if (gravados === 0) return showToast(falha || "Não deu para salvar.");
    showToast(
      `${gravados} ${gravados === 1 ? "item" : "itens"} em ${
        destino === "lista" ? "Lista" : destino === "carrinho" ? "Carrinho" : "Estoque"
      }${falha ? ", e um deu erro" : ""}`,
    );
    fechar();
  }

  const gravando = fase === "gravando";
  const ocupado = fase === "enviando" || fase === "salvando";

  return (
    <Modal open={open} onClose={fechar} maxWidth={460}>
      <div className="mb-[18px]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
          <MicIcon size={18} />
          Falar aqui no app
        </div>
        <div className="text-[19px] font-extrabold">
          {fase === "conferir" || fase === "salvando"
            ? "Confere e salva"
            : "Diga o que aconteceu"}
        </div>
      </div>

      {fase !== "conferir" && fase !== "salvando" ? (
        <>
          <p className="mb-4 text-[13px] leading-relaxed text-text-2">
            Fale normal, como você contaria pra alguém: “comprei arroz vinte reais,
            dois pacotes, e café doze e noventa”. Você confere antes de salvar.
          </p>
          {modoLocal && (
            <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[12px] leading-snug text-text-2">
              Ouvindo pelo próprio aparelho, sem servidor. Funciona bem com frases
              curtas; confira os itens antes de salvar.
            </p>
          )}

          <div className="mb-4 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={gravando ? parar : gravar}
              disabled={ocupado}
              aria-label={gravando ? "Parar gravação" : "Gravar"}
              className={`grid h-[92px] w-[92px] place-items-center rounded-full text-brand-ink transition-transform disabled:opacity-50 ${
                gravando ? "scale-105 animate-pulse bg-neg" : "bg-brand"
              }`}
            >
              {gravando ? (
                <span className="h-7 w-7 rounded-[6px] bg-brand-ink" />
              ) : (
                <MicIcon size={38} />
              )}
            </button>
            <div className="text-[15px] font-bold">
              {fase === "enviando"
                ? "Ouvindo o que você falou…"
                : gravando
                  ? `${segundosFmt(segundos)} · toque para parar`
                  : "Toque para falar"}
            </div>
            {gravando && (
              <div className="text-[12px] text-text-3">
                Paro sozinho em {segundosFmt(MAX_SEGUNDOS)}
              </div>
            )}
          </div>

          {erro && (
            <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug text-text-2">
              {erro}
            </p>
          )}

          <button
            type="button"
            onClick={fechar}
            className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
          >
            Fechar
          </button>
        </>
      ) : (
        <>
          {/* O que foi ouvido, na letra. Sem isso, item errado vira misterio. */}
          <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-relaxed text-text-2">
            “{texto}”
          </p>

          <div className="mb-1.5 text-xs font-bold text-text-2">Vai para</div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {DESTINOS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDestino(d.id)}
                className={`rounded-[13px] border p-2.5 text-left ${
                  destino === d.id
                    ? "border-brand bg-brand/10"
                    : "border-border bg-card-2"
                }`}
              >
                <span className="block text-[14px] font-extrabold">{d.label}</span>
                <span className="block text-[11px] leading-snug text-text-3">
                  {d.desc}
                </span>
              </button>
            ))}
          </div>

          {itens.length > 0 ? (
            <ItemGrid
              items={itens}
              onPatch={patch}
              onRemove={(i) => setItens((l) => l.filter((_, idx) => idx !== i))}
              // Estoque nao e compra: sem preco ali, senao mexeria no gasto do mes.
              precos={destino !== "estoque"}
              avisoDe={(nome) => {
                const item = findByName(nome, stock);
                if (!item || item.current <= 0) return null;
                return `Você já tem ${item.current} ${item.unit} em casa.`;
              }}
            />
          ) : (
            <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug text-text-2">
              Ouvi a frase, mas não consegui separar em itens. Fale de novo ou use o
              caminho digitado.
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={limpar}
              disabled={ocupado}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold disabled:opacity-50"
            >
              Falar de novo
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={ocupado || itens.length === 0}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {fase === "salvando" ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
