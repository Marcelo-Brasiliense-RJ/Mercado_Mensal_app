// Gestos de app de celular: arrastar pro lado troca de aba; fora das abas
// (ex.: Ajustes), arrastar da esquerda pra direita volta a tela.
// Aqui fica so a decisao (pura, testavel). O toque em si fica no AppShell.

export const ABAS = ["/app/estoque", "/app/lista", "/app/ofertas", "/app/livelo", "/app/economia"];

// Com o modo mercado ligado, a aba do carrinho entra logo depois da Lista.
export const MERCADO = "/app/mercado";
export function abasCom(modoMercado: boolean): string[] {
  return modoMercado ? [ABAS[0], ABAS[1], MERCADO, ...ABAS.slice(2)] : ABAS;
}

export function indiceAba(path: string, abas: string[] = ABAS): number {
  return abas.findIndex((h) => path.startsWith(h));
}

export type Destino = { tipo: "aba"; href: string; dir: 1 | -1 } | { tipo: "voltar" } | null;

// dx < 0 = dedo foi pra esquerda (proxima aba); dx > 0 = pra direita (anterior / voltar).
export function destinoDoGesto(path: string, dx: number, abas: string[] = ABAS): Destino {
  const i = indiceAba(path, abas);
  if (i < 0) return dx > 0 ? { tipo: "voltar" } : null;
  const j = dx < 0 ? i + 1 : i - 1;
  if (j < 0 || j >= abas.length) return null;
  return { tipo: "aba", href: abas[j], dir: dx < 0 ? 1 : -1 };
}

// Arrasto valeu? Longo o bastante, ou rapido (um "peteleco").
export function gestoValeu(dx: number, ms: number, largura: number): boolean {
  const ad = Math.abs(dx);
  if (ad >= Math.min(110, largura * 0.28)) return true;
  return ad >= 40 && ad / Math.max(ms, 1) > 0.45;
}

// Direcao da animacao ao trocar de tela (toque na aba tambem anima).
// 1 = nova tela entra pela direita; -1 = pela esquerda; 0 = sem animacao.
export function direcaoTroca(de: string, para: string, abas: string[] = ABAS): 1 | -1 | 0 {
  if (de === para) return 0;
  const a = indiceAba(de, abas);
  const b = indiceAba(para, abas);
  if (a >= 0 && b >= 0) return b > a ? 1 : -1;
  if (a >= 0 && b < 0) return 1; // entrou numa tela (Ajustes)
  if (a < 0 && b >= 0) return -1; // voltou dela
  return 0;
}
