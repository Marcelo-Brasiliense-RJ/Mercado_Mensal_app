"use client";

import { useState } from "react";

// Passo a passo para criar, UMA VEZ, o atalho "Enviar para Despensa" no iPhone. Depois
// dele, a nota do RJ entra sozinha: abre no Safari, Compartilhar, Enviar para Despensa.
// Cada passo diz o que tocar; o que precisa ser digitado tem botao "Copiar".
function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-2xl bg-card-2 p-2 pl-3">
      <code suppressHydrationWarning className="min-w-0 flex-1 truncate text-[13px] font-semibold">{valor}</code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor);
            setOk(true);
            setTimeout(() => setOk(false), 1800);
          } catch {
            /* sem area de transferencia: a pessoa seleciona o texto */
          }
        }}
        className="h-10 shrink-0 rounded-full bg-[var(--barra)] px-4 text-[14px] font-bold text-white"
        aria-label={`Copiar ${rotulo}`}
      >
        {ok ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-[24px] bg-card p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--barra)] text-[16px] font-extrabold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-extrabold leading-snug">{titulo}</div>
        {children && <div className="mt-1 text-[14px] leading-relaxed text-text-2">{children}</div>}
      </div>
    </li>
  );
}

export default function AtalhoPage() {
  // Endereco do proprio app (producao ou previa da Vercel), so no navegador.
  const [origem] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const url = `${origem}/api/nota/atalho`;
  const js = "completion(document.documentElement.outerHTML);";

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="rounded-[28px] bg-[var(--barra)] p-5 text-white">
        <div className="text-[13px] font-semibold text-white/65">Faz uma vez · leva 2 minutos</div>
        <h1 className="m-0 mt-1 text-[24px] font-extrabold leading-tight">Nota do mercado entrando sozinha</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/80">
          Depois disso, para registrar a nota: leia o QR no app, abra a nota e toque em <b>Compartilhar → Enviar para Despensa</b>. Só isso.
        </p>
      </div>

      <div className="px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-text-3">Criar o atalho no iPhone</div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        <Passo n={1} titulo="Abra o app Atalhos">É o app de ícone azul e rosa que já vem no iPhone. Toque no <b>+</b> lá em cima.</Passo>
        <Passo n={2} titulo='Dê o nome "Enviar para Despensa"'>Toque no nome do atalho, no topo, e escreva <b>Enviar para Despensa</b>.</Passo>
        <Passo n={3} titulo="Deixe aparecer no Compartilhar">
          Toque no <b>ⓘ</b> (embaixo) → ligue <b>Mostrar na Folha de Compartilhamento</b>. Em <b>Tipos</b>, deixe marcado só <b>Páginas Web do Safari</b>.
        </Passo>
        <Passo n={4} titulo='Adicione a ação "Executar JavaScript na Página Web"'>
          Busque por <b>JavaScript</b> e toque nela. Apague o texto que vem dentro e cole este:
          <Copiar valor={js} rotulo="código" />
        </Passo>
        <Passo n={5} titulo='Adicione a ação "Obter Conteúdos do URL"'>
          No lugar do endereço, cole:
          <Copiar valor={url} rotulo="endereço" />
          Toque na setinha <b>›</b> da ação: <b>Método</b> = <b>POST</b> · <b>Corpo da Solicitação</b> = <b>Arquivo</b> · em Arquivo escolha <b>Resultado do JavaScript</b>.
        </Passo>
        <Passo n={6} titulo='Adicione a ação "Mostrar Resultado"'>Ela mostra o aviso &ldquo;✅ Nota enviada&rdquo;. Toque em <b>OK</b> lá em cima. Pronto!</Passo>
      </ol>

      <div className="px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-text-3">Para a família</div>
      <Passo n={7} titulo="Mande o atalho para quem mora com você">
        No app Atalhos, segure o atalho → <b>Compartilhar</b> → <b>Copiar Link do iCloud</b> e mande no WhatsApp. Quem receber só toca no link e em <b>Adicionar Atalho</b>.
      </Passo>

      <div className="px-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-text-3">Como usar no dia a dia</div>
      <div className="rounded-[24px] bg-card p-4 text-[15px] leading-relaxed">
        <b>1.</b> Leia o QR do cupom no app · <b>2.</b> Toque em <b>Abrir nota</b> · <b>3.</b> Se pedir, digite o código da imagem ·{" "}
        <b>4.</b> <b>Compartilhar ⬆︎ → Enviar para Despensa</b> · <b>5.</b> Volte ao app: a conferência abre sozinha.
      </div>
    </div>
  );
}
