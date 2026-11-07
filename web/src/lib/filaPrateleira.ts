"use client";

import { useSyncExternalStore } from "react";
import { enfileirarFoto, type Destino } from "./filaFotos";
import { aplicarCurva, curvaDeRealce, histograma } from "./realce";
import { juntarIguais, limpar, mesmoProduto, faixas, paraFoto, segundaOpiniao, precisaFaltou, somarNovos, unidadesDe, type Achado, type Box } from "./prateleira";

// Foto dos produtos em SEGUNDO PLANO (pedido do dono): a pessoa tira a foto e o app
// fica livre. A IA procura e confere cada produto aqui fora da tela; quando termina,
// um aviso fixo ("Foto pronta: conferir") fica na tela ate a pessoa abrir ou descartar.
//
// Fica neste aparelho (localStorage): fechar o app no meio nao perde a foto; ao abrir
// de novo, o que estava sendo lido volta a ser lido.

export type JobFoto = {
  id: string;
  src: string; // JPEG de pe, o mesmo que vai para a IA e para a tela
  destino: Destino; // se for um produto so, vai para a fila de foto de produto com este destino
  estado: "lendo" | "pronto" | "falhou";
  achados?: Achado[];
  conferidos?: (string | null)[]; // segunda olhada por recorte; null = nao rodou
  erro?: string;
  espera?: number; // ms: IA no limite, tenta de novo neste horario
  tentativas?: number; // falhas seguidas (tenta sozinho ate 3)
  etapa?: "procurando" | "faltou" | "conferindo"; // para a tela do processo
  nomes?: string[]; // nomes que a casa usa (estoque + carrinho): a IA repete o mesmo nome
  carrinho?: string[]; // foto no mercado: o que ja estava no carrinho (nao confere de novo)
  fotoDeCarrinho?: boolean; // a IA viu um carrinho/cesta de mercado: a tela abre no carrinho
};

const CHAVE = "fila_prateleira";
let fila: JobFoto[] = [];
let carregada = false;
const ouvintes = new Set<() => void>();

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // sem espaco: a fila vive so nesta visita
  }
}
function mudar(f: JobFoto[]) {
  fila = f;
  // faixas da original so enquanto a foto esta sendo lida (liberam memoria depois)
  for (const id of faixasProntas.keys()) if (!f.some((x) => x.id === id && x.estado === "lendo")) faixasProntas.delete(id);
  gravar();
  ouvintes.forEach((x) => x());
}
const trocar = (id: string, p: Partial<JobFoto>) => mudar(fila.map((x) => (x.id === id ? { ...x, ...p } : x)));

function carregar() {
  if (carregada || typeof window === "undefined") return;
  carregada = true;
  try {
    fila = JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as JobFoto[];
  } catch {
    fila = [];
  }
  processar();
}

// ---- imagem ----

const LADO = 1600; // px do lado maior: nitido para ler rotulo, leve para subir no 4G
const QUALIDADE = 0.82; // JPEG: rotulo continua legivel e o envio fica ~15% menor que 0.85

// Realce automatico (lib/realce): foto escura ou sem contraste ganha contraste e sombra
// clareada; foto boa fica igual. A curva sai da foto reduzida e vale para as faixas.
function realcar(c: HTMLCanvasElement, lut?: Uint8Array | null): Uint8Array | null {
  try {
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const d = g.getImageData(0, 0, c.width, c.height);
    const curva = lut === undefined ? curvaDeRealce(histograma(d.data)) : lut;
    if (!curva) return null;
    aplicarCurva(d.data, curva);
    g.putImageData(d, 0, 0);
    return curva;
  } catch {
    return null; // navegador sem getImageData: segue com a foto como veio
  }
}

// Desenha a regiao r (0..1) da imagem em ate `lado` px no lado maior (zoom ate 2x).
function desenhar(img: CanvasImageSource & { width: number; height: number }, r: Box, lado: number): HTMLCanvasElement {
  const sx = r[1] * img.width;
  const sy = r[0] * img.height;
  const sw = (r[3] - r[1]) * img.width;
  const sh = (r[2] - r[0]) * img.height;
  const k = Math.min(2, lado / Math.max(sw, sh));
  const p = document.createElement("canvas");
  p.width = Math.max(1, Math.round(sw * k));
  p.height = Math.max(1, Math.round(sh * k));
  const g = p.getContext("2d")!;
  g.imageSmoothingQuality = "high"; // reduzir 12 MP sem serrilhar a letra do rotulo
  g.drawImage(img, sx, sy, sw, sh, 0, 0, p.width, p.height);
  return p;
}

