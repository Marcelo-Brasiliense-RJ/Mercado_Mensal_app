"use client";

import { useSyncExternalStore } from "react";
import { enfileirarFoto, type Destino } from "./filaFotos";
import { juntarIguais, limpar, mesmoProduto, faixas, paraFoto, precisaFaltou, somarNovos, unidadesDe, type Achado, type Box } from "./prateleira";

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
  void processar();
}

// ---- imagem ----

const LADO = 1600; // px do lado maior: nitido para ler rotulo, leve para subir no 4G

export async function prepararFoto(arquivo: File): Promise<HTMLCanvasElement> {
  // imageOrientation: a foto do iPhone vem deitada no arquivo; aqui ela ja fica de pe,
  // e e ESSA que vai para a IA e para a tela (os quadrados batem nas duas).
  const img = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const k = Math.min(1, LADO / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

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
function pedaco(c: HTMLCanvasElement, r: Box): string {
  const sx = r[1] * c.width;
  const sy = r[0] * c.height;
  const sw = (r[3] - r[1]) * c.width;
  const sh = (r[2] - r[0]) * c.height;
  const k = Math.min(2, LADO / Math.max(sw, sh));
  const p = document.createElement("canvas");
  p.width = Math.round(sw * k);
  p.height = Math.round(sh * k);
  p.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, p.width, p.height);
  return p.toDataURL("image/jpeg", 0.85);
}

// Busca nas tres faixas com zoom, AO MESMO TEMPO que a foto inteira (nao soma tempo).
// Faixa que pegou limite por minuto tenta mais uma vez; falhou de novo, fica sem ela
// (nunca derruba a foto). carrinho: alguma faixa viu carrinho de mercado.
async function buscarNasFaixas(x: JobFoto): Promise<{ itens: Achado[]; carrinho: boolean }> {
  try {
    const c = await canvasDe(x.src);
    const pedir = async (foto: string) => {
      const res = await fetch("/api/prateleira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foto, nomes: x.nomes }),
      }).catch(() => null);
      return (await res?.json().catch(() => null)) as { ok?: boolean; itens?: Achado[]; carrinho?: boolean; erro?: string; espera?: number } | null;
    };
    const partes = await Promise.all(
      faixas(c.width, c.height).map(async (r, k) => {
        const foto = pedaco(c, r);
        let d = await pedir(foto);
        if (d?.erro === "limite" && (d.espera ?? 99) <= 20) {
          await dormir(((d.espera ?? 5) + k) * 1000);
          d = await pedir(foto);
        }
        return d?.ok ? { itens: limpar(d.itens ?? []).map((a) => ({ ...a, box: paraFoto(a.box, r) })), carrinho: !!d.carrinho } : { itens: [], carrinho: false };
      }),
    );
    return { itens: partes.flatMap((p) => p.itens), carrinho: partes.some((p) => p.carrinho) };
  } catch {
    return { itens: [], carrinho: false };
  }
}

async function arquivoDe(src: string): Promise<File> {
  const b = await (await fetch(src)).blob();
  return new File([b], "produto.jpg", { type: "image/jpeg" });
}

// ---- trabalho em segundo plano ----

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
let rodando = false;

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
  let achados = limpar(d.itens);
  let carrinho = !!d.carrinho;
  // Produto unico de perto: as faixas so cortariam ele em pedacos.
  if (precisaFaltou(achados)) {
    trocar(x.id, { etapa: "faltou", achados: juntarIguais(achados) });
    const f = await faixasP;
    achados = somarNovos(achados, f.itens);
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

  // Conferencia: o recorte de cada quadrado e lido de novo. Falhou? Segue sem ela.
  // O que ja estava no carrinho nao e conferido de novo (economiza a IA).
  let conferidos: (string | null)[] = achados.map(() => null);
  const conferir = achados
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !(a.legivel && (x.carrinho ?? []).some((n) => mesmoProduto(n, a.nome))));
  try {
    if (conferir.length) {
      const c = await canvasDe(x.src);
      const rc = await fetch("/api/prateleira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grade: grade(c, conferir.map(({ a }) => a.box)), n: conferir.length, nomes: x.nomes }),
      });
      const dc = (await rc.json().catch(() => null)) as { ok?: boolean; nomes?: string[] } | null;
      if (dc?.ok && dc.nomes) {
        conferidos = achados.map((a) => a.nome); // do carrinho: confere com ele mesmo
        conferir.forEach(({ i }, k) => (conferidos[i] = dc.nomes![k] ?? ""));
      }
    }
  } catch {
    /* sem conferencia: a cor fica so pela leitura e pela base */
  }
  trocar(x.id, { estado: "pronto", achados, conferidos, espera: undefined });
}

async function processar() {
  if (rodando) return;
  rodando = true;
  try {
    for (;;) {
      const x = fila.find((y) => y.estado === "lendo");
      if (!x) break;
      if (x.espera && x.espera > Date.now()) await dormir(x.espera - Date.now());
      await ler(fila.find((y) => y.id === x.id) ?? x);
    }
  } finally {
    rodando = false;
  }
}

// A pessoa escolheu a foto: prepara, guarda e ja libera a tela.
export async function enfileirarPrateleira(arquivo: File, destino: Destino, ctx: { nomes?: string[]; carrinho?: string[] } = {}) {
  carregar();
  const c = await prepararFoto(arquivo);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  mudar([...fila, { id, src: c.toDataURL("image/jpeg", 0.85), destino, estado: "lendo", ...ctx }]);
  void processar();
}

export function tentarDeNovo(id: string) {
  trocar(id, { estado: "lendo", erro: undefined, espera: undefined, tentativas: 0 });
  void processar();
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
