"use client";

import { useEffect, useState } from "react";
import { casaBusca, ehDoItem, LOJAS, produtosHtml, produtosVtex, urlBusca, type Chip, type Loja, type Produto } from "@/lib/lojasOnline";

// Busca a vitrine Livelo. Lojas VTEX: direto do celular (liberam CORS), senao pela nossa
// rota. Carrefour: pelas paginas do site, lidas em /api/carrefour.
const diretoFalhou = new Set<string>();

type Args = { q?: string; fq?: string; categoria?: string; ate?: number };

// Cada busca fica guardada 30 min: por na lista um item novo so busca esse item, e nao a
// vitrine inteira de novo.
const guardadas = new Map<string, { em: number; p: Promise<Produto[]> }>();
function buscar(loja: Loja, args: Args, chip: Chip | null = null): Promise<Produto[]> {
  const k = JSON.stringify([loja.codigo, args.q, args.fq, args.categoria, args.ate, chip]);
  const g = guardadas.get(k);
  if (g && Date.now() - g.em < 30 * 60 * 1000) return g.p.then((ps) => ps.map((p) => ({ ...p })));
  const p = buscarAgora(loja, args, chip);
  guardadas.set(k, { em: Date.now(), p });
  p.then((ps) => !ps.length && guardadas.delete(k)).catch(() => guardadas.delete(k));
  return p.then((ps) => ps.map((x) => ({ ...x })));
}

async function buscarAgora(loja: Loja, args: Args, chip: Chip | null): Promise<Produto[]> {
  if (loja.paginas) {
    const p = new URLSearchParams();
    if (args.q) p.set("q", args.q);
    if (args.categoria) p.set("categoria", args.categoria);
    const r = await fetch(`/api/carrefour?${p}`);
    const d = (await r.json()) as { itens?: Parameters<typeof produtosHtml>[0] };
    return produtosHtml(d.itens ?? [], loja, chip);
  }
  if (!diretoFalhou.has(loja.codigo)) {
    try {
      const r = await fetch(urlBusca(loja, args), { signal: AbortSignal.timeout(8000) });
      if (r.ok || r.status === 206) return produtosVtex(await r.json(), loja, chip);
    } catch {
      /* CORS, rede ou bloqueio: vai pelo servidor */
    }
    diretoFalhou.add(loja.codigo);
  }
  const p = new URLSearchParams({ loja: loja.codigo, ate: String(args.ate ?? 23) });
  if (args.q) p.set("q", args.q);
  if (args.fq) p.set("fq", args.fq);
  const r = await fetch(`/api/loja-online?${p}`);
  return produtosVtex(r.ok ? await r.json() : [], loja, chip);
}

type Tarefa = { loja: Loja; q?: string; fq?: string; categoria?: string; ate: number; chip: Chip | null; item?: string };

export type Vitrine = {
  produtos: Produto[];
  daLista: Record<string, string>; // id do produto -> item da lista que ele atende
  carregando: boolean;
  lojasOk: string[]; // lojas que responderam alguma coisa
  progresso: number; // 0..1 enquanto carrega
};

// A vitrine fica guardada 30 min: voltar para a aba nao busca tudo de novo. E so aparece
// pronta (sem cartoes pulando de lugar enquanto carrega, o que gerava toque errado).
const MEIA_HORA = 30 * 60 * 1000;
const memo = new Map<string, { em: number; v: Vitrine }>();
const fresca = (chave: string) => {
  const m = memo.get(chave);
  return m && Date.now() - m.em < MEIA_HORA ? m.v : null;
};

export function useVitrine(itensLista: string[]): Vitrine {
  const chave = itensLista.slice(0, 12).join("|");
  const [v, setV] = useState<Vitrine>(
    () => fresca(chave) ?? { produtos: [], daLista: {}, carregando: true, lojasOk: [], progresso: 0 },
  );

  useEffect(() => {
    if (fresca(chave)) return;
    let vivo = true;
    const itens = chave ? chave.split("|") : [];
    const fila: Tarefa[] = [
      // Primeiro o que esta na lista: e o destaque
      ...itens.flatMap((item) =>
        LOJAS.filter((l) => l.tipo === "mercado").map((loja) => ({ loja, q: item, ate: 9, chip: null, item })),
      ),
      ...LOJAS.flatMap((loja): Tarefa[] =>
        loja.paginas
          ? Object.entries(loja.paginas).flatMap(([chip, slugs]) =>
              slugs.map((categoria) => ({ loja, categoria, ate: 0, chip: chip as Chip })),
            )
          : loja.categorias
            ? Object.entries(loja.categorias).flatMap(([chip, ids]) =>
                ids.map((id) => ({ loja, fq: `C:/${id}/`, ate: 7, chip: chip as Chip })),
              )
            : [{ loja, ate: 49, chip: null }],
      ),
    ];
    const vistos = new Map<string, Produto>();
    const daLista: Record<string, string> = {};
    const ok = new Set<string>();
    const total = fila.length;
    let pendentes = total;

    const publicar = () => {
      if (!vivo) return;
      if (pendentes > 0) return setV((x) => ({ ...x, carregando: !x.produtos.length, progresso: 1 - pendentes / total }));
      const pronta = { produtos: [...vistos.values()], daLista: { ...daLista }, carregando: false, lojasOk: [...ok], progresso: 1 };
      memo.set(chave, { em: Date.now(), v: pronta });
      setV(pronta);
    };
    const trabalhar = async () => {
      for (let t = fila.shift(); t; t = fila.shift()) {
        try {
          let ps = await buscar(t.loja, t, t.chip);
          if (ps.length) ok.add(t.loja.codigo);
          if (t.item) {
            const item = t.item;
            ps = ps.filter((p) => ehDoItem(p.nome, item)).sort((a, b) => a.preco - b.preco).slice(0, 2);
            for (const p of ps) {
              daLista[p.id] = item;
              p.chip ??= "mercado";
            }
          }
          for (const p of ps) if (!vistos.has(p.id) && p.chip) vistos.set(p.id, p);
        } catch {
          /* uma busca a menos */
        }
        pendentes -= 1;
        publicar();
      }
    };
    if (!fila.length) publicar();
    void Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
    return () => {
      vivo = false;
    };
  }, [chave]);

  return v;
}

// Busca da pessoa ("iogurte"): em todas as lojas, mais barato primeiro.
export function useBuscaLojas(termo: string): { produtos: Produto[]; carregando: boolean } {
  const [r, setR] = useState<{ termo: string; produtos: Produto[]; carregando: boolean }>({
    termo: "",
    produtos: [],
    carregando: false,
  });
  const t = termo.trim();
  useEffect(() => {
    if (t.length < 2) return;
    let vivo = true;
    const espera = setTimeout(() => {
      setR({ termo: t, produtos: [], carregando: true });
      let faltam = LOJAS.length;
      const achados: Produto[] = [];
      for (const loja of LOJAS) {
        void buscar(loja, { q: t, ate: 19 })
          .then((ps) => achados.push(...ps.filter((p) => casaBusca(p.nome, t))))
          .catch(() => {})
          .finally(() => {
            faltam -= 1;
            if (vivo) setR({ termo: t, produtos: [...achados].sort((a, b) => a.preco - b.preco), carregando: faltam > 0 });
          });
      }
    }, 450);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [t]);
  return t.length < 2 ? { produtos: [], carregando: false } : r.termo === t ? r : { produtos: [], carregando: true };
}
