"use client";

import { useState } from "react";
import Link from "next/link";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { BrandMark } from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { brl } from "@/lib/format";
import { stepFor } from "@/lib/defaults";

// Despensa de exemplo: o visitante mexe no produto antes de criar conta.
// Tudo em memoria, nenhuma chamada ao Supabase, e o estado morre no refresh.
// ponytail: useState e nada mais. Persistir em localStorage so se o dono pedir.
//
// Esta tela e laboratorio: o selo de tres estados (tem / acabando / acabou) vive
// SO aqui, por decisao registrada na secao 0.1 e no J4.7 do tarefas.md. O app
// autenticado segue no modelo numerico. Nao propague o selo para o StockView.

type Estado = "tem" | "acabando" | "acabou";
type Item = {
  nome: string;
  unidade: string;
  qtd: number;
  preco: number; // por unidade
  estado: Estado;
};

// Compra de mes de uma familia brasileira, com preco por unidade.
const INICIAL: Item[] = [
  { nome: "Arroz", unidade: "kg", qtd: 5, preco: 6.2, estado: "tem" },
  { nome: "Feijão", unidade: "kg", qtd: 2, preco: 8.9, estado: "tem" },
  { nome: "Leite", unidade: "L", qtd: 6, preco: 5.49, estado: "tem" },
  { nome: "Café", unidade: "pct", qtd: 1, preco: 18.9, estado: "acabando" },
  { nome: "Açúcar", unidade: "kg", qtd: 2, preco: 4.5, estado: "tem" },
  { nome: "Óleo", unidade: "L", qtd: 1, preco: 7.9, estado: "acabando" },
  { nome: "Macarrão", unidade: "pct", qtd: 4, preco: 4.2, estado: "tem" },
  { nome: "Ovos", unidade: "dz", qtd: 2, preco: 12.5, estado: "tem" },
  { nome: "Detergente", unidade: "un", qtd: 0, preco: 2.8, estado: "acabou" },
  { nome: "Papel higiênico", unidade: "pct", qtd: 1, preco: 26.9, estado: "acabando" },
];

const SELO: Record<Estado, { classe: string; texto: string; proximo: Estado }> = {
  tem: { classe: "bg-pos-soft text-pos", texto: "Tem", proximo: "acabando" },
  acabando: { classe: "bg-warn-soft text-warn", texto: "Acabando", proximo: "acabou" },
  acabou: { classe: "bg-neg-soft text-neg", texto: "Acabou", proximo: "tem" },
};

const num = (n: number) => String(+n.toFixed(2)).replace(".", ",");

export default function Exemplo() {
  const [items, setItems] = useState<Item[]>(INICIAL);
  const [mexeu, setMexeu] = useState(false);

  function muda(i: number, patch: Partial<Item>) {
    setMexeu(true);
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  const faltando = items.filter((i) => i.estado === "acabou");
  const total = items.reduce((a, i) => a + i.qtd * i.preco, 0);

  return (
    <div className="min-h-dvh bg-bg">
      {/* J4.2: nunca deixar parecer dado real */}
      <div className="sticky top-0 z-30 bg-brand px-4 py-2.5 text-center text-[13px] font-bold text-brand-ink">
        Despensa de exemplo. Crie sua conta para salvar a sua.
      </div>

      <header className="mx-auto flex w-full max-w-[720px] items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark size={36} radius={10} />
          <span className="text-[17px] font-extrabold">Despensa</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/entrar"
            className="flex h-[44px] items-center rounded-[12px] bg-brand px-4 text-[14px] font-bold text-brand-ink"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 pb-16">
        <h1 className="text-[24px] font-extrabold">Estoque</h1>
        <p className="mb-4 text-[13px] text-text-2">
          {items.length} itens · {brl(total)} em casa. Toque no selo para dizer como está,
          e nos botões para ajustar a quantidade.
        </p>

        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div
              key={it.nome}
              className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-[0_1px_3px_var(--shadow)]"
            >
              <AvatarInitial name={it.nome} size={44} />

              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{it.nome}</div>
                <div className="text-[13px] text-text-2">
                  {num(it.qtd)} {it.unidade} · {brl(it.qtd * it.preco)}
                </div>
              </div>

              {/* J4.6: o selo convive com o numero, nao substitui */}
              <button
                type="button"
                onClick={() => muda(i, { estado: SELO[it.estado].proximo })}
                aria-label={`${it.nome}: ${SELO[it.estado].texto}. Tocar para mudar.`}
                className={`h-[44px] shrink-0 rounded-full px-3 text-[12px] font-extrabold ${
                  SELO[it.estado].classe
                }`}
              >
                {SELO[it.estado].texto}
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    muda(i, { qtd: Math.max(0, +(it.qtd - stepFor(it.unidade)).toFixed(2)) })
                  }
                  disabled={it.qtd <= 0}
                  aria-label={`Menos ${it.nome}`}
                  className="grid h-[44px] w-[44px] place-items-center rounded-[12px] border border-border bg-card-2 text-[20px] font-bold disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => muda(i, { qtd: +(it.qtd + stepFor(it.unidade)).toFixed(2) })}
                  aria-label={`Mais ${it.nome}`}
                  className="grid h-[44px] w-[44px] place-items-center rounded-[12px] border border-border bg-card-2 text-[20px] font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2 className="mb-2 mt-8 text-[13px] font-extrabold uppercase tracking-wide text-text-3">
          Lista de compras ({faltando.length})
        </h2>
        {faltando.length === 0 ? (
          <p className="text-[14px] text-text-2">
            Nada faltando. Marque um item como &quot;Acabou&quot; e ele aparece aqui.
          </p>
        ) : (
          <div className="rounded-[16px] border border-border bg-card">
            {faltando.map((it, i) => (
              <div
                key={it.nome}
                className={`flex items-center justify-between px-4 py-3 text-[14px] ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="font-bold">{it.nome}</span>
                <span className="text-text-2">{brl(it.preco)} na última compra</span>
              </div>
            ))}
          </div>
        )}

        {/* J4.5: oferece a conta no contexto, depois de a pessoa ter mexido,
            e sem bloquear nada do que ela ainda quiser experimentar. */}
        {mexeu && (
          <div className="mt-8 rounded-[18px] border-[1.5px] border-brand bg-card p-5">
            <div className="mb-1 text-[16px] font-extrabold">
              Isto some quando você sair
            </div>
            <p className="mb-4 text-[14px] leading-relaxed text-text-2">
              Esta despensa é de exemplo. Crie a conta para guardar a sua, com a
              família junto e o registro por áudio no Telegram.
            </p>
            <Link
              href="/entrar"
              className="flex h-[50px] items-center justify-center rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              Criar minha conta
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}