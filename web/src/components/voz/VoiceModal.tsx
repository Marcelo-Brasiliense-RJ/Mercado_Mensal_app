"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ItemGrid, type GridItem } from "@/components/receipt/ItemGrid";
import { MicIcon } from "@/components/ui/icons";
import { DestinoSwitch, nomeDestino } from "@/components/ui/Destino";
import { useLugar } from "@/lib/lugar";
import { useStore } from "@/lib/store";
import { findByName, unitFor } from "@/lib/defaults";
import { createClient } from "@/lib/supabase/client";
import type { ShopItem } from "@/lib/types";
import {
  achaNaLista,
  ERRO_VOZ,
  ehApple,
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
  abort: () => void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
};

// Silencio que encerra a fala sozinho, depois que a pessoa ja falou algo. Antes a
// gravacao so parava no toque, e quem nao tocava achava que o app tinha travado.
const SILENCIO_MS = 1800;
// Ninguem falou nada: desiste, em vez de ficar ouvindo um minuto.
const SEM_FALA_MS = 8000;

// Falar dentro do app, sem passar pelo Telegram.
//
// O ciclo e sempre falar -> CONFERIR -> gravar. A tela de conferencia nao e
// enfeite: a falha numero 1 do bot em uso real foi classificacao errada de
// intencao (item ia para o estoque quando era da lista, e vice-versa), e la nao
// havia nada entre o modelo e o banco. Aqui o destino aparece em tres botoes e a
// pessoa troca com um toque antes de qualquer escrita.

const MAX_SEGUNDOS = 60;

// Destino pela tela de onde a pessoa abriu. "Preciso de / comprar / falta" vai
// para a lista EM QUALQUER TELA (pedido do dono). Fora isso: no Estoque vai para o
// estoque ("comprei arroz" la e guardar a compra), no Mercado vira carrinho, no
// Montar lista tudo e lista, e no microfone do topo ("auto") vale o que a frase diz.
function destinoDaTela(tela: Tela, ouvido: VozIntencao): VozIntencao {
  if (tela === "lista" || ouvido === "lista") return "lista";
  if (tela === "estoque") return "estoque";
  if (tela === "auto") return ouvido;
  return "carrinho";
}

type Tela = "estoque" | "mercado" | "lista" | "auto";
type Fase = "gravar" | "gravando" | "enviando" | "conferir" | "salvando";

