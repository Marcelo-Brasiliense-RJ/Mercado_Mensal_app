"use client";

import { useEffect, useState } from "react";
import { produtoCasa } from "@/lib/comparar";
import { casaBusca, LOJAS, produtosVtex, urlBusca, type Chip, type Loja, type Produto } from "@/lib/lojasOnline";

// Busca a vitrine Livelo direto do celular (as lojas VTEX liberam CORS e o Carrefour
// bloqueia servidor). Se o celular nao conseguir, tenta pela nossa rota.
const diretoFalhou = new Set<string>();

async function buscar(loja: Loja, args: { q?: string; fq?: string; ate?: number }): Promise<unknown> {
  if (!diretoFalhou.has(loja.codigo)) {
    try {
      const r = await fetch(urlBusca(loja, args), { signal: AbortSignal.timeout(8000) });
      if (r.ok || r.status === 206) return await r.json();
    } catch {
      /* CORS, rede ou bloqueio: vai pelo servidor */
    }
    diretoFalhou.add(loja.codigo);
  }
  const p = new URLSearchParams({ loja: loja.codigo, ate: String(args.ate ?? 23) });
  if (args.q) p.set("q", args.q);
  if (args.fq) p.set("fq", args.fq);
  const r = await fetch(`/api/loja-online?${p}`);
  return r.ok ? await r.json() : [];
}

type Tarefa = { loja: Loja; q?: string; fq?: string; ate: number; chip: Chip | null; item?: string };

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
        loja.categorias
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
          let ps = produtosVtex(await buscar(t.loja, t), t.loja, t.chip);
          if (ps.length) ok.add(t.loja.codigo);
          if (t.item) {
            const item = t.item;
            ps = ps.filter((p) => produtoCasa(p.nome, item)).sort((a, b) => a.preco - b.preco).slice(0, 2);
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
          .then((d) => achados.push(...produtosVtex(d, loja).filter((p) => casaBusca(p.nome, t))))
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
