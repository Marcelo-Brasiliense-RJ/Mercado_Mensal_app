import { createClient } from "@/lib/supabase/client";

// Cliente do fluxo de import de nota por QR (NFC-e RJ). Chama a Edge Function
// nfce-consulta e mapeia a resposta para as linhas da tela de revisao.

export type NfceItem = {
  nome: string;
  marca: string;
  qtd: number;
  preco: number;
  unidade: string;
  desc_fiscal: string;
};

export type NfceResp =
  | {
      ok: true;
      chave: string;
      emitente: string;
      total_nota: number;
      total_itens: number;
      total_confere: boolean;
      itens: NfceItem[];
    }
  | { ok: false; erro: string };

export type ReviewRow = {
  nome: string;
  marca: string;
  qty: number;
  price: number;
  unit: string;
  desc: string;
};

export function isRjQrUrl(url: string): boolean {
  return /consultadfe\.fazenda\.rj\.gov\.br\/consultaNFCe/i.test(url);
}

export function toReviewRows(resp: NfceResp): ReviewRow[] {
  if (!resp.ok) return [];
  return resp.itens.map((it) => ({
    nome: it.nome,
    marca: it.marca,
    qty: it.qtd,
    price: it.preco,
    unit: it.unidade,
    desc: it.desc_fiscal,
  }));
}

export async function invokeNfce(qrUrl: string): Promise<NfceResp> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("nfce-consulta", {
    body: { qr_url: qrUrl },
  });
  if (error) return { ok: false, erro: "sefaz_indisponivel" };
  return data as NfceResp;
}
