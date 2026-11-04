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
import { marcarNaoComprar, marcarRuim } from "@/components/ofertas/useEvitar";
import { termoEvitar } from "@/lib/ofertas";
import { reduzir } from "@/lib/reconhecer";
import { Gravador } from "./Gravador";
import { PrateleiraModal } from "@/components/estoque/PrateleiraModal";
import { enfileirarFoto } from "@/lib/filaFotos";
import { acertarEstoque as acertarNoEstoque } from "@/lib/acertarEstoque";
import type { ShopItem } from "@/lib/types";
import {
  achaNaLista,
  ERRO_VOZ,
  ehApple,
  escolherMime,
  extensaoDe,
  interpretarLocal,
  motivoNaoComprar,
  reconhecimentoDoNavegador,
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
// 3 s: na despensa a pessoa pausa olhando o armario no meio da fala.
const SILENCIO_MS = 3000;
// Ninguem falou nada: desiste, em vez de ficar ouvindo um minuto.
const SEM_FALA_MS = 8000;

// Falar dentro do app, sem passar pelo Telegram.
//
// O ciclo e sempre falar -> CONFERIR -> gravar. A tela de conferencia nao e
// enfeite: a falha numero 1 do bot em uso real foi classificacao errada de
// intencao (item ia para o estoque quando era da lista, e vice-versa), e la nao
// havia nada entre o modelo e o banco. Aqui o destino aparece em tres botoes e a
// pessoa troca com um toque antes de qualquer escrita.

const MAX_SEGUNDOS = 180; // despensa: "tenho isso, tenho aquilo, nao compra aquilo outro"

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
type Fase = "gravar" | "gravando" | "enviando" | "conferir" | "salvando" | "motivo" | "marca";

// "Nao comprar X": antes de guardar, pergunta o motivo, um item por vez. O resto da
// frase (o que era para comprar) espera e segue depois das respostas.
type Pergunta = {
  fila: string[];
  i: number;
  frase: string;
  intencao: VozIntencao;
  lidos: VozItem[];
  aviso: string; // "Tirei: leite" (saiu da lista)
  feitos: string[]; // "📦 leite", "👎 café Pilão"
  // o que ja foi gravado antes da pergunta ("🏠 Estoque: arroz 5 kg"): adicao e uma
  // coisa, "nao comprar" e outra; a pessoa ve a primeira pronta e so entao responde.
  gravado: string;
};
type Marca = { marca: string; foto: string | null };

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
  const [historico, setHistorico] = useState<number[]>([]); // volume recente, para as barras
  const [parcial, setParcial] = useState(""); // o que o aparelho ja ouviu, ao vivo
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [marcas, setMarcas] = useState<Marca[] | null>(null); // null = buscando
  const [outraMarca, setOutraMarca] = useState("");
  const [escrito, setEscrito] = useState(""); // caminho digitado, mesmo entendimento da voz
  const [escrevendo, setEscrevendo] = useState(false);
  const [prateleira, setPrateleira] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  // Tela que vai junto para a IA desempatar ("arroz" sozinho no Estoque e estoque).
  const telaIA = telaAgora === "estoque" ? "estoque" : telaAgora === "lista" ? "lista" : telaAgora === "auto" ? "auto" : "mercado";

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
    setHistorico([]);
    setParcial("");
    setPergunta(null);
    setMarcas(null);
    setOutraMarca("");
    setEscrito("");
    setEscrevendo(false);
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
      // 48 kbps de voz: 3 minutos cabem com folga no limite de envio do servidor.
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
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
      let ultimaBarra = 0;
      const passo = () => {
        if (rec.state !== "recording" || audioCtxRef.current !== ctx) return;
        an.getByteTimeDomainData(buf);
        let soma = 0;
        for (const v of buf) soma += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(soma / buf.length);
        const v = Math.min(1, rms * 6);
        const agora = Date.now();
        setNivel(v);
        // ~20 quadros por segundo nas barras: suave sem pesar no celular
        if (agora - ultimaBarra > 50) {
          ultimaBarra = agora;
          setHistorico((h) => [...h.slice(-40), v]);
        }
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
      fd.append("tela", telaIA);
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

  // "Nao comprar leite": tira da lista o que estava pendente. Guardar em "Nao
  // comprar" vem depois, quando a pessoa disser o motivo (excesso ou ruim).
  async function tirarDaLista(nomes: string[]): Promise<string> {
    const ids: string[] = [];
    const tirados: string[] = [];
    for (const n of nomes) {
      const achados = achaNaLista(n, shopping);
      if (achados.length) {
        ids.push(...achados.map((a) => a.id));
        tirados.push(n);
      }
    }
    if (!ids.length) return "";
    const r = await removeItems([...new Set(ids)]);
    return r.ok ? `Tirei da lista: ${tirados.join(", ")}` : `Não consegui tirar ${tirados.join(", ")}`;
  }

  // Resposta de uma pergunta: guarda e passa para o proximo item, ou segue a frase.
  async function responder(feito: string | null) {
    const p = pergunta;
    if (!p) return;
    const feitos = feito ? [...p.feitos, feito] : p.feitos;
    setOutraMarca("");
    setMarcas(null);
    if (p.i + 1 < p.fila.length) {
      setPergunta({ ...p, i: p.i + 1, feitos });
      setFase("motivo");
      return;
    }
    setPergunta(null);
    const aviso = [p.aviso, feitos.length ? `Não comprar: ${feitos.join(", ")}` : ""].filter(Boolean).join(" · ");
    if (!p.lidos.length) {
      if (aviso) showToast(aviso);
      return fechar();
    }
    await processar(p.frase, p.intencao, p.lidos, aviso);
  }

  async function escolherMotivo(tipo: "excesso" | "ruim") {
    const p = pergunta;
    if (!p) return;
    const nome = p.fila[p.i];
    // Ruim sem marca falada ("leite"): pergunta a marca, que e o que de fato e ruim.
    if (tipo === "ruim" && nome.trim().split(/\s+/).length < 2) {
      setFase("marca");
      setMarcas(null);
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(nome)}`);
        const d = (await r.json()) as { itens?: { marca: string; foto: string | null }[] };
        const vistas = new Map<string, Marca>();
        for (const it of d.itens ?? []) {
          const m = (it.marca ?? "").trim();
          if (m && !vistas.has(m.toLowerCase())) vistas.set(m.toLowerCase(), { marca: m, foto: it.foto });
        }
        setMarcas([...vistas.values()]);
      } catch {
        setMarcas([]);
      }
      return;
    }
    setFase("salvando");
    const ok = await marcarNaoComprar(nome, tipo);
    if (!ok) showToast(`Não deu para guardar ${nome}.`);
    await responder(ok ? `${tipo === "ruim" ? "👎" : "📦"} ${nome}` : null);
  }

  async function escolherMarca(marca: string | null, foto: string | null = null) {
    const p = pergunta;
    if (!p) return;
    const produto = p.fila[p.i].trim();
    const m = (marca ?? "").trim();
    const base = produto.charAt(0).toUpperCase() + produto.slice(1);
    const nome = m ? `${base} ${m}` : base;
    setFase("salvando");
    const ok = await marcarRuim({ termo: termoEvitar(produto, m), nome, motivo: null, foto });
    if (!ok) showToast(`Não deu para guardar ${nome}.`);
    await responder(ok ? `👎 ${nome}` : null);
  }

  async function mostrarResultado(frase: string, intencao: VozIntencao, lidosTodos: VozItem[]) {
    setTexto(frase);
    setDestino(destinoDaTela(telaAgora, intencao));

    const tirarItens = lidosTodos.filter((i) => i.remover && i.nome.trim());
    let lidos = lidosTodos.filter((i) => !i.remover);
    if (tirarItens.length) {
      setFase("salvando");
      // 1) As adicoes primeiro, ja gravadas: "tenho 5 kg de arroz" entra no estoque e
      // "preciso de cafe" na lista, antes de qualquer pergunta sobre o que nao comprar.
      const gravados: string[] = [];
      const est = lidos.filter((i) => i.destino === "estoque");
      if (est.length) gravados.push(await acertarEstoque(est));
      const naLista = lidos.filter((i) => i.destino === "lista" && !i.duvida && i.nome.trim().length >= 2);
      const foram: string[] = [];
      for (const it of naLista) {
        const r = await addShopItem({
          name: it.nome.trim(),
          desired_quantity: Number(it.qtd) || 1,
          unit: it.unidade,
          estimated_price: it.preco ?? findByName(it.nome, stock)?.priceLast ?? null,
        });
        if (r.ok) foram.push(it.nome.trim());
      }
      if (foram.length) gravados.push(`📝 Lista: ${foram.join(", ")}`);
      lidos = lidos.filter((i) => !est.includes(i) && !(naLista.includes(i) && foram.includes(i.nome.trim())));
      const gravado = gravados.filter(Boolean).join(" · ");
      // 2) Depois, o que nao comprar.
      const aviso = await tirarDaLista(tirarItens.map((i) => i.nome.trim()));
      // Excesso ja dito na fala ("ja tem muito fermento") guarda sem perguntar.
      const feitos: string[] = [];
      for (const it of tirarItens.filter((i) => i.motivo === "excesso")) {
        if (await marcarNaoComprar(it.nome.trim(), "excesso")) feitos.push(`📦 ${it.nome.trim()}`);
      }
      const fila = tirarItens.filter((i) => i.motivo !== "excesso").map((i) => i.nome.trim());
      if (fila.length) {
        setPergunta({ fila, i: 0, frase, intencao, lidos, aviso: [gravado, aviso].filter(Boolean).join(" · "), feitos, gravado });
        setFase("motivo");
        return;
      }
      const tudo = [gravado, aviso, feitos.length ? `Não comprar: ${feitos.join(", ")}` : ""].filter(Boolean).join(" · ");
      return processar(frase, intencao, lidos, tudo);
    }
    await processar(frase, intencao, lidos, "");
  }

  // Item por item, pelo destino que a fala deu: "tenho X" acerta o estoque na hora;
  // o resto (lista, carrinho) segue o caminho de sempre.
  async function processar(frase: string, intencao: VozIntencao, lidos: VozItem[], aviso: string) {
    const avisos = [aviso];
    const est = lidos.filter((i) => i.destino === "estoque" && tela !== "estoque");
    if (est.length) avisos.push(await acertarEstoque(est));
    // Na tela de Estoque o que nao veio marcado continua indo para o estoque, com conferencia.
    const resto = lidos.filter((i) => !est.includes(i));
    const juntos = avisos.filter(Boolean).join(" · ");
    if (!resto.length) {
      if (juntos) showToast(juntos);
      return fechar();
    }
    const destinos = new Set(resto.map((i) => i.destino).filter(Boolean));
    const intencaoResto: VozIntencao = destinos.size === 1 ? [...destinos][0]! : intencao;
    await seguir(frase, intencaoResto, resto, juntos);
  }

  // "Eu tenho 5 kg de arroz": o estoque passa a ser 5 (nao soma 5). A RPC soma,
  // entao manda a diferenca para o que ja estava.
  async function acertarEstoque(itensEst: VozItem[]): Promise<string> {
    setFase("salvando");
    const { ok, falhou } = await acertarNoEstoque(itensEst, stock, addStock);
    return [ok.length ? `🏠 Estoque: ${ok.join(", ")}` : "", falhou.length ? `não gravei ${falhou.join(", ")}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  // O que era para comprar/registrar: lista direto, ou conferencia.
  async function seguir(frase: string, intencao: VozIntencao, lidos: VozItem[], avisoTirar: string) {
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
    // Continuo: fala longa com pausas nao corta no primeiro respiro. Quem encerra e
    // o vigia de silencio (onresult) ou o toque.
    rec.continuous = true;
    fraseRef.current = "";
    setParcial("");
    let comecou = false;
    rec.onstart = () => {
      comecou = true;
    };
    let calado: ReturnType<typeof setTimeout> | null = null;
    rec.onresult = (e) => {
      let t = "";
      for (let k = 0; k < e.results.length; k++) t += e.results[k][0]?.transcript ?? "";
      fraseRef.current = t.trim();
      setParcial(fraseRef.current);
      // O iPhone nao encerra sozinho: sem palavra nova por um instante, a fala acabou.
      if (calado) clearTimeout(calado);
      calado = setTimeout(() => {
        if (falaRef.current === rec) parar();
      }, SILENCIO_MS);
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
    void entenderTexto(frase);
  }

  // Texto (digitado, ou o que o proprio celular transcreveu) -> mesmo cerebro do
  // audio no servidor. Sem rede ou sem IA, a regra local entende o que der.
  async function entenderTexto(frase: string) {
    const f = frase.trim();
    if (!f) return;
    setFase("enviando");
    setErro("");
    try {
      const r = await fetch("/api/entender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: f, tela: telaIA }),
      });
      const d = (await r.json().catch(() => null)) as VozResposta | null;
      if (d?.ok) return mostrarResultado(d.texto, d.intencao, d.itens);
    } catch {
      /* cai na regra local */
    }
    const local = interpretarLocal(f);
    await mostrarResultado(f, local.intencao, local.itens);
  }

  // Foto da despensa, de uma lista escrita ou do carrinho: varios produtos de uma vez,
  // pelo mesmo caminho (estoque, lista, nao comprar com pergunta).
  async function entenderFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setFase("enviando");
    setErro("");
    try {
      const foto = await reduzir(arquivo, 1600);
      const r = await fetch("/api/entender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foto, tela: telaIA }),
      });
      const d = (await r.json().catch(() => null)) as (VozResposta & { espera?: number }) | null;
      if (d?.ok) {
        if (!d.itens.length) {
          setErro("Não reconheci produtos nessa foto. Tente mais de perto, com os rótulos aparecendo.");
          return setFase("gravar");
        }
        return mostrarResultado(`📷 ${d.texto}`, d.intencao, d.itens);
      }
      setErro(
        d && !d.ok && d.erro === "limite"
          ? `A IA está no limite agora. Tente de novo em ${d.espera ?? 30}s.`
          : d && !d.ok && d.erro === "ia_indisponivel"
            ? "A IA de fotos não está configurada."
            : "Não consegui ler a foto. Tente de novo.",
      );
    } catch {
      setErro("Sem conexão. Tente de novo.");
    }
    setFase("gravar");
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
    <>
    {prateleira && (
      <PrateleiraModal
        onClose={() => {
          setPrateleira(false);
          fechar();
        }}
        onUmSo={(f) => void enfileirarFoto(f, "estoque")}
      />
    )}
    <Modal open={open && !prateleira} onClose={fechar} maxWidth={460}>
      <div className="mb-[18px]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
          <MicIcon size={18} />
          Falar, escrever ou fotografar
        </div>
        <div className="text-[19px] font-extrabold">
          {pergunta
            ? fase === "marca"
              ? `Qual marca de ${pergunta.fila[pergunta.i]} é ruim?`
              : `Por que não comprar ${pergunta.fila[pergunta.i]}?`
            : fase === "conferir" && jaForam > 0
            ? "Fiquei em dúvida nestes"
            : fase === "conferir" || fase === "salvando"
              ? "Confere e salva"
              : "Diga o que aconteceu"}
        </div>
      </div>

      {pergunta ? (
        <PerguntaNaoComprar
          p={pergunta}
          fase={fase}
          sugerido={motivoNaoComprar(pergunta.frase)}
          marcas={marcas}
          outraMarca={outraMarca}
          setOutraMarca={setOutraMarca}
          onMotivo={escolherMotivo}
          onMarca={escolherMarca}
          onVoltar={() => setFase("motivo")}
          onPular={() => responder(null)}
        />
      ) : fase !== "conferir" && fase !== "salvando" ? (
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

          <div className="mb-4 flex flex-col items-center gap-2">
            <Gravador
              estado={fase === "enviando" ? "entendendo" : gravando ? "gravando" : "parado"}
              nivel={nivel}
              historico={modoLocal ? null : historico}
              segundos={segundos}
              onToggle={gravando ? parar : gravar}
              disabled={ocupado}
            />
            {gravando && parcial && (
              <p className="text-center text-[14px] text-text-2">“{parcial}”</p>
            )}
            {gravando && (
              <div className="text-[12px] text-text-3">Paro sozinho quando você terminar · toque para parar</div>
            )}
          </div>

          {erro && (
            <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug text-text-2">
              {erro}
            </p>
          )}

          {/* Os outros dois jeitos de dizer a mesma coisa, com o mesmo entendimento. */}
          {!gravando && fase !== "enviando" && (
            <div className="mb-3 flex flex-col gap-2">
              {escrevendo ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void entenderTexto(escrito);
                  }}
                  className="flex flex-col gap-2"
                >
                  <textarea
                    autoFocus
                    value={escrito}
                    onChange={(e) => setEscrito(e.target.value)}
                    rows={3}
                    placeholder="Escreva como falaria: tenho 5 kg de arroz, preciso de café, não comprar leite esse mês"
                    className="w-full rounded-[13px] border border-border bg-card-2 p-3 text-[15px] leading-snug"
                  />
                  <button
                    type="submit"
                    disabled={!escrito.trim()}
                    className="h-12 rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
                  >
                    Entender e registrar
                  </button>
                </form>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEscrevendo(true)}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-border bg-card text-[13px] font-bold"
                  >
                    <span className="text-[18px]" aria-hidden>⌨️</span>Escrever
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrateleira(true)}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-brand/50 bg-brand-soft text-[13px] font-bold text-brand"
                  >
                    <span className="text-[18px]" aria-hidden>🗄️</span>Prateleira
                  </button>
                  <button
                    type="button"
                    onClick={() => fotoRef.current?.click()}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-border bg-card text-[13px] font-bold"
                  >
                    <span className="text-[18px]" aria-hidden>📝</span>Lista escrita
                  </button>
                </div>
              )}
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Foto de uma lista escrita"
                onChange={(e) => {
                  void entenderFoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {!escrevendo && (
                <p className="text-center text-[11px] text-text-3">
                  Prateleira: um quadrado em cada produto e a contagem vira o estoque. Lista escrita: foto do papel.
                </p>
              )}
            </div>
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
    </>
  );
}

// Pergunta do "Nao comprar": o motivo (dois botoes grandes) e, se for ruim sem
// marca falada, a marca, com foto, tirada do catalogo das lojas (/api/busca).
function PerguntaNaoComprar({
  p,
  fase,
  sugerido,
  marcas,
  outraMarca,
  setOutraMarca,
  onMotivo,
  onMarca,
  onVoltar,
  onPular,
}: {
  p: Pergunta;
  fase: Fase;
  sugerido: "ruim" | "excesso";
  marcas: Marca[] | null;
  outraMarca: string;
  setOutraMarca: (v: string) => void;
  onMotivo: (t: "excesso" | "ruim") => void;
  onMarca: (marca: string | null, foto?: string | null) => void;
  onVoltar: () => void;
  onPular: () => void;
}) {
  const nome = p.fila[p.i];
  const ocupado = fase === "salvando";
  return (
    <div className="flex flex-col gap-3">
      {p.gravado && (
        <div className="rounded-[13px] border-2 border-pos/40 bg-pos-soft p-3">
          <div className="text-[13px] font-extrabold text-pos">✓ Já gravei</div>
          <div className="text-[14px] font-bold">{p.gravado}</div>
        </div>
      )}
      <p className="rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-relaxed text-text-2">
        “{p.frase}”
        {p.fila.length > 1 && (
          <span className="mt-1 block font-bold">
            Item {p.i + 1} de {p.fila.length}
          </span>
        )}
      </p>

      {fase === "marca" ? (
        <>
          <p className="text-[13px] text-text-2">
            Você não falou a marca. Escolha qual {nome} é ruim, para não aparecer mais nas ofertas.
          </p>
          {marcas === null ? (
            <div className="grid h-24 place-items-center">
              <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-brand" />
            </div>
          ) : marcas.length ? (
            <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto">
              {marcas.map((m) => (
                <button
                  key={m.marca}
                  type="button"
                  disabled={ocupado}
                  onClick={() => onMarca(m.marca, m.foto)}
                  className="flex items-center gap-2 rounded-[14px] border-2 border-border bg-card p-2 text-left disabled:opacity-50"
                >
                  {m.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura da loja
                    <img src={m.foto} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-neg-soft text-[20px]">👎</span>
                  )}
                  <span className="min-w-0 text-[14px] font-extrabold leading-tight">{m.marca}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-text-3">Não achei marcas de {nome}. Escreva abaixo.</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (outraMarca.trim()) onMarca(outraMarca);
            }}
          >
            <input
              value={outraMarca}
              onChange={(e) => setOutraMarca(e.target.value)}
              placeholder="Outra marca"
              className="h-12 min-w-0 flex-1 rounded-[14px] border border-border bg-card px-3 text-[16px]"
            />
            <button
              type="submit"
              disabled={ocupado || !outraMarca.trim()}
              className="h-12 rounded-[14px] bg-neg px-4 text-[15px] font-bold text-neg-ink disabled:opacity-50"
            >
              Salvar
            </button>
          </form>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onVoltar}
              disabled={ocupado}
              className="h-11 flex-1 rounded-[14px] border border-border bg-card text-[14px] font-bold"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => onMarca(null)}
              disabled={ocupado}
              className="h-11 flex-[1.4] rounded-[14px] border border-border bg-card text-[14px] font-bold"
            >
              Qualquer {nome}
            </button>
          </div>
        </>
      ) : (
        <>
          {(
            [
              ["excesso", "📦", "Em excesso", "Tem demais em casa. Fica de olho até baixar."],
              ["ruim", "👎", "Produto ruim", "Não compra mais. Some das ofertas."],
            ] as const
          ).map(([k, ic, titulo, sub]) => (
            <button
              key={k}
              type="button"
              disabled={ocupado}
              onClick={() => onMotivo(k)}
              className={`flex items-center gap-3 rounded-[16px] border-2 p-3.5 text-left disabled:opacity-50 ${
                k === "ruim" ? "border-neg/40 bg-neg-soft" : "border-warn/40 bg-warn-soft"
              }`}
            >
              <span className="text-[30px]" aria-hidden>
                {ic}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-extrabold">
                  {titulo}
                  {sugerido === k && k === "ruim" && (
                    <span className="ml-1.5 text-[11px] font-bold text-text-3">pelo que você falou</span>
                  )}
                </span>
                <span className="block text-[13px] text-text-2">{sub}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onPular}
            disabled={ocupado}
            className="h-11 rounded-[14px] text-[14px] font-bold text-text-3 underline"
          >
            Só tirar da lista
          </button>
        </>
      )}
      {ocupado && <p className="text-center text-[13px] text-text-3">Guardando…</p>}
    </div>
  );
}
