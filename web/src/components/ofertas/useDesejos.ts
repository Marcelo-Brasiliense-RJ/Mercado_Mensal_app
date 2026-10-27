"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Desejo } from "@/lib/ofertas";

// Lista "De olho" (0039), compartilhada pela tela inteira: a estrela de cada card e a
// secao do topo leem o mesmo estado, entao marcar num lugar acende no outro na hora.
// null = ainda carregando ou migration nao aplicada (a secao some, sem erro).
let desejos: Desejo[] | null = null;
let carregando = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const definir = (d: Desejo[] | null) => {
  desejos = d;
  avisar();
};

async function carregar() {
  if (carregando || desejos) return;
  carregando = true;
  const { data, error } = await createClient().rpc("mercado_desejos_web");
  carregando = false;
  const r = data as { ok: boolean; desejos: Desejo[] } | null;
  if (!error && r?.ok) definir(r.desejos);
}

export function useDesejos() {
  const lista = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => desejos,
    () => null,
  );
  useEffect(() => {
    carregar();
  }, []);
  return lista;
}

export async function salvarDesejo(termo: string, nome: string, oferta?: number): Promise<Desejo | null> {
  const { data, error } = await createClient().rpc("mercado_desejo_salvar_web", {
    p_termo: termo,
    p_nome: nome,
    p_oferta: oferta ?? null,
  });
  const r = data as { ok: boolean; desejo: Desejo } | null;
  if (error || !r?.ok) return null;
  definir([r.desejo, ...(desejos ?? []).filter((d) => d.id !== r.desejo.id)]);
  return r.desejo;
}

export async function removerDesejo(id: number): Promise<boolean> {
  const antes = desejos;
  definir((desejos ?? []).filter((d) => d.id !== id)); // some na hora; volta se falhar
  const { data, error } = await createClient().rpc("mercado_desejo_remover_web", { p_id: id });
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    definir(antes);
    return false;
  }
  return true;
}
