"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useOfertas } from "@/components/ofertas/useOfertas";
import { MeusMercadosModal } from "@/components/ofertas/MeusMercados";
import { BudgetModal } from "@/components/economia/BudgetModal";
import { estadoPush, ligarPush, type EstadoPush } from "@/lib/push";
import { atualizarLugar, useLugar } from "@/lib/lugar";

// "Falta configurar", na tela inicial: tudo que ainda nao foi preenchido ou ligado e
// faz o app trabalhar sozinho, cada um com o botao que resolve ali mesmo. Antes isso
// ficava escondido nos Ajustes e ninguem ia la. Some quando nao falta nada; "Agora
// nao" tira um item da frente (lembrado neste aparelho), sem sumir dos Ajustes.
const MINIMO_ESTOQUE = 5;
const CHAVE = "pendencias_dispensadas";
const FECHADO = "pendencias_fechado"; // recolhido: so o titulo, para o estoque vir logo

type Item = { id: string; titulo: string; texto: string; acao: React.ReactNode };

function lerDispensados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function PrimeirosPassos({ onFalar, onDigitar }: { onFalar: () => void; onDigitar: () => void }) {
  const { stock, budget, dataReady, showToast } = useStore();
  const ofertas = useOfertas();
  const lugar = useLugar();
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [mercados, setMercados] = useState(false);
  const [orcamento, setOrcamento] = useState(false);
  const [dispensados, setDispensados] = useState<string[]>(() => (typeof window === "undefined" ? [] : lerDispensados()));
  const [ligando, setLigando] = useState(false);
  const [fechado, setFechado] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem(FECHADO) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    estadoPush().then(setPush, () => setPush("sem-suporte"));
  }, []);

  // so na primeira carga: recarregar por tras (um +1 no card) nao pode sumir com o quadro
  if (ofertas.fase === "carregando" || !dataReady || push == null) return null;

  const btn = "h-9 shrink-0 rounded-xl bg-brand px-3.5 text-[13px] font-bold text-brand-ink disabled:opacity-50";
  const btn2 = "h-9 shrink-0 rounded-xl border-2 border-brand px-3 text-[13px] font-bold text-brand";
  const itens: Item[] = [];

  if (ofertas.fase === "ok" && !ofertas.dados.meus_mercados?.length)
    itens.push({
      id: "mercados",
      titulo: "🏪 Onde você compra?",
      texto: "Escolha seus mercados: as ofertas ficam só deles.",
      acao: <button onClick={() => setMercados(true)} className={btn}>Escolher</button>,
    });

  if (stock.length < MINIMO_ESTOQUE)
    itens.push({
      id: "estoque",
      titulo: "🏠 O que tem em casa?",
      texto: stock.length
        ? `${stock.length} ${stock.length > 1 ? "itens" : "item"} até agora. Fale ou digite o resto.`
        : "Abra a despensa e fale o que tem: “três arroz, dois feijão”.",
      acao: (
        <div className="flex gap-2">
          <button onClick={onFalar} className={btn}>Falar</button>
          <button onClick={onDigitar} className={btn2}>Digitar</button>
        </div>
      ),
    });

  if (!(budget.total > 0))
    itens.push({
      id: "orcamento",
      titulo: "💰 Orçamento do mês",
      texto: "Diga quanto quer gastar e a Economia avisa se passar.",
      acao: <button onClick={() => setOrcamento(true)} className={btn}>Definir</button>,
    });

  if (push === "desligado")
    itens.push({
      id: "aviso",
      titulo: "🔔 Aviso no celular",
      texto: "Saber na hora quando um produto De olho entrar em promoção.",
      acao: (
        <button
          disabled={ligando}
          onClick={async () => {
            setLigando(true);
            const r = await ligarPush();
            setLigando(false);
            if (!r.ok) return showToast(r.erro);
            setPush("ligado");
            showToast("🔔 Aviso ligado");
          }}
          className={btn}
        >
          {ligando ? "Ligando…" : "Ligar"}
        </button>
      ),
    });
  else if (push === "instalar")
    itens.push({
      id: "aviso",
      titulo: "🔔 Aviso no celular",
      texto: "No iPhone: Compartilhar ⬆️ → Adicionar à Tela de Início, e abra o app pelo ícone.",
      acao: null,
    });
  else if (push === "negado")
    itens.push({
      id: "aviso",
      titulo: "🔕 Aviso bloqueado",
      texto: "Ajustes do celular → Notificações → Despensa → Permitir.",
      acao: null,
    });

  if (lugar.permitido === "perguntar")
    itens.push({
      id: "local",
      titulo: "📍 Localização",
      texto: "No mercado, o que você ler já entra no carrinho com o preço de lá.",
      acao: <button onClick={() => atualizarLugar(true)} className={btn}>Ligar</button>,
    });
  else if (lugar.permitido === "nao")
    itens.push({
      id: "local",
      titulo: "📍 Localização bloqueada",
      texto: "Ajustes do celular → Privacidade → Localização → Despensa.",
      acao: null,
    });

  const pendentes = itens.filter((i) => !dispensados.includes(i.id));
  if (!pendentes.length) return null;

  function agoraNao(id: string) {
    const n = [...dispensados, id];
    setDispensados(n);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(n));
    } catch {
      // sem armazenamento: volta a aparecer na proxima visita
    }
  }

  function alternar() {
    const n = !fechado;
    setFechado(n);
    try {
      localStorage.setItem(FECHADO, n ? "1" : "0");
    } catch {
      // sem armazenamento: so vale nesta visita
    }
  }

  return (
    <div className="rounded-2xl border border-brand/40 bg-brand-soft px-3.5 py-2.5">
      <button type="button" onClick={alternar} aria-expanded={!fechado} className="flex min-h-9 w-full items-center justify-between gap-3 text-left">
        <div className="text-[15px] font-extrabold">⚙️ Falta configurar</div>
        <div className="flex items-center gap-2">
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-[12px] font-extrabold text-brand-ink">
            {pendentes.length}
          </span>
          <span className={`text-[16px] text-brand transition-transform ${fechado ? "" : "rotate-180"}`} aria-hidden>⌄</span>
        </div>
      </button>
      {!fechado && (
        <div className="mt-2 flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-card">
          {pendentes.map((i) => (
            <div key={i.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-extrabold">{i.titulo}</div>
                {/* Sem botao, o texto e a instrucao: so ai ele aparece. */}
                {!i.acao && <div className="text-[12px] leading-snug text-text-2">{i.texto}</div>}
              </div>
              {i.acao}
              <button
                onClick={() => agoraNao(i.id)}
                aria-label={`Agora não: ${i.titulo}`}
                className="grid h-9 w-8 shrink-0 place-items-center text-[18px] leading-none text-text-3"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {mercados && <MeusMercadosModal onClose={() => setMercados(false)} />}
      <BudgetModal open={orcamento} onClose={() => setOrcamento(false)} />
    </div>
  );
}