// imageOrientation: a foto do iPhone vem deitada no arquivo; aqui ela ja fica de pe,
// e e ESSA que vai para a IA e para a tela (os quadrados batem nas duas).
const abrir = (arquivo: File) => createImageBitmap(arquivo, { imageOrientation: "from-image" });

export async function prepararFoto(arquivo: File): Promise<HTMLCanvasElement> {
  const img = await abrir(arquivo);
  const c = desenhar(img, [0, 0, 1, 1], Math.min(LADO, Math.max(img.width, img.height)));
  img.close();
  realcar(c);
  return c;
}

// Faixas com zoom feitas da foto ORIGINAL (12 MP do celular), nao da reduzida: o zoom
// traz detalhe de verdade (letra pequena do rotulo), em vez de so ampliar pixel.
// Ficam so na memoria (grandes demais para o localStorage); sem elas (app reaberto),
// as faixas saem da foto guardada, como antes.
const faixasProntas = new Map<string, Promise<{ r: Box; foto: string }[]>>();

export function canvasDe(src: string): Promise<HTMLCanvasElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      ok(c);
    };
    img.onerror = falha;
    img.src = src;
  });
}

// folga: margem em volta do quadrado (0.08 = 8%), da contexto para ler o rotulo.
export function recorte(c: HTMLCanvasElement, b: Box, lado: number, folga = 0): HTMLCanvasElement {
  const fy = (b[2] - b[0]) * folga;
  const fx = (b[3] - b[1]) * folga;
  const y0 = Math.max(0, b[0] - fy);
  const x0 = Math.max(0, b[1] - fx);
  const x = x0 * c.width;
  const y = y0 * c.height;
  const w = Math.max(1, (Math.min(1, b[3] + fx) - x0) * c.width);
  const h = Math.max(1, (Math.min(1, b[2] + fy) - y0) * c.height);
  const k = Math.min(lado / w, lado / h);
  const r = document.createElement("canvas");
  r.width = lado;
  r.height = lado;
  const g = r.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, lado, lado);
  g.drawImage(c, x, y, w, h, (lado - w * k) / 2, (lado - h * k) / 2, w * k, h * k);
  return r;
}

// Grade numerada dos recortes, para a conferencia (uma chamada so para todos).
function grade(c: HTMLCanvasElement, boxes: Box[]): string {
  const lado = 200;
  const cols = Math.ceil(Math.sqrt(boxes.length));
  const linhas = Math.ceil(boxes.length / cols);
  const g = document.createElement("canvas");
  g.width = cols * lado;
  g.height = linhas * lado;
  const ctx = g.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, g.width, g.height);
  boxes.forEach((b, i) => {
    const x = (i % cols) * lado;
    const y = Math.floor(i / cols) * lado;
    ctx.drawImage(recorte(c, b, lado - 8, 0.03), x + 4, y + 4);
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 4, y + 4, 34, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(String(i + 1), x + 10, y + 24);
  });
  return g.toDataURL("image/jpeg", 0.85);
}

// Pedaco da foto (regiao 0..1), ampliado ate LADO: com zoom a IA ve os produtos
// pequenos, os de tras e os do canto, que na foto inteira ela larga.
const pedaco = (c: HTMLCanvasElement, r: Box) => desenhar(c, r, LADO).toDataURL("image/jpeg", QUALIDADE);

// Busca nas tres faixas com zoom, AO MESMO TEMPO que a foto inteira (nao soma tempo).
// Faixa que pegou limite por minuto tenta mais uma vez; falhou de novo, fica sem ela
// (nunca derruba a foto). carrinho: alguma faixa viu carrinho de mercado.
// Teto de espera pelas faixas DEPOIS que a foto inteira voltou. Medido em 235 fotos: na
// mediana as faixas chegam junto (0,6 s a mais), mas 1 em 4 fotos esperava mais de 11 s
// (faixa presa no limite por minuto) e 1 em 10 mais de 90 s. Passou do teto, a foto segue
// com as faixas que ja chegaram; a que atrasou fica de fora (nunca derruba a foto).
const ESPERA_FAIXAS_MS = 10_000;
type Faixas = { itens: Achado[]; carrinho: boolean; daFaixa: Achado[] };

// Devolve as faixas que chegarem; `parcial` tem o que ja chegou a qualquer momento.
function buscarNasFaixas(x: JobFoto): { todas: Promise<void>; parcial: Faixas } {
  const parcial: Faixas = { itens: [], carrinho: false, daFaixa: [] };
  return { todas: buscar(x, parcial), parcial };
}

