"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, ListIcon, ChartIcon, HeartIcon, TagIcon, CartIcon } from "@/components/ui/icons";
import { useModoMercado } from "@/lib/modoMercado";

const tabs = [
  { href: "/app/estoque", label: "Despensa", Icon: BoxIcon },
  { href: "/app/lista", label: "Lista", Icon: ListIcon },
  { href: "/app/ofertas", label: "Ofertas", Icon: TagIcon },
  { href: "/app/livelo", label: "Livelo", Icon: HeartIcon },
  { href: "/app/economia", label: "Gastos", Icon: ChartIcon },
];

export function TabBar({ className = "" }: { className?: string }) {
  const path = usePathname();
  // Modo mercado ligado (interruptor na Lista): a aba do carrinho aparece depois da Lista.
  const modoMercado = useModoMercado();
  // Dentro do Mercado a tela e so da compra: a barra dele (Voltar, total, Finalizar)
  // ocupa o lugar das abas, como num modo compra.
  if (path.startsWith("/app/mercado")) return null;
  const lista = modoMercado
    ? [tabs[0], tabs[1], { href: "/app/mercado", label: "Mercado", Icon: CartIcon }, ...tabs.slice(2)]
    : tabs;
  return (
    <nav
      data-abas
      // Barra flutuante em pilula: a aba ativa vira uma pilula laranja.
      className={`fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 flex h-[62px] gap-0.5 rounded-full bg-[var(--barra)] p-1.5 shadow-[0_10px_30px_var(--shadow-lg)] ${className}`}
    >
      {lista.map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            // Tocar na aba em que ja esta sobe a tela pro topo (como no iPhone).
            onClick={(e) => {
              if (!active || path !== href) return;
              e.preventDefault();
              document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`ic-toque relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-colors ${
              active ? "bg-[var(--barra-ativa)] text-[var(--barra-ativa-ink)]" : "text-white/60"
            }`}
          >
            {/* key: ao trocar de aba, o icone da aba nova "salta" uma vez */}
            <span key={String(active)} className={active ? "ic-pop" : ""}>
              <Icon size={20} />
            </span>
            <span className="max-w-full truncate px-0.5 text-[10px] font-bold leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
