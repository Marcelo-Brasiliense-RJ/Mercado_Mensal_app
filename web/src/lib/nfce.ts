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

// Chave de acesso (44 digitos) do QR ou do link da NFC-e, de qualquer estado: vem no
// parametro p=CHAVE|versao|... (ou chNFe=). E o que barra nota repetida com certeza.
export function chaveDoQr(texto: string): string {
  const t = decodeURIComponent(texto);
  const m = t.match(/[?&](?:p|chNFe|chave)=(\d{44})/i) ?? t.match(/(?:^|\D)(\d{44})(?:\D|$)/);
  return m ? m[1] : "";
}

const UFS: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI",
  "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
// Os dois primeiros digitos da chave sao o codigo IBGE do estado.
export const ufDaChave = (chave: string) => UFS[chave.slice(0, 2)] ?? "";

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

// Rota do proprio app primeiro (com o intermediario de IP brasileiro, se houver);
// a Edge Function antiga fica de reserva.
export async function invokeNfce(qrUrl: string): Promise<NfceResp> {
  try {
    const r = await fetch("/api/nfce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qr_url: qrUrl }),
    });
    const d = (await r.json().catch(() => null)) as NfceResp | null;
    if (d?.ok) return d;
    if (d && !d.ok && d.erro === "sefaz_bloqueou") return d;
  } catch {
    /* sem rede ou rota: tenta a Edge Function */
  }
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("nfce-consulta", {
    body: { qr_url: qrUrl },
  });
  if (error) return { ok: false, erro: "sefaz_indisponivel" };
  return data as NfceResp;
}
