"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ItemGrid, type GridItem } from "@/components/receipt/ItemGrid";
import { BarcodeIcon, MicIcon } from "@/components/ui/icons";
import { BarcodeModal } from "@/components/lista/BarcodeModal";
import { DestinoSwitch, nomeDestino } from "@/components/ui/Destino";
import { useLugar } from "@/lib/lugar";
import { useStore } from "@/lib/store";
import { findByName, unitFor } from "@/lib/defaults";
import { createClient } from "@/lib/supabase/client";
import { marcarNaoComprar, marcarRuim } from "@/components/ofertas/useEvitar";
import { termoEvitar } from "@/lib/ofertas";
import { reduzir } from "@/lib/reconhecer";
import { Gravador } from "./Gravador";
import { FotoItem } from "@/components/ui/FotoItem";
import { PrateleiraModal } from "@/components/estoque/PrateleiraModal";
import { acertarEstoque as acertarNoEstoque, linhasDePara, type LinhaDePara } from "@/lib/acertarEstoque";
import type { ShopItem } from "@/lib/types";
import {
  achaNaLista,
  ERRO_VOZ,
  ehApple,
  escolherMime,
  extensaoDe,
  interpretarLocal,
  motivoNaoComprar,
  querAtualizarEstoque,
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
type Fase = "gravar" | "gravando" | "enviando" | "conferir" | "salvando" | "motivo" | "marca" | "atualizar";

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
  adicionados: Adicionado[]; // a mesma coisa, item por item, para a lista de cima
};
type Adicionado = { nome: string; qtd: number; unidade: string; onde: "estoque" | "lista" };
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
  // Modo "Atualizar estoque": o que for falado vira DE -> PARA (fica X). Liga sozinho
  // quando a fala diz quanto tem, ou pede ("vou atualizar o meu estoque").
  const [atualizando, setAtualizando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDePara[]>([]);
  const [gravandoAt, setGravandoAt] = useState(false);
  // O que a fala trouxe e nao e contagem ("preciso de cafe", "nao compra leite"):
  // segue o caminho de sempre depois da atualizacao.
  const [restoAt, setRestoAt] = useState<{ frase: string; intencao: VozIntencao; itens: VozItem[] } | null>(null);

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
  const [codigo, setCodigo] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  // Tela que vai junto para a IA desempatar ("arroz" sozinho no Estoque e estoque).
  // Modo atualizar ligado pelo botao: a IA fica sabendo que numero sem verbo e o que TEM.
  const telaIA = atualizando
    ? "atualizar"
    : telaAgora === "estoque" ? "estoque" : telaAgora === "lista" ? "lista" : telaAgora === "auto" ? "auto" : "mercado";

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
    setLinhas([]);
    setGravandoAt(false);
    setAtualizando(false);
    setRestoAt(null);
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

  // `depoisDeAtualizar`: o resto da fala, ja fora da tela de-para (senao voltava para ela).
  async function mostrarResultado(frase: string, intencao: VozIntencao, lidosTodos: VozItem[], depoisDeAtualizar = false) {
    setTexto(frase);

    // Atualizar estoque: o que tem quantidade vira DE -> PARA e espera o "Atualizar".
    // "Preciso de"/"nao compra" continuam indo para a lista, depois.
    // Sem botao de modo (pedido do dono): toda fala que diz quanto TEM ("tenho 6 creme
    // de leite") passa pelo de-para, em qualquer tela. Antes, na tela Estoque, caia na
    // grade e SOMAVA 6 ao que ja tinha. Foto fica fora (tem a conferencia propria).
    const pediu = atualizando || querAtualizarEstoque(frase);
    if (!depoisDeAtualizar && (pediu || !frase.startsWith("📷"))) {
      // Contagem: o que a pessoa disse que TEM. "Acabou o X" so zera quando ela pediu
      // para atualizar; ai vira linha com 0 e segue tambem para a lista.
      const contagem = lidosTodos.filter((i) => !i.remover && (i.destino === "estoque" || (pediu && i.zerou)));
      const novas = linhasDePara(contagem, stock);
      if (novas.length) {
        setAtualizando(true);
        const resto = lidosTodos.filter((i) => !contagem.includes(i) || (i.zerou && i.destino === "lista"));
        setRestoAt(resto.length ? { frase, intencao, itens: resto } : null);
        setLinhas(novas);
        setFase("atualizar");
        return;
      }
    }
    setDestino(destinoDaTela(telaAgora, intencao));

    const tirarItens = lidosTodos.filter((i) => i.remover && i.nome.trim());
    let lidos = lidosTodos.filter((i) => !i.remover);
    if (tirarItens.length) {
      setFase("salvando");
      // 1) As adicoes primeiro, ja gravadas: "tenho 5 kg de arroz" entra no estoque e
      // "preciso de cafe" na lista, antes de qualquer pergunta sobre o que nao comprar.
      const gravados: string[] = [];
      const adicionados: Adicionado[] = [];
      const est = lidos.filter((i) => i.destino === "estoque");
      if (est.length) {
        const r = await acertarNoEstoque(est, stock, addStock);
        if (r.ok.length) gravados.push(`🏠 Estoque: ${r.ok.join(", ")}`);
        for (const it of est) {
          if (!r.falhou.includes(it.nome.trim())) adicionados.push({ nome: it.nome.trim(), qtd: it.qtd, unidade: it.unidade, onde: "estoque" });
        }
      }
      const naLista = lidos.filter((i) => i.destino === "lista" && !i.duvida && i.nome.trim().length >= 2);
      const foram: string[] = [];
      for (const it of naLista) {
        const r = await addShopItem({
          name: it.nome.trim(),
          desired_quantity: Number(it.qtd) || 1,
          unit: it.unidade,
          estimated_price: it.preco ?? findByName(it.nome, stock)?.priceLast ?? null,
        });
        if (r.ok) {
          foram.push(it.nome.trim());
          adicionados.push({ nome: it.nome.trim(), qtd: Number(it.qtd) || 1, unidade: it.unidade, onde: "lista" });
        }
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
        setPergunta({ fila, i: 0, frase, intencao, lidos, aviso: [gravado, aviso].filter(Boolean).join(" · "), feitos, gravado, adicionados });
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
    const local = interpretarLocal(f, atualizando);
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

  // Grava o PARA de cada linha (a RPC soma, entao vai a diferenca) e oferece
  // Desfazer, que devolve cada um para o DE.
  async function confirmarAtualizacao() {
    const mudou = linhas.filter((l) => l.de === null || Math.abs(l.para - l.de) > 1e-9);
    if (!mudou.length) {
      showToast("Nada mudou no estoque.");
      return seguirDepoisDeAtualizar();
    }
    setGravandoAt(true);
    const falhou: string[] = [];
    const feitos: LinhaDePara[] = [];
    for (const l of mudou) {
      const r = await addStock({ name: l.nome, qty: +(l.para - (l.de ?? 0)).toFixed(3), unit: l.unidade });
      if (r.ok) feitos.push(l);
      else falhou.push(l.nome);
    }
    setGravandoAt(false);
    const resumo = feitos.map((l) => `${l.nome} ${fmtQtd(l.de ?? 0)}→${fmtQtd(l.para)} ${l.unidade}`);
    const msg = [
      feitos.length ? `🏠 Estoque atualizado: ${resumo.slice(0, 3).join(", ")}${resumo.length > 3 ? ` e mais ${resumo.length - 3}` : ""}` : "",
      falhou.length ? `não gravei ${falhou.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (!feitos.length) return showToast(msg || "Não deu para atualizar.");
    showToast(msg, {
      desfazer: async () => {
        for (const l of feitos) {
          await addStock({ name: l.nome, qty: +((l.de ?? 0) - l.para).toFixed(3), unit: l.unidade });
        }
        showToast("Desfeito: estoque voltou ao que era");
      },
    });
    await seguirDepoisDeAtualizar();
  }

  async function seguirDepoisDeAtualizar() {
    const resto = restoAt;
    setRestoAt(null);
    setLinhas([]);
    setAtualizando(false);
    if (!resto) return fechar();
    // O resto da fala segue como sempre (lista, nao comprar...). So tem item de
    // lista/remover, entao mostrarResultado nao cai de novo no modo atualizar.
    await mostrarResultado(resto.frase, resto.intencao, resto.itens, true);
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
        destino={noMercado ? "carrinho" : "estoque"}
        onListaEscrita={(f) => {
          setPrateleira(false);
          void entenderFoto(f);
        }}
      />
    )}
    {codigo && (
      <BarcodeModal
        open
        onClose={() => {
          setCodigo(false);
          fechar();
        }}
        destinoPadrao={telaAgora === "mercado" || telaAgora === "lista" ? "carrinho" : "estoque"}
      />
    )}
    <Modal open={open && !prateleira && !codigo} onClose={fechar} maxWidth={460}>
      <div className="mb-[18px]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
          <MicIcon size={18} />
          Adicionar
        </div>
        <div className="text-[19px] font-extrabold">
          {fase === "atualizar"
            ? "Atualizar estoque"
            : pergunta
            ? fase === "marca"
              ? `Qual marca de ${pergunta.fila[pergunta.i]} é ruim?`
              : pergunta.adicionados.length
                ? "Entendi assim"
                : `Por que não comprar ${pergunta.fila[pergunta.i]}?`
            : fase === "conferir" && jaForam > 0
            ? "Fiquei em dúvida nestes"
            : fase === "conferir" || fase === "salvando"
              ? "Confere e salva"
              : "Diga o que aconteceu"}
        </div>
      </div>

      {fase === "atualizar" ? (
        <AtualizarEstoque
          texto={texto}
          linhas={linhas}
          resto={restoAt?.itens ?? []}
          setLinhas={setLinhas}
          ocupado={gravandoAt}
          onFalarDeNovo={() => {
            limpar();
            setAtualizando(true);
          }}
          onConfirmar={confirmarAtualizacao}
        />
      ) : pergunta ? (
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
            {atualizando
              ? "Fale como está agora: “arroz 5 quilos, leite 2, café de 3 para 1”. Eu mostro o de → para de cada item e você confirma antes de atualizar."
              : <>
            {noMercado && tela === "estoque" && "📍 Você está num mercado: vai para o carrinho. "}
            {tela === "lista" || tela === "auto"
              ? tela === "auto"
                ? "Fale do jeito que vier: “preciso de arroz, não compra leite, agora só tenho 6 creme de leite”. O que for lista entra direto; o que for estoque eu comparo e você confirma."
                : "Fale o que quer e o que não quer: “quero arroz, feijão e 5 detergentes, mas não quero mais café”. Entra e sai da lista direto; no que eu ficar em dúvida, eu pergunto."
              : telaAgora === "estoque"
              ? "Fale o que tem em casa: “três leites, dois arroz e um café”. Vai para o estoque; você confere antes de salvar."
              : "Fale normal, como você contaria pra alguém: “comprei arroz vinte reais, dois pacotes, e café doze e noventa”. Você confere antes de salvar."}
              </>}
          </p>
          {modoLocal && (
            <p className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[12px] leading-snug text-text-2">
              Ouvindo pelo próprio aparelho, sem servidor. Funciona bem com frases
              curtas; confira os itens antes de salvar.
            </p>
          )}

          {/* Escrevendo: o gravador grande sai da frente, senao com o teclado aberto
              ele ocupa o popup inteiro e o campo fica cortado. */}
          {escrevendo && !gravando && fase !== "enviando" ? (
            <button
              type="button"
              onClick={() => { setEscrevendo(false); void gravar(); }}
              disabled={ocupado}
              className="mb-3 flex h-10 w-fit items-center gap-2 rounded-full bg-brand-soft px-3.5 text-[14px] font-bold text-brand disabled:opacity-50"
            >
              <span aria-hidden>🎤</span> Falar em vez de escrever
            </button>
          ) : (
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
          )}

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
                    onClick={() => setPrateleira(true)}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-brand/50 bg-brand-soft text-[13px] font-bold text-brand"
                  >
                    <span className="text-[18px]" aria-hidden>📸</span>Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodigo(true)}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-border bg-card text-[13px] font-bold"
                  >
                    <BarcodeIcon size={20} />Código
                  </button>
                  <button
                    type="button"
                    onClick={() => setEscrevendo(true)}
                    className="flex h-14 flex-col items-center justify-center rounded-[14px] border-2 border-border bg-card text-[13px] font-bold"
                  >
                    <span className="text-[18px]" aria-hidden>⌨️</span>Escrever
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
                  Foto: um produto, o armário inteiro, o carrinho ou uma lista escrita no papel.
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
      {/* 1. O que entrou: adicao, ja gravada. Lista com rolagem se for muita coisa. */}
      {p.adicionados.length > 0 && fase !== "marca" && (
        <section className="rounded-[16px] border-2 border-pos/40 bg-pos-soft">
          <div className="px-3 pt-2.5 text-[13px] font-extrabold text-pos">✓ Adicionado ({p.adicionados.length})</div>
          <ul className="max-h-[28dvh] overflow-y-auto px-2 pb-2 pt-1">
            {p.adicionados.map((a) => (
              <li key={`${a.onde}-${a.nome}`} className="flex items-center gap-2.5 rounded-[12px] px-1.5 py-1.5">
                <FotoItem nome={a.nome} className="h-9 w-9 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold capitalize">{a.nome}</span>
                <span className="shrink-0 text-[14px] font-extrabold tabular-nums">
                  {Number.isInteger(a.qtd) ? a.qtd : String(a.qtd).replace(".", ",")} {a.unidade}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                    a.onde === "estoque" ? "bg-card text-text-2" : "bg-brand-soft text-brand"
                  }`}
                >
                  {a.onde === "estoque" ? "🏠 Estoque" : "📝 Lista"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. O que nao comprar: separado, embaixo. */}
      {p.adicionados.length > 0 && fase !== "marca" && (
        <>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[12px] font-extrabold uppercase tracking-wide text-text-3">🚫 Não comprar</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="text-[17px] font-extrabold">Por que não comprar {nome}?</div>
        </>
      )}
      {/* Quais sao os itens do "nao comprar": ja respondido (✓), agora (destaque), depois. */}
      {p.fila.length > 1 && fase !== "marca" && (
        <div className="flex flex-wrap gap-1.5" aria-label="Itens para não comprar">
          {p.fila.map((n, k) => (
            <span
              key={`${n}-${k}`}
              className={`rounded-full px-2.5 py-1 text-[12px] font-bold capitalize ${
                k < p.i
                  ? "bg-pos-soft text-pos"
                  : k === p.i
                    ? "bg-text text-bg"
                    : "border border-border text-text-3"
              }`}
            >
              {k < p.i ? "✓ " : k === p.i ? "👉 " : ""}
              {n}
            </span>
          ))}
        </div>
      )}

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
            <div className="grid max-h-[40dvh] grid-cols-2 gap-2 overflow-y-auto">
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
      {/* o que foi ouvido, pequeno no rodape: referencia, nao o centro da tela */}
      <p className="text-center text-[12px] italic leading-snug text-text-3">Ouvi: “{p.frase}”</p>
    </div>
  );
}

function fmtQtd(n: number): string {
  return String(+n.toFixed(2)).replace(".", ",");
}

// Tela do "Atualizar estoque": uma linha por produto com o que o app tem (ANTES) e o
// que a pessoa falou (AGORA). Ajuste por toque (- / + / Acabou); digitar e opcao.
// Embaixo, o resto que a fala trouxe (lista, nao comprar), que segue depois.
export function AtualizarEstoque({
  texto,
  linhas,
  resto = [],
  setLinhas,
  ocupado,
  onFalarDeNovo,
  onConfirmar,
}: {
  texto: string;
  linhas: LinhaDePara[];
  resto?: VozItem[];
  setLinhas: (f: (l: LinhaDePara[]) => LinhaDePara[]) => void;
  ocupado: boolean;
  onFalarDeNovo: () => void;
  onConfirmar: () => void;
}) {
  // Mexeu na linha: ja conferiu (some o "quanto tem?").
  const muda = (i: number, para: number) =>
    setLinhas((l) =>
      l.map((x, k) => (k === i ? { ...x, para: Math.max(0, +para.toFixed(3)), conferir: false, aviso: undefined } : x)),
    );
  const passo = (u: string) => (/^(kg|l)$/i.test(u) ? 0.5 : 1);
  const mudaram = linhas.filter((l) => l.de === null || Math.abs(l.para - l.de) > 1e-9).length;
  const faltaConferir = linhas.filter((l) => l.conferir).length;

  const naLista = resto.filter((i) => !i.remover && i.destino === "lista").map((i) => i.nome);
  const naoComprar = resto.filter((i) => i.remover).map((i) => i.nome);
  const outros = resto.filter((i) => !i.remover && i.destino !== "lista").map((i) => i.nome);

  return (
    <>
      <p className="mb-3 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-relaxed text-text-2">
        <span className="line-clamp-3">“{texto}”</span>
      </p>
      {faltaConferir > 0 && (
        <p className="mb-3 rounded-[13px] bg-warn-soft p-3 text-[13px] font-semibold leading-snug text-text">
          {faltaConferir === 1 ? "Em 1 item" : `Em ${faltaConferir} itens`} você não disse quanto tem. Ajuste no
          + / − ou deixe como está.
        </p>
      )}
      <ul className="mb-3 flex flex-col gap-2">
        {linhas.map((l, i) => {
          const igual = l.de !== null && Math.abs(l.para - l.de) < 1e-9;
          return (
            <li
              key={l.nome}
              className={`rounded-[16px] border-2 bg-card p-3 ${l.conferir ? "border-warn" : igual ? "border-border" : "border-brand/50"}`}
            >
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-extrabold">{l.nome}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
                    <span className="text-text-2">
                      {l.de === null ? "Novo no estoque" : `Antes: ${fmtQtd(l.de)} ${l.unidade}`}
                    </span>
                    {l.conferir && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">quanto tem?</span>}
                    {l.lista && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">+ lista</span>}
                    {l.aviso && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">{l.aviso}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => muda(i, 0)}
                  disabled={l.para === 0}
                  className="-mt-1 h-9 shrink-0 rounded-full border border-border px-3 text-[13px] font-bold text-text-2 disabled:border-transparent disabled:text-text-3"
                >
                  {l.para === 0 ? "Zerado" : "Acabou"}
                </button>
                <button
                  type="button"
                  aria-label={`Tirar ${l.nome}`}
                  onClick={() => setLinhas((x) => x.filter((_, k) => k !== i))}
                  className="-mr-1 -mt-1 h-9 w-9 shrink-0 rounded-full text-text-3"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-text-3">Agora</span>
                <button
                  type="button"
                  aria-label={`Menos ${l.nome}`}
                  onClick={() => muda(i, l.para - passo(l.unidade))}
                  className="h-11 w-11 shrink-0 rounded-full border border-border bg-card-2 text-[20px] font-bold"
                >
                  −
                </button>
                <CampoQtd
                  rotulo={`Quantidade agora de ${l.nome}`}
                  valor={l.para}
                  onValor={(n) => muda(i, n)}
                  destaque={!igual}
                />
                <button
                  type="button"
                  aria-label={`Mais ${l.nome}`}
                  onClick={() => muda(i, l.para + passo(l.unidade))}
                  className="h-11 w-11 shrink-0 rounded-full border border-border bg-card-2 text-[20px] font-bold"
                >
                  +
                </button>
                <span className="text-[13px] font-semibold text-text-2">{l.unidade}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {(naLista.length > 0 || naoComprar.length > 0 || outros.length > 0) && (
        <div className="mb-4 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug">
          <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.05em] text-text-3">Também entendi, faço depois</div>
          {naLista.length > 0 && <div>📝 Lista: {naLista.join(", ")}</div>}
          {naoComprar.length > 0 && <div>🚫 Não comprar: {naoComprar.join(", ")}</div>}
          {outros.length > 0 && <div>🛒 Para conferir: {outros.join(", ")}</div>}
        </div>
      )}

      <div data-rodape className="flex gap-3">
        <button
          type="button"
          onClick={onFalarDeNovo}
          disabled={ocupado}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold disabled:opacity-50"
        >
          Falar de novo
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={ocupado || linhas.length === 0}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {ocupado
            ? "Atualizando…"
            : mudaram
              ? `Atualizar ${mudaram} ${mudaram === 1 ? "item" : "itens"}`
              : resto.length
                ? "Seguir"
                : "Nada mudou"}
        </button>
      </div>
    </>
  );
}

// Digitar e opcao: o texto fica como a pessoa escreve ("0,") ate sair do campo.
function CampoQtd({
  rotulo,
  valor,
  onValor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  onValor: (n: number) => void;
  destaque: boolean;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  return (
    <input
      aria-label={rotulo}
      inputMode="decimal"
      value={rascunho ?? fmtQtd(valor)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setRascunho(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() && Number.isFinite(n)) onValor(n);
      }}
      onBlur={() => setRascunho(null)}
      className={`h-11 w-16 rounded-[10px] border text-center text-[16px] font-extrabold ${
        destaque ? "border-brand text-brand" : "border-border text-text-2"
      }`}
    />
  );
}