async function buscar(x: JobFoto, parcial: Faixas): Promise<void> {
  try {
    const prontas = (await faixasProntas.get(x.id)?.catch(() => [])) ?? [];
    const lista = prontas.length
      ? prontas
      : await canvasDe(x.src).then((c) => faixas(c.width, c.height).map((r) => ({ r, foto: pedaco(c, r) })));
    const pedir = async (foto: string) => {
      const res = await fetch("/api/prateleira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foto, nomes: x.nomes }),
      }).catch(() => null);
      return (await res?.json().catch(() => null)) as { ok?: boolean; itens?: Achado[]; carrinho?: boolean; erro?: string; espera?: number } | null;
    };
    await Promise.all(
      lista.map(async ({ r, foto }, k) => {
        let d = await pedir(foto);
        if (d?.erro === "limite" && (d.espera ?? 99) <= 20) {
          await dormir(((d.espera ?? 5) + k) * 1000);
          d = await pedir(foto);
        }
        if (!d?.ok) return;
        const itens = limpar(d.itens ?? []).map((a) => ({ ...a, box: paraFoto(a.box, r) }));
        parcial.itens.push(...itens);
        parcial.daFaixa.push(...itens);
        parcial.carrinho ||= !!d.carrinho;
      }),
    );
  } catch {
    /* sem faixas: fica so a foto inteira */
  }
}

async function arquivoDe(src: string): Promise<File> {
  const b = await (await fetch(src)).blob();
  return new File([b], "produto.jpg", { type: "image/jpeg" });
}

// ---- trabalho em segundo plano ----

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
// Duas fotos lidas ao mesmo tempo: quem tira varias fotos seguidas nao espera uma
// terminar para a outra comecar (cada foto sao ~4 pedidos, as 3 chaves aguentam).
const AO_MESMO_TEMPO = 2;
const ativos = new Set<string>();

async function ler(x: JobFoto): Promise<void> {
  trocar(x.id, { etapa: "procurando", achados: undefined });
  const faixasP = buscarNasFaixas(x);
  const r = await fetch("/api/prateleira", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ foto: x.src, nomes: x.nomes }),
  }).catch(() => null);
  const d = (await r?.json().catch(() => null)) as
    | { ok: true; itens: Achado[]; carrinho?: boolean }
    | { ok: false; erro: string; espera?: number }
    | null;
  if (!d?.ok) {
    if (d?.erro === "limite") return trocar(x.id, { espera: Date.now() + (d.espera ?? 30) * 1000 });
    // Falha passageira (rede, IA demorou): tenta sozinho mais 2 vezes antes de avisar.
    const t = (x.tentativas ?? 0) + 1;
    if (t < 3 && d?.erro !== "ia_indisponivel" && d?.erro !== "nao_autenticado")
      return trocar(x.id, { tentativas: t, espera: Date.now() + 3000 * t });
    return trocar(x.id, {
      estado: "falhou",
      tentativas: 0,
      erro:
        d?.erro === "ia_indisponivel"
          ? "A IA de fotos não está configurada."
          : d?.erro === "nao_autenticado"
            ? "Sua sessão expirou: entre de novo."
            : d?.erro === "imagem_grande"
              ? "Foto grande demais."
              : !r
                ? "Sem internet agora."
                : "A IA não conseguiu ler a foto.",
    });
  }
  const daFoto = limpar(d.itens);
  let achados = daFoto;
  let daFaixa: Achado[] = [];
  let carrinho = !!d.carrinho;
  // Produto unico de perto: as faixas so cortariam ele em pedacos.
  if (precisaFaltou(achados)) {
    trocar(x.id, { etapa: "faltou", achados: juntarIguais(achados) });
    await Promise.race([faixasP.todas, dormir(ESPERA_FAIXAS_MS)]);
    const f = faixasP.parcial; // o que chegou ate o teto
    daFaixa = [...f.daFaixa];
    achados = somarNovos(achados, daFaixa);
    carrinho ||= f.carrinho;
  }
  if (carrinho) trocar(x.id, { fotoDeCarrinho: true });
  achados = juntarIguais(achados);
  if (!achados.length) return trocar(x.id, { estado: "falhou", erro: "Não achei produtos nessa foto." });

  // Um produto so: e foto de produto. Vai pela fila de sempre (popup de conferir).
  if (achados.length === 1 && unidadesDe(achados[0]) === 1) {
    mudar(fila.filter((y) => y.id !== x.id));
    await enfileirarFoto(await arquivoDe(x.src), x.destino);
    return;
  }

  // A tela do processo ja mostra os quadrados achados enquanto confere.
  trocar(x.id, { etapa: "conferindo", achados, tentativas: 0 });

  // Conferencia. Primeiro a de graca: produto que a foto inteira e uma faixa acharam no
  // mesmo lugar ja tem segunda opiniao. A rodada extra (recortes numerados) so vai para
  // quem ficou sem opiniao E sem leitura segura (sem nome ou nao legivel): na maioria das
  // fotos ela nem roda (carrinho do dono: 1 de 23 precisaria), e a foto fica pronta uma
  // chamada mais cedo.
  // O que ja estava no carrinho nao e conferido de novo (economiza a IA).
  const opinioes = segundaOpiniao(achados, daFoto, daFaixa);
  const doCarrinho = (a: Achado) => a.legivel && (x.carrinho ?? []).some((n) => mesmoProduto(n, a.nome));
  let conferidos: (string | null)[] = achados.map((a, i) => (doCarrinho(a) ? a.nome : (opinioes[i] ?? null)));
  const conferir = achados
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => conferidos[i] === null && (!a.nome || !a.legivel));
  try {
    // 1 ou 2 sem opiniao nao valem uma rodada inteira: ficam vermelhos e a pessoa diz o nome.
    if (conferir.length >= 3) {
      const c = await canvasDe(x.src);
      const rc = await fetch("/api/prateleira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grade: grade(c, conferir.map(({ a }) => a.box)), n: conferir.length, nomes: x.nomes }),
      });
      const dc = (await rc.json().catch(() => null)) as { ok?: boolean; nomes?: string[] } | null;
      if (dc?.ok && dc.nomes) {
        conferidos = [...conferidos];
        conferir.forEach(({ i }, k) => (conferidos[i] = dc.nomes![k] ?? ""));
      }
    }
  } catch {
    /* sem conferencia: a cor fica so pela leitura e pela base */
  }
  trocar(x.id, { estado: "pronto", achados, conferidos, espera: undefined });
}

