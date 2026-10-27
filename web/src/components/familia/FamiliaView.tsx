"use client";

import { useEffect, useState } from "react";
import { TelegramIcon } from "@/components/ui/icons";
import { brl } from "@/lib/format";
import { corMercado, nomeMercado } from "@/lib/ofertas";
import { carregarMeusMercados } from "@/lib/mercadosCasa";
import { atualizarLugar, esquecerMercado, mercadosAprendidos, useLugar, type Ponto } from "@/lib/lugar";
import { useTheme } from "@/theme/useTheme";
import { MeusMercadosModal } from "@/components/ofertas/MeusMercados";
import { AvisoCelular } from "@/components/ofertas/DeOlho";
import { BudgetModal } from "@/components/economia/BudgetModal";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { useHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/client";
import { BOT_HANDLE, botDeepLink } from "@/lib/config";

const cardCls =
  "rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_12px_var(--shadow)] lg:p-[22px]";
const secao = "mb-2 mt-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-text-3";
const btn2 = "h-11 rounded-[12px] border border-border bg-card-2 px-4 text-[14px] font-bold";

// Ajustes do app, na ordem em que a pessoa precisa: a casa (familia e onde compra),
// o que o app faz sozinho (avisos, localizacao), o dinheiro (orcamento) e o resto.

export function FamiliaView() {
  const { household, reload } = useHousehold();
  const { showToast, budget } = useStore();
  const { theme, toggle } = useTheme();
  const lugar = useLugar();
  const [mercados, setMercados] = useState<string[] | null>(null);
  const [mercadosAberto, setMercadosAberto] = useState(false);
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);
  const [pontos, setPontos] = useState<Ponto[]>(() => (typeof window === "undefined" ? [] : mercadosAprendidos()));
  // recarrega ao fechar a escolha de mercados
  useEffect(() => {
    if (!mercadosAberto) carregarMeusMercados().then((m) => setMercados(m?.escolhidos ?? []));
  }, [mercadosAberto]);
  const [trocar, setTrocar] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // O gate garante que household existe antes de montar esta tela.
  const family = household!;

  async function copy() {
    try {
      await navigator.clipboard.writeText(family.invite_code);
      showToast("Código copiado");
    } catch {}
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Despensa",
          text: `Entre na nossa família na Despensa com o código ${family.invite_code}`,
        });
        return;
      } catch {}
    }
    copy();
  }

  async function trocarFamilia() {
    setErro(null);
    const c = novoCodigo.trim().toUpperCase();
    if (c.length < 4) return setErro("Informe o código.");
    setLoading(true);
    const { data, error } = await createClient().rpc("mercado_join_family_web", {
      p_code: c,
    });
    setLoading(false);
    if (error) return setErro("Não foi possível trocar. Tente novamente.");
    if (!data?.ok) return setErro("Código inválido. Confira e tente de novo.");
    showToast(`Você entrou na família ${data.familia}`);
    setTrocar(false);
    setNovoCodigo("");
    await reload();
  }

  async function sair() {
    await createClient().auth.signOut();
    // Reload completo: limpa o estado do cliente e o proxy ja ve sem sessao.
    window.location.assign("/entrar");
  }

  return (
    <div className="lg:max-w-[720px]">
      <ScreenHeader title="Ajustes" subtitle="da família e do app" />

      <div className="space-y-3">
        <div className={secao}>Sua casa</div>
        {/* Familia e convite */}
        <div className={cardCls}>
          <div className="mb-4 text-[20px] font-extrabold">{family.familia}</div>
          <div className="mb-2 text-xs font-bold text-text-2">Código para convidar quem mora com você</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[12px] bg-brand-soft px-5 py-3 font-mono text-[24px] font-extrabold tracking-[0.18em] text-brand">
              {family.invite_code}
            </div>
            <button onClick={copy} className={`${btn2} h-12`}>
              Copiar
            </button>
            <button onClick={share} className={`${btn2} h-12`}>
              Compartilhar
            </button>
          </div>
          <p className="mt-3 text-[12px] leading-snug text-text-3">
            Quem entrar com esse código vê e mexe no mesmo estoque, lista e economia. Outra casa? Ela cria a família
            dela no cadastro.
          </p>
        </div>

        {/* Onde compra */}
        <div className={cardCls}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[16px] font-extrabold">🏪 Onde você compra</div>
              <div className="text-[13px] text-text-2">Ofertas, De olho e avisos mostram só estes.</div>
            </div>
            <button onClick={() => setMercadosAberto(true)} className={`${btn2} shrink-0`}>
              Trocar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {mercados == null ? null : mercados.length ? (
              mercados.map((m) => (
                <span
                  key={m}
                  className="rounded-full px-3 py-1 text-[13px] font-extrabold text-white"
                  style={{ background: corMercado(m) }}
                >
                  {nomeMercado(m)}
                </span>
              ))
            ) : (
              <span className="text-[13px] font-bold text-warn">Nenhum escolhido: aparecem todos os mercados.</span>
            )}
          </div>
        </div>

        <div className={secao}>O que o app faz sozinho</div>
        {/* Avisos no celular */}
        <div className={cardCls}>
          <div className="text-[16px] font-extrabold">🔔 Aviso no celular</div>
          <div className="mb-3 text-[13px] text-text-2">
            Quando um produto De olho entrar em promoção nos seus mercados.
          </div>
          <AvisoCelular />
        </div>

        {/* Localizacao */}
        <div className={cardCls}>
          <div className="text-[16px] font-extrabold">📍 Localização</div>
          <div className="text-[13px] text-text-2">
            Dentro de um mercado que você já usou, o que você ler ou falar entra no carrinho e o preço vem de lá. Fica só
            neste celular.
          </div>
          <div className="mt-3 text-[14px] font-bold">
            {lugar.permitido === "sim"
              ? lugar.noMercado
                ? `✅ Ligada · agora no ${lugar.mercado ? nomeMercado(lugar.mercado) : "mercado"}`
                : "✅ Ligada"
              : lugar.permitido === "nao"
                ? "🔕 Bloqueada: Ajustes do celular → Privacidade → Localização → Despensa."
                : lugar.permitido === "sem"
                  ? "Este aparelho não tem localização."
                  : "Desligada"}
          </div>
          {lugar.permitido === "perguntar" && (
            <button onClick={() => atualizarLugar(true)} className="mt-2 h-11 rounded-[12px] bg-brand px-4 text-[14px] font-bold text-brand-ink">
              Ligar localização
            </button>
          )}
          {pontos.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-bold text-text-2">Mercados que o app já reconhece</div>
              <div className="divide-y divide-border rounded-[14px] border border-border">
                {pontos.map((p, i) => (
                  <div key={`${p.lat},${p.lng}`} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-[14px] font-bold">
                      {p.nome ?? "Mercado sem nome"}
                      <span className="ml-1.5 text-[12px] font-normal text-text-3">{p.n} {p.n > 1 ? "itens" : "item"}</span>
                    </span>
                    <button
                      onClick={() => {
                        esquecerMercado(i);
                        setPontos(mercadosAprendidos());
                        showToast(`${p.nome ?? "Mercado"} esquecido`);
                      }}
                      className="h-9 px-2 text-[13px] font-bold text-text-2 underline"
                    >
                      Esquecer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={secao}>Dinheiro</div>
        <div className={cardCls}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-extrabold">💰 Orçamento do mês</div>
              <div className="text-[13px] text-text-2">
                {budget.total > 0 ? `${brl(budget.total)} por mês` : "Sem orçamento: a Economia não avisa se passar."}
              </div>
            </div>
            <button onClick={() => setOrcamentoAberto(true)} className={`${btn2} shrink-0`}>
              {budget.total > 0 ? "Mudar" : "Definir"}
            </button>
          </div>
        </div>

        <div className={secao}>App</div>
        <div className={cardCls}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-extrabold">{theme === "dark" ? "🌙" : "☀️"} Aparência</div>
              <div className="text-[13px] text-text-2">{theme === "dark" ? "Escura" : "Clara"}</div>
            </div>
            <button onClick={toggle} className={`${btn2} shrink-0`}>
              {theme === "dark" ? "Usar clara" : "Usar escura"}
            </button>
          </div>
        </div>

        {/* Conectar Telegram */}
        <div className={cardCls}>
          <div className="mb-1.5 text-[16px] font-extrabold">Telegram</div>
          <div className="mb-4 text-[14px] leading-relaxed text-text-2">
            Registrar compras por áudio no bot <span className="font-bold text-text">{BOT_HANDLE}</span>. Ele já
            vem com o código da sua família.
          </div>
          <a
            href={botDeepLink(family.invite_code)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#2AABEE] px-[22px] text-[15px] font-bold text-white"
          >
            <TelegramIcon size={18} />
            Abrir no Telegram
          </a>
        </div>

        <div className={secao}>Conta</div>
        {/* Trocar de familia */}
        <div className={cardCls}>
          <div className="mb-1.5 text-[16px] font-extrabold">Trocar de família</div>
          {!trocar ? (
            <>
              <div className="mb-4 text-[14px] leading-relaxed text-text-2">
                Entre em outra família com um código de convite. Você deixa a
                família atual.
              </div>
              <button
                onClick={() => { setErro(null); setTrocar(true); }}
                className="h-11 rounded-[12px] border border-border bg-card-2 px-4 text-[14px] font-bold"
              >
                Usar outro código
              </button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); trocarFamilia(); }}>
              <input
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                placeholder="Código de convite"
                className="mb-3 h-12 w-full rounded-[12px] border border-border bg-card-2 px-3.5 text-center font-mono text-[18px] font-extrabold uppercase tracking-[0.14em]"
              />
              {erro && <p className="mb-3 text-[13px] font-bold text-neg">{erro}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setTrocar(false); setErro(null); }}
                  className="h-11 flex-1 rounded-[12px] border border-border bg-card text-[14px] font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 flex-[1.4] rounded-[12px] bg-brand text-[14px] font-bold text-brand-ink disabled:opacity-50"
                >
                  {loading ? "Trocando..." : "Trocar"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sair (so no mobile: no desktop fica na sidebar) */}
        <button
          onClick={sair}
          className="flex h-[50px] w-full items-center justify-center rounded-[16px] border border-border bg-card font-bold text-neg lg:hidden"
        >
          Sair da conta
        </button>
      </div>

      {mercadosAberto && <MeusMercadosModal onClose={() => setMercadosAberto(false)} />}
      <BudgetModal open={orcamentoAberto} onClose={() => setOrcamentoAberto(false)} />
    </div>
  );
}
