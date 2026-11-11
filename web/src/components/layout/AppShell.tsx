"use client";

import { FilaPrateleira } from "@/components/estoque/FilaPrateleira";
import Link from "next/link";
import { FilaFotos } from "@/components/lista/FilaFotos";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { ReceiptModal } from "@/components/receipt/ReceiptModal";
import { AddItemIcon, PinIcon } from "@/components/ui/icons";
import { atualizarLugar, useLugar } from "@/lib/lugar";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGestosTela } from "./useGestosTela";
import { abasCom, direcaoTroca, indiceAba } from "@/lib/gestos";
import { useModoMercado } from "@/lib/modoMercado";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { useHousehold } from "@/lib/household";

const META: Record<string, { title: string; subtitle: string }> = {
  "/app/estoque": { title: "Estoque", subtitle: "Despensa" },
  "/app/lista": { title: "Lista", subtitle: "de compras" },
  "/app/ofertas": { title: "Ofertas", subtitle: "da semana" },
  "/app/livelo": { title: "Livelo", subtitle: "pontos nas compras" },
  "/app/economia": { title: "Economia", subtitle: "do mês" },
  "/app/mercado": { title: "Mercado", subtitle: "modo compra" },
  "/app/config": { title: "Ajustes", subtitle: "família e app" },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Gestos de celular: arrastar pro lado troca de aba / volta a tela.
  const areaRef = useRef<HTMLElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  useGestosTela(path, areaRef, conteudoRef);
  // Direcao da tela que entra (pelo gesto ou tocando na aba): desliza do lado certo.
  const abas = abasCom(useModoMercado());
  const [vista, setVista] = useState({ path, dir: 0 as -1 | 0 | 1 });
  if (vista.path !== path) setVista({ path, dir: direcaoTroca(vista.path, path, abas) });
  const foraDasAbas = indiceAba(path, abas) < 0;
  function voltar() {
    if (window.history.length > 1) router.back();
    else router.push("/app/estoque");
  }
  // Microfone do topo, em toda tela: "preciso de arroz" ja cai na lista e avisa.
  const [falar, setFalar] = useState(false);
  const { receiptOpen, openReceipt, closeReceipt, showToast } = useStore();
  // Localizacao no topo: preenchida = ligada; riscada = desligada. Um toque liga.
  const lugar = useLugar();
  const gpsLigado = lugar.permitido === "sim";
  async function tocarGps() {
    if (lugar.permitido === "sem") return showToast("Este aparelho não tem localização.");
    if (lugar.permitido === "nao")
      return showToast("Localização bloqueada. No iPhone: Ajustes › Privacidade › Localização › Safari › Ao Usar.");
    if (!gpsLigado) {
      await atualizarLugar(true);
      return;
    }
    await atualizarLugar(true);
    showToast(lugar.noMercado ? `📍 Você está no mercado${lugar.nomeMercado ? `: ${lugar.nomeMercado}` : ""}` : "📍 Localização ligada: no mercado o app já põe no carrinho.");
  }
  // Avisos (toast, "foto pronta") ficam centralizados LOGO ACIMA do botao +, sem
  // passar por cima dele. A altura do + muda na Lista (tem o total no rodape).
  // Mercado tambem tem a barra do total no rodape.
  const noModoMercado = path.startsWith("/app/mercado");
  const naLista = path.startsWith("/app/lista") || noModoMercado;
  // O + so onde se poe item: o Estoque. Em Ofertas, Economia e Ajustes ele so
  // cobria o conteudo; no Mercado o "Adicionar ao carrinho" ja faz isso.
  // Na Lista os atalhos do topo (Falar, Receita, Montar) ja fazem esse papel.
  const comMais = path.startsWith("/app/estoque");
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--acima-fab",
      `calc(env(safe-area-inset-bottom) + ${naLista ? 224 : 172}px)`,
    );
  }, [naLista]);
  const { household } = useHousehold();
  const meta =
    Object.entries(META).find(([href]) => path.startsWith(href))?.[1] ??
    META["/app/estoque"];

  // Nome curto da familia (sem o prefixo "familia ") pro selo do topo mobile.
  const familia = (household?.familia ?? "").replace(/^fam[íi]lia\s+/i, "").trim();

  return (
    <div className="h-dvh overflow-hidden bg-bg lg:flex">
      <div className="hidden lg:flex">
        <Sidebar onRegistrar={() => openReceipt()} />
      </div>

      <div className="flex h-dvh min-w-0 flex-col lg:flex-1">
        {/* A camera de nota fiscal saiu daqui: o dono nao usa mais e ela ocupava
            o topo de todas as telas. O fluxo continua existindo, pelo menu
            lateral do desktop (Sidebar -> Registrar compra). */}
        <TopBar
          className="lg:hidden"
          title={meta.title}
          subtitle={meta.subtitle}
          left={
            foraDasAbas ? (
              <button
                onClick={voltar}
                aria-label="Voltar"
                className="ic-toque grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
              >
                <ChevronLeftIcon size={24} />
              </button>
            ) : (
              familia && (
              <Link
                href="/app/config"
                aria-label={`Família ${familia}`}
                title={`Família ${familia}`}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-card-2"
              >
                <AvatarInitial name={familia} size={30} />
              </Link>
              )
            )
          }
          right={
            <div className="flex items-center">
              <button
                onClick={() => void tocarGps()}
                aria-label={gpsLigado ? "Localização ligada" : "Ligar localização"}
                aria-pressed={gpsLigado}
                className={`ic-toque relative grid h-10 w-10 place-items-center rounded-xl hover:bg-card-2 ${
                  gpsLigado ? (lugar.noMercado ? "text-pos" : "text-brand") : "text-text-3"
                }`}
              >
                <span key={String(gpsLigado)} className={gpsLigado ? "ic-cai" : "ic-pop"}>
                  <PinIcon size={21} ligado={gpsLigado} />
                </span>
                {gpsLigado && lugar.noMercado && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-pos ring-2 ring-card" aria-hidden />
                )}
              </button>
            </div>
          }
        />

        <main ref={areaRef} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none">
          <div
            key={path}
            ref={conteudoRef}
            className={`${vista.dir === 1 ? "tela-da-direita" : vista.dir === -1 ? "tela-da-esquerda" : ""} mx-auto w-full max-w-[640px] px-4 pb-[170px] pt-4 lg:max-w-[1120px] lg:px-9 lg:pb-14 lg:pt-7`}
          >
            {children}
          </div>
        </main>

        <TabBar className="lg:hidden" />
      </div>

      <ReceiptModal open={receiptOpen} onClose={closeReceipt} />
      <FilaFotos />
      <FilaPrateleira />
      <VoiceModal open={falar} onClose={() => setFalar(false)} tela={noModoMercado ? "mercado" : "auto"} />
      {/* Botao "+" flutuante, em todas as telas: abre o adicionar (falar, foto, codigo,
          escrever). Na Lista sobe um pouco para nao cobrir o total do rodape. */}
      {/* No Mercado o "Adicionar ao carrinho" ja faz isso: o + so cobria os itens. */}
      {comMais && (
      <button
        data-abas
        onClick={() => setFalar(true)}
        aria-label="Adicionar item"
        className={`fixed right-4 z-20 grid h-14 w-14 place-items-center rounded-full bg-[var(--barra)] text-white shadow-[0_6px_18px_var(--shadow-lg)] transition-transform active:scale-95 lg:bottom-8 lg:right-8 ${
          naLista ? "bottom-[calc(env(safe-area-inset-bottom)+var(--tabbar-h)+60px)]" : "bottom-[calc(env(safe-area-inset-bottom)+var(--tabbar-h)+10px)]"
        }`}
      >
        <span className="ic-mexe">
          <AddItemIcon size={24} />
        </span>
      </button>
      )}
    </div>
  );
}
