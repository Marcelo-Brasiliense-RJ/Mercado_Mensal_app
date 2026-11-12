"use client";

import { useEffect, useState } from "react";

// O icone novo (Cesta do mes) nao chega sozinho no iPhone: o iOS tira uma "foto" do
// icone na hora do "Adicionar a Tela de Inicio" e nunca mais atualiza, e nenhum codigo
// do site muda isso. Quem usa o app instalado no iPhone ve este aviso UMA vez por
// aparelho, com o passo a passo. No Android o Chrome atualiza sozinho (os arquivos do
// icone ganharam nome novo para ele perceber a troca), entao la nao aparece.
const CHAVE = "aviso_icone_cesta_v1";

// Instalacao NOVA abre pelo start_url do manifesto, que agora tem ?pwa=2: essa ja tem o
// icone novo e nunca ve o aviso. A antiga guardou o start_url velho (sem a marca).
// "id" fixo no manifesto: trocar o start_url nao vira "outro app" no Android.
function deveMostrar(): boolean {
  try {
    if (new URLSearchParams(location.search).get("pwa") === "2") {
      localStorage.setItem(CHAVE, "1");
      return false;
    }
    if (localStorage.getItem(CHAVE)) return false;
  } catch {
    return false; // sem como lembrar que ja mostrou: melhor nao insistir
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return ios && instalado;
}

export function AvisoIcone() {
  const [ver, setVer] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    // depois do primeiro desenho: o app abre primeiro, o aviso vem logo atras
    const t = setTimeout(() => setVer(deveMostrar()), 1500);
    return () => clearTimeout(t);
  }, []);

  function fechar() {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {}
    setVer(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(location.origin);
      setCopiado(true);
    } catch {}
  }

  if (!ver) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-[max(12px,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby="aviso-icone-titulo">
      <div className="w-full max-w-[440px] rounded-[24px] bg-card p-5 shadow-[0_10px_30px_var(--shadow-lg)]">
        <div className="mb-3 flex items-center gap-3">
          <img src="/icone-cesta-180.png" alt="" width={52} height={52} className="rounded-[13px]" />
          <div>
            <h2 id="aviso-icone-titulo" className="text-[18px] font-extrabold">O app ganhou ícone novo</h2>
            <p className="text-[13px] text-text-2">No iPhone ele só aparece se você instalar de novo.</p>
          </div>
        </div>
        {/* Ordem pensada para o celular: primeiro abre o Safari (com o app ainda ali para
            tocar no botao), instala o novo e so no fim apaga o velho. x-safari-https abre o
            Safari de verdade (iOS 17+); um link normal abriria dentro do proprio app. */}
        <a
          href={`x-safari-${typeof location !== "undefined" ? location.origin : ""}/app/estoque`}
          onClick={() => {
            try {
              localStorage.setItem(CHAVE, "1");
            } catch {}
          }}
          className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-extrabold text-brand-ink"
        >
          1. Abrir no Safari ↗
        </a>
        <ol start={2} className="mb-4 space-y-2 text-[14px] leading-snug">
          <li><b>2.</b> No Safari, toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</li>
          <li><b>3.</b> Apague o ícone antigo: segure o <b>Despensa</b> velho → <b>Remover App</b> → <b>Remover da Tela de Início</b>.</li>
        </ol>
        <p className="mb-4 rounded-[12px] bg-card-2 p-3 text-[12px] leading-snug text-text-2">
          Sua despensa, lista e compras ficam guardadas na conta. Talvez peça para entrar de novo com e-mail e senha.
          Se o botão não abrir o Safari, copie o endereço e cole no Safari.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copiar()} className="h-12 flex-1 rounded-full bg-card-2 text-[14px] font-bold">
            {copiado ? "Endereço copiado ✓" : "Copiar endereço"}
          </button>
          <button type="button" onClick={fechar} className="h-12 flex-1 rounded-full bg-[var(--barra)] text-[14px] font-extrabold text-white">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