export function VoiceModal({
  open,
  onClose,
  tela = "mercado",
}: {
  open: boolean;
  onClose: () => void;
  tela?: Tela;
}) {
  const { addShopItem, addTripItem, addStock, removeItems, showToast, stock, shopping } =
    useStore();
  // Dentro de um mercado conhecido (GPS), vale como se estivesse na Lista: carrinho.
  // Montar lista e excecao: la a pessoa diz o que falta, esteja onde estiver.
  const { noMercado } = useLugar();
  const telaAgora = noMercado && tela !== "lista" ? "mercado" : tela;
  const inicial: VozIntencao =
    tela === "mercado" ? "carrinho" : tela === "auto" ? "lista" : tela;

  const [fase, setFase] = useState<Fase>("gravar");
  const [segundos, setSegundos] = useState(0);
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<VozIntencao>(inicial);
  const [jaForam, setJaForam] = useState(0); // entraram direto na lista (modo Montar lista)
  const [itens, setItens] = useState<GridItem[]>([]);
  const [erro, setErro] = useState("");

  // Plano B ligado: o servidor de transcricao nao esta configurado, entao quem
  // ouve e o proprio navegador e quem entende a frase e o interpretador local.
  const [modoLocal, setModoLocal] = useState(false);
  const falaRef = useRef<Reconhecedor | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fraseRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [nivel, setNivel] = useState(0); // 0..1, a barra que prova que o microfone capta
  const [parcial, setParcial] = useState(""); // o que o aparelho ja ouviu, ao vivo

  // Sabe ANTES do primeiro toque se o servidor de voz existe. Ligar o reconhecimento
  // do aparelho depois de uma resposta do servidor (fora do toque) e bloqueado calado
  // pelo iPhone: era o "fica gravando e nao para nem reconhece nada".
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    fetch("/api/voz")
      .then((r) => r.json())
      .then((d: { disponivel?: boolean }) => {
        if (vivo && d?.disponivel === false && reconhecimentoDoNavegador()) setModoLocal(true);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [open]);

  // Para a gravacao e solta o microfone quando o popup fecha ou a tela sai do ar:
  // microfone aberto sem tela e a pior falha possivel de privacidade.
  useEffect(() => {
    if (open) return;
    falaRef.current?.abort();
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
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
    setDestino(inicial);
    setJaForam(0);
    setNivel(0);
    setParcial("");
  }

  function fechar() {
    falaRef.current?.abort();
    falaRef.current = null;
    if (recRef.current?.state === "recording") {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    onClose();
    limpar();
  }

  async function gravar() {
    setErro("");
    if (modoLocal) return escutarNoAparelho();
    const mime = escolherMime(
      (m) => (typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(m) : false),
      ehApple(navigator.userAgent),
    );
    if (!mime) return setErro("Este navegador não grava áudio. Use o campo digitado.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setNivel(0);
        const blob = new Blob(chunksRef.current, { type: mime });
        // Gravacao vazia nao vai para o servidor: so viraria "nao entendi" sem motivo.
        if (blob.size < 1000) {
          setErro("O microfone não captou som. Confira a permissão do microfone e fale de novo.");
          setFase("gravar");
          return;
        }
        enviar(blob, mime);
      };
      recRef.current = rec;
      // Pedaco a cada segundo: sem isso o iPhone as vezes entrega o arquivo vazio no stop.
      rec.start(1000);
      setSegundos(0);
      setFase("gravando");
      vigiarSilencio(stream, rec);
    } catch {
      setErro("Não consegui abrir o microfone. Verifique a permissão do navegador.");
    }
  }

  // Mede o volume do microfone: mostra a barra e para sozinho quando a pessoa
  // termina de falar (ou desiste se ninguem falou).
  function vigiarSilencio(stream: MediaStream, rec: MediaRecorder) {
    try {
      const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctx = W.AudioContext ?? W.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const inicio = Date.now();
      let falou = false;
      let ultimaVoz = Date.now();
      const passo = () => {
        if (rec.state !== "recording" || audioCtxRef.current !== ctx) return;
        an.getByteTimeDomainData(buf);
        let soma = 0;
        for (const v of buf) soma += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(soma / buf.length);
        setNivel(Math.min(1, rms * 6));
        const agora = Date.now();
        if (rms > 0.03) {
          falou = true;
          ultimaVoz = agora;
        }
        if (falou && agora - ultimaVoz > SILENCIO_MS) return parar();
        if (!falou && agora - inicio > SEM_FALA_MS) return parar();
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    } catch {
      /* sem medidor: continua gravando, para no toque ou no minuto */
    }
  }

  function parar() {
    if (falaRef.current) {
      const rec = falaRef.current;
      rec.stop();
      // Alguns celulares nao disparam o fim depois do stop: nao deixa a tela presa.
      setTimeout(() => {
        if (falaRef.current !== rec) return;
        rec.abort();
        terminarFala();
      }, 1500);
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
        // Sem chave ou Groq fora do ar: em vez de travar, passa a ouvir pelo aparelho.
        // Nao liga o reconhecimento sozinho aqui: fora do toque o iPhone bloqueia.
        if ((data?.erro === "voz_indisponivel" || data?.erro === "transcricao_falhou") && reconhecimentoDoNavegador()) {
          setModoLocal(true);
          setErro("O servidor de voz falhou. Toque no microfone de novo: agora ouço pelo próprio celular.");
          setFase("gravar");
          return;
        }
        setErro(ERRO_VOZ[data?.erro ?? ""] ?? "Não deu para entender agora. Tente de novo.");
        setFase("gravar");
        return;
      }
      await mostrarResultado(data.texto, data.intencao, data.itens);
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setFase("gravar");
    }
  }

  // "Nao quero cafe": tira da lista o que estava pendente. Devolve o aviso.
  async function tirarDaLista(nomes: string[]): Promise<string> {
    const ids: string[] = [];
    const tirados: string[] = [];
    const nemEstava: string[] = [];
    for (const n of nomes) {
      const achados = achaNaLista(n, shopping);
      if (achados.length) {
        ids.push(...achados.map((a) => a.id));
        tirados.push(n);
      } else nemEstava.push(n);
    }
    const partes: string[] = [];
    if (ids.length) {
      const r = await removeItems([...new Set(ids)]);
      if (r.ok) partes.push(`Tirei: ${tirados.join(", ")}`);
      else partes.push(`Não consegui tirar ${tirados.join(", ")}`);
    }
    if (nemEstava.length) partes.push(`Não estava na lista: ${nemEstava.join(", ")}`);
    return partes.join(" · ");
  }

  async function mostrarResultado(frase: string, intencao: VozIntencao, lidosTodos: VozItem[]) {
    setTexto(frase);
    setDestino(destinoDaTela(telaAgora, intencao));

    const tirar = lidosTodos.filter((i) => i.remover).map((i) => i.nome.trim()).filter(Boolean);
    const lidos = lidosTodos.filter((i) => !i.remover);
    let avisoTirar = "";
    if (tirar.length) {
      setFase("salvando");
      avisoTirar = await tirarDaLista(tirar);
      if (!lidos.length) {
        showToast(avisoTirar);
        return fechar();
      }
    }

    const linhas: GridItem[] = lidos.map((i) => ({
      nome: i.nome,
      qtd: i.qtd,
      // Preco nao falado nasce com o ultimo que a casa pagou (regra 2 da secao
      // 0.1 do tarefas.md: todo campo nasce preenchido). Falar "comprar
      // absorvente" vinha com R$ 0,00 e obrigava a digitar o preco no corredor.
      preco: i.preco ?? findByName(i.nome, stock)?.priceLast ?? 0,
      unidade: i.unidade,
      duvida: i.duvida,
    }));

    // Lista: o que foi entendido entra direto (aviso com Desfazer); so o que ficou
    // em duvida volta para a pessoa conferir. Vale tambem ouvindo pelo aparelho:
    // o dono quer falar e ver entrar, sem tela no meio.
    if (tela === "lista" || intencao === "lista") {
      const certos = linhas.filter((i) => !i.duvida && i.nome.trim().length >= 2);
      const duvidas = linhas.filter((i) => !certos.includes(i));
      const falharam = certos.length ? await porDireto(certos, avisoTirar) : [];
      const resto = [...duvidas, ...falharam].map((i) => ({ ...i, duvida: true }));
      if (!resto.length && certos.length) return fechar();
      setJaForam(certos.length - falharam.length);
      setItens(resto);
      setFase("conferir");
      return;
    }
    if (avisoTirar) showToast(avisoTirar);
    setItens(linhas);
    setFase("conferir");
  }

  // Ids pendentes da lista, para saber depois quais linhas a voz criou (a RPC de
  // incluir nao devolve o id). null = nao deu para ler, e ai nao ha Desfazer: sem o
  // retrato do antes, desfazer tiraria da lista o que ja estava la.
  async function pendentes(): Promise<Set<string> | null> {
    const { data, error } = await createClient().rpc("mercado_list_web");
    if (error || !Array.isArray(data)) return null;
    return new Set((data as ShopItem[]).filter((i) => i.status === "pending").map((i) => i.id));
  }

  // Poe na lista sem perguntar. Devolve os que o banco recusou, para irem a conferencia.
  // O Desfazer do aviso tira exatamente as linhas criadas agora; o desfazer do banco
  // (0023) nao serve aqui porque incluir pelo app nao grava evento.
  async function porDireto(certos: GridItem[], extra = ""): Promise<GridItem[]> {
    setFase("salvando");
    const antes = await pendentes();
    const foram: string[] = [];
    const falharam: GridItem[] = [];
    for (const it of certos) {
      const r = await addShopItem({
        name: it.nome.trim(),
        desired_quantity: Number(it.qtd) || 1,
        unit: it.unidade,
        estimated_price: it.preco > 0 ? it.preco : null,
      });
      if (r.ok) foram.push(it.nome.trim());
      else falharam.push(it);
    }
    if (!foram.length) {
      if (extra) showToast(extra);
      return falharam;
    }
    const depois = antes ? await pendentes() : null;
    const novos = antes && depois ? [...depois].filter((id) => !antes.has(id)) : [];
    const nomes =
      foram.length > 3 ? `${foram.slice(0, 3).join(", ")} e mais ${foram.length - 3}` : foram.join(", ");
    showToast(
      `Na lista: ${nomes}${extra ? ` · ${extra}` : ""}`,
      novos.length
        ? {
            desfazer: async () => {
              const r = await removeItems(novos);
              showToast(r.ok ? "Desfeito: saiu da lista" : r.erro);
            },
          }
        : undefined,
    );
    return falharam;
  }

  // Ouvir pelo proprio aparelho. Nao sobe audio nenhum: o navegador devolve o
  // texto e a interpretacao acontece aqui.
  function escutarNoAparelho() {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => Reconhecedor)
      | undefined;
    if (!SR) {
      setErro("Este aparelho não transcreve sozinho. Use Código de barras ou Foto.");
      setFase("gravar");
      return;
    }
    const rec = new SR();
    rec.lang = "pt-BR";
    // Parcial ligado: o iPhone muitas vezes so entrega o texto parcial antes de
    // encerrar, e sem isso a frase se perdia ("nao reconhece nada").
    rec.interimResults = true;
    rec.continuous = false;
    fraseRef.current = "";
    setParcial("");
    let comecou = false;
    rec.onstart = () => {
      comecou = true;
    };
    rec.onresult = (e) => {
      let t = "";
      for (let k = 0; k < e.results.length; k++) t += e.results[k][0]?.transcript ?? "";
      fraseRef.current = t.trim();
      setParcial(fraseRef.current);
    };
    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        setErro("O celular bloqueou o reconhecimento de voz. Libere Microfone e Reconhecimento de Fala para o navegador nos Ajustes.");
      } else if (e?.error === "no-speech") {
        setErro("Não ouvi nada. Toque e fale logo em seguida.");
      } else if (e?.error !== "aborted") {
        setErro("Não consegui ouvir. Tente de novo, mais perto do microfone.");
      }
    };
    rec.onend = () => {
      if (falaRef.current === rec) terminarFala();
    };
    falaRef.current = rec;
    setSegundos(0);
    setErro("");
    setFase("gravando");
    try {
      rec.start();
    } catch {
      falaRef.current = null;
      setErro("Não consegui ligar o reconhecimento de voz. Toque de novo.");
      setFase("gravar");
      return;
    }
    // Nunca comecou de verdade: solta a tela em vez de ficar "gravando" pra sempre.
    setTimeout(() => {
      if (falaRef.current === rec && !comecou) {
        rec.abort();
        falaRef.current = null;
        setErro("O reconhecimento de voz do celular não respondeu. Toque de novo.");
        setFase("gravar");
      }
    }, 4000);
  }

  // Fim da fala pelo aparelho (sozinho, pelo toque ou pelo vigia): usa o que ouviu.
  function terminarFala() {
    falaRef.current = null;
    const frase = fraseRef.current;
    fraseRef.current = "";
    if (!frase) {
      setErro((e) => e || "Não ouvi nada. Toque e fale logo em seguida.");
      setFase("gravar");
      return;
    }
    const r = interpretarLocal(frase);
    void mostrarResultado(frase, r.intencao, r.itens);
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
      `${gravados} ${gravados === 1 ? "item" : "itens"} em ${nomeDestino(destino)}${falha ? ", e um deu erro" : ""}`,
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
          {fase === "conferir" && jaForam > 0
            ? "Fiquei em dúvida nestes"
            : fase === "conferir" || fase === "salvando"
              ? "Confere e salva"
              : "Diga o que aconteceu"}
        </div>
      </div>

      {fase !== "conferir" && fase !== "salvando" ? (
        <>
          <p className="mb-4 text-[13px] leading-relaxed text-text-2">
            {noMercado && tela === "estoque" && "📍 Você está num mercado: vai para o carrinho. "}
            {tela === "lista" || tela === "auto"
              ? "Fale o que quer e o que não quer: “quero arroz, feijão e 5 detergentes, mas não quero mais café”. Entra e sai da lista direto; no que eu ficar em dúvida, eu pergunto."
              : telaAgora === "estoque"
              ? "Fale o que tem em casa: “três leites, dois arroz e um café”. Vai para o estoque; você confere antes de salvar."
              : "Fale normal, como você contaria pra alguém: “comprei arroz vinte reais, dois pacotes, e café doze e noventa”. Você confere antes de salvar."}
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
            {gravando && !modoLocal && (
              <div
                className="h-2 w-40 overflow-hidden rounded-full bg-card-2"
                aria-label="Volume do microfone"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-75"
                  style={{ width: `${Math.round(nivel * 100)}%` }}
                />
              </div>
            )}
            {gravando && parcial && (
              <p className="text-center text-[14px] text-text-2">“{parcial}”</p>
            )}
            {gravando && (
              <div className="text-[12px] text-text-3">
                Paro sozinho quando você terminar de falar
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
          {jaForam > 0 && (
            <p className="mb-4 text-[13px] font-bold text-pos">
              ✓ {jaForam} {jaForam === 1 ? "item já entrou" : "itens já entraram"} na lista. Corrija
              o nome dos de baixo e salve, ou tire o que não for.
            </p>
          )}

          <DestinoSwitch
            valor={destino}
            opcoes={["estoque", "carrinho", "lista"]}
            onChange={(d) => setDestino(d)}
          />

          {itens.length > 0 ? (
            <ItemGrid
              items={itens}
              onPatch={patch}
              onRemove={(i) => setItens((l) => l.filter((_, idx) => idx !== i))}
              // Estoque nao e compra: sem preco ali, senao mexeria no gasto do mes.
              precos={destino !== "estoque"}
              fotos
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

          <div data-rodape className="flex gap-3">
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
