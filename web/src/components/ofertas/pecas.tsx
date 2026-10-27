"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { corMercado, nomeMercado, porUnidade, type Oferta } from "@/lib/ofertas";
import { ICONE } from "@/lib/categorias";

// Pecas pequenas da aba Ofertas, usadas pela grade e pela lista De olho.
export function Selo({ mercado }: { mercado: string }) {
  return (
    <span
      className="inline-block shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
      style={{ background: corMercado(mercado) }}
    >
      {nomeMercado(mercado)}
    </span>
  );
}


export function Foto({ o, src, className = "" }: { o?: Oferta | null; src?: string; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  const url = src ?? (o?.tem_foto ? `/api/oferta-foto?id=${o.id}` : null);
  if (!url || falhou) {
    return (
      <div className={`grid shrink-0 place-items-center bg-card-2 text-[30px] ${className}`} aria-hidden>
        {(o && ICONE[o.categoria]) ?? "🛒"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 3 KB servida pela nossa rota
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFalhou(true)}
      className={`shrink-0 bg-white object-contain ${className}`}
    />
  );
}

export function PorUnidade({ o }: { o: Oferta }) {
  const u = porUnidade(o);
  return u ? <div className="text-[11px] text-text-2">{brl(u.valor)}/{u.u}</div> : null;
}