function processar() {
  for (const x of fila) {
    if (ativos.size >= AO_MESMO_TEMPO) return;
    if (x.estado !== "lendo" || ativos.has(x.id)) continue;
    ativos.add(x.id);
    void (async () => {
      try {
        if (x.espera && x.espera > Date.now()) await dormir(x.espera - Date.now());
        const atual = fila.find((y) => y.id === x.id);
        if (atual?.estado === "lendo") await ler(atual);
      } catch {
        // erro inesperado: avisa em vez de tentar de novo sem parar
        if (fila.some((y) => y.id === x.id)) trocar(x.id, { estado: "falhou", erro: "A IA não conseguiu ler a foto." });
      } finally {
        ativos.delete(x.id);
        processar();
      }
    })();
  }
}

// A pessoa escolheu a foto: prepara, guarda e ja libera a tela.
export async function enfileirarPrateleira(arquivo: File, destino: Destino, ctx: { nomes?: string[]; carrinho?: string[] } = {}) {
  carregar();
  const img = await abrir(arquivo);
  const c = desenhar(img, [0, 0, 1, 1], Math.min(LADO, Math.max(img.width, img.height)));
  const curva = realcar(c);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // As faixas saem da original logo DEPOIS de a foto inteira partir para a IA.
  faixasProntas.set(
    id,
    new Promise<{ r: Box; foto: string }[]>((ok) =>
      setTimeout(() => {
        try {
          ok(
            faixas(c.width, c.height).map((r) => {
              const p = desenhar(img, r, LADO);
              realcar(p, curva);
              return { r, foto: p.toDataURL("image/jpeg", QUALIDADE) };
            }),
          );
        } catch {
          ok([]);
        } finally {
          img.close();
        }
      }, 0),
    ),
  );
  mudar([...fila, { id, src: c.toDataURL("image/jpeg", QUALIDADE), destino, estado: "lendo", ...ctx }]);
  processar();
}

export function tentarDeNovo(id: string) {
  trocar(id, { estado: "lendo", erro: undefined, espera: undefined, tentativas: 0 });
  processar();
}

export const tirarJob = (id: string) => mudar(fila.filter((x) => x.id !== id));

const vazio: JobFoto[] = [];
export function useFilaPrateleira(): JobFoto[] {
  return useSyncExternalStore(
    (f) => {
      carregar();
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => fila,
    () => vazio,
  );
}
