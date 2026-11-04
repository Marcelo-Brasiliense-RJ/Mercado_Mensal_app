"use client";

import Link from "next/link";
import { brl } from "@/lib/format";
import { COR_LIVELO, maisBarato, pontuaNaLivelo, type Oferta } from "@/lib/ofertas";
import { paridadeDe, ptsCertos } from "@/lib/livelo";
import { lojaDe } from "@/lib/lojasOnline";
import { veredito } from "@/lib/veredito";
import { useLivelo } from "./useLivelo";
import { useBuscaLojas } from "./useVitrine";

// Ponte Ofertas -> Livelo (pedido do dono: as duas abas conversando). Buscou "arroz" em
// Ofertas: mostra o mais em conta online pela Livelo, ja comparado com o melhor encarte,
// e leva para a aba Livelo com a mesma busca.
export function LiveloNaBusca({ termo, achados }: { termo: string; achados: Oferta[] }) {
  const lv = useLivelo();
  const b = useBuscaLojas(termo);
  const valorPonto = lv?.valor_ponto || 0.03;
  const melhor = b.produtos
    .map((p) => {
      const loja = lojaDe(p.loja)!;
      const par = lv ? paridadeDe(lv, loja.codigo) : undefined;
      const pts = Math.round(p.preco * (par ? ptsCertos(par, lv!.clube) : loja.ptsPadrao));
      return { p, loja, pts, liquido: p.preco - pts * valorPonto };
    })
    .sort((x, y) => x.liquido - y.liquido)[0];
  if (b.carregando || !melhor) return null;
  const encarte = achados.filter((o) => !pontuaNaLivelo(o.mercado)).sort(maisBarato)[0] ?? null;
  const ver = veredito(melhor.p.preco, melhor.pts, valorPonto, encarte?.preco_por ?? null);
  return (
    <Link
      href={`/app/livelo?q=${encodeURIComponent(termo.trim())}`}
      className="flex items-center gap-3 rounded-[18px] border-2 bg-card p-3"
      style={{ borderColor: COR_LIVELO }}
    >
      {melhor.p.foto && (
        // eslint-disable-next-line @next/next/no-img-element -- foto do proprio site da loja
        <img src={melhor.p.foto} alt="" className="h-14 w-14 shrink-0 rounded-[12px] bg-white object-contain" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-extrabold" style={{ color: COR_LIVELO }}>
          💗 Na Livelo · {melhor.loja.nome}
        </span>
        <span className="block truncate text-[13px] font-bold">{melhor.p.nome}</span>
        <span className="block text-[14px] font-extrabold">
          {brl(melhor.p.preco)} <span style={{ color: COR_LIVELO }}>+{melhor.pts} pts</span>
        </span>
        <span className={`block text-[12px] font-extrabold ${ver.tipo === "livelo" ? "text-[#166534]" : "text-text-2"}`}>
          {ver.tipo === "livelo"
            ? `✅ Vale mais que o encarte (${brl(encarte!.preco_por)})`
            : ver.tipo === "mercado"
              ? `🏪 O encarte sai ${brl(ver.diferenca)} mais barato`
              : "ganha pontos comprando online"}
        </span>
      </span>
      <span className="text-[20px] text-text-3">›</span>
    </Link>
  );
}
