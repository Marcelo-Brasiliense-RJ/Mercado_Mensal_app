"use client";

import { useEffect, useState } from "react";
import { casaBusca, ehDoItem, LOJAS, produtosHtml, produtosVtex, urlBusca, type Chip, type Loja, type Produto } from "@/lib/lojasOnline";

// Busca a vitrine Livelo. Lojas VTEX: direto do celular (liberam CORS), senao pela nossa
// rota. Carrefour: pelas paginas do site, lidas em /api/carrefour.
const diretoFalhou = new Set<string>();

type Args = { q?: string; fq?: string; categoria?: string; ate?: number };

async function buscar(loja: Loja, args: Args, chip: Chip | null = null): Promise<Produto[]> {
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
};

export function useVitrine(itensLista: string[]): Vitrine {
  const [v, setV] = useState<Vitrine>({ produtos: [], daLista: {}, carregando: true, lojasOk: [] });
  const chave = itensLista.slice(0, 12).join("|");

  useEffect(() => {
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
    let pendentes = fila.length;

    const publicar = () => {
      if (vivo)
        setV({ produtos: [...vistos.values()], daLista: { ...daLista }, carregando: pendentes > 0, lojasOk: [...ok] });
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
