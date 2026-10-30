"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { categoriaDe, ICONE } from "@/lib/categorias";
import { CORREDOR, type Oferta } from "@/lib/ofertas";

// Categorias do estoque da casa (0049), na ordem dela. Sem a 0049 ou enquanto carrega,
// as 14 padrao (as mesmas dos encartes): nada quebra.
export type Categoria = { nome: string; icone: string };
export const PADRAO: Categoria[] = CORREDOR.map((nome) => ({ nome, icone: ICONE[nome] ?? "🛒" }));

let lista: Categoria[] = PADRAO;
let carregado = false;
const ouvintes = new Set<() => void>();
const definir = (l: Categoria[]) => {
  lista = l.length ? l : PADRAO;
  ouvintes.forEach((f) => f());
};

async function carregar(forcar = false) {
  if (carregado && !forcar) return;
  carregado = true;
  const { data, error } = await createClient().rpc("mercado_categorias_web");
  const r = data as { ok?: boolean; categorias?: Categoria[] } | null;
  if (!error && r?.ok && r.categorias) definir(r.categorias);
}

export function useCategorias(): Categoria[] {
  const v = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => lista,
    () => PADRAO,
  );
  useEffect(() => {
    void carregar();
  }, []);
  return v;
}

// [{nome, icone, antigo}] na ordem: antigo diferente do nome = renomeada (itens vao junto).
export async function salvarCategorias(nova: (Categoria & { antigo?: string })[]): Promise<string | null> {
  const { data, error } = await createClient().rpc("mercado_categorias_salvar_web", { p_lista: nova });
  const r = data as { ok?: boolean; erro?: string; categorias?: Categoria[] } | null;
  if (error || !r?.ok) {
    const e = r?.erro;
    return e === "nome_repetido" ? "Tem duas categorias com o mesmo nome." : e === "nome_invalido" ? "Toda categoria precisa de nome." : "Não deu para salvar. Tente de novo.";
  }
  definir(r.categorias ?? PADRAO);
  return null;
}

// Categoria do item na casa: a escolhida (se ainda existe), senao o palpite pelo nome,
// senao Outros (a casa pode ter excluido a categoria do palpite).
export function categoriaDoItem(item: { name: string; category?: string }, cats: Categoria[], ofertas: Oferta[] = []): string {
  const tem = (c: string) => cats.some((x) => x.nome === c);
  if (item.category && tem(item.category)) return item.category;
  const palpite = categoriaDe(item.name, ofertas);
  return tem(palpite) ? palpite : "Outros";
}

export const iconeDe = (cats: Categoria[], nome: string) => cats.find((c) => c.nome === nome)?.icone ?? ICONE[nome] ?? "🛒";
