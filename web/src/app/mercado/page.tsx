"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { brl } from "@/lib/format";
import { unitFor } from "@/lib/defaults";
import { BarcodeScanner } from "@/components/lista/BarcodeScanner";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { BarcodeIcon, MicIcon, PlusIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { interpretarLocal, reconhecimentoDoNavegador } from "@/lib/voz";
import {
  lerCarrinho,
  novoId,
  salvarCarrinho,
  totalDo,
  type ItemLocal,
} from "@/lib/carrinhoLocal";

// Modo mercado sem conta. Rota fora de /app de proposito: a guarda de rota manda
// /app/* para o login, e o ponto deste modo e justamente nao depender de login.
//
// Tudo aqui roda no aparelho: somar o carrinho, falar, ler codigo de barras e
// digitar. Nenhuma chamada ao Supabase, nenhuma chave, nenhuma sessao.

type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const campoBase = "h-12 rounded-[13px] border border-border bg-card-2 text-[15px]";
const campo = `${campoBase} w-full px-3.5`;

export default function ModoMercado() {
  const [itens, setItens] = useState<ItemLocal[]>([]);
  const [pronto, setPronto] = useState(false);
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [lendoCodigo, setLendoCodigo] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const falaRef = useRef<Reconhecedor | null>(null);

  // Carrega o que ficou da ultima vez. Fechar o navegador no meio da compra nao
  // pode custar o carrinho inteiro.
  // setState fora do corpo sincrono do effect, mesmo padrao do ComprasDoMes:
  // chamada direta dispara react-hooks/set-state-in-effect e render em cascata.
  useEffect(() => {
    let vivo = true;
    Promise.resolve(lerCarrinho()).then((guardado) => {
      if (!vivo) return;
      setItens(guardado);
      setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (pronto) salvarCarrinho(itens);
  }, [itens, pronto]);

  const total = totalDo(itens);

  function juntar(novos: Omit<ItemLocal, "id">[]) {
    if (!novos.length) return;
    setItens((l) => [...novos.map((n) => ({ ...n, id: novoId() })), ...l]);
  }

  function adicionarDigitado() {
    const n = nome.trim();
    if (!n) return;
    juntar([
      {
        nome: n,
        qtd: Number(qtd.replace(",", ".")) || 1,
        unidade,
        preco: Number(preco.replace(",", ".")) || 0,
      },
    ]);
    setNome("");
    setQtd("1");
    setPreco("");
    setUnidade("un");
  }

  // Falar: o navegador transcreve e a frase e interpretada no aparelho.
  function falar() {
    setAviso("");
    if (!reconhecimentoDoNavegador()) {
      setAviso("Este navegador não transcreve. Use Código ou Digitar.");
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as new () => Reconhecedor;
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const frase = e.results[0][0].transcript ?? "";
      const lidos = interpretarLocal(frase).itens;
      if (!lidos.length) {
        setAviso(`Ouvi “${frase}”, mas não achei item. Tente “arroz vinte reais”.`);
        return;
      }
      juntar(
        lidos.map((i) => ({
          nome: i.nome,
          qtd: i.qtd,
          unidade: i.unidade,
          preco: i.preco ?? 0,
        })),
      );
      setAviso(`Ouvi: “${frase}”`);
    };
    rec.onerror = () => setAviso("Não consegui ouvir. Tente mais perto.");
    rec.onend = () => {
      setOuvindo(false);
      falaRef.current = null;
    };
    falaRef.current = rec;
    setOuvindo(true);
    rec.start();
  }

  // Codigo de barras sem conta nao tem catalogo para consultar, entao ele serve
  // para o que importa aqui: nao deixar passar item. Cai no campo com o codigo
  // preenchido no nome, e a pessoa troca pelo nome de verdade se quiser.
  function codigoLido(code: string) {
    setLendoCodigo(false);
    setNome(`Código ${code.slice(-4)}`);
    setPreco("");
    setQtd("1");
    setAviso("Código lido. Diga o preço e confirme.");
  }

  function remover(id: string) {
    setItens((l) => l.filter((i) => i.id !== id));
  }

  function limpar() {
    if (!confirm("Esvaziar o carrinho?")) return;
    setItens([]);
  }

  const btn = "flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[12px] font-bold";

  return (
    <div className="min-h-dvh bg-bg pb-[210px]">
      <div className="mx-auto w-full max-w-[640px] px-4 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[19px] font-extrabold leading-tight">No mercado</div>
            <div className="text-[12px] text-text-3">sem conta, salvo neste celular</div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/entrar"
              className="rounded-[12px] border border-border bg-card px-3 py-2 text-[13px] font-bold"
            >
              Entrar
            </Link>
          </div>
        </div>

        {itens.length === 0 && (
          <p className="pt-10 text-center text-[15px] leading-relaxed text-text-3">
            Carrinho vazio. Use os botões aqui embaixo: <b>Falar</b> o que pegou, ler
            o <b>Código</b> ou <b>Digitar</b>.
          </p>
        )}

        <ul className="space-y-2.5">
          {itens.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-[0_1px_3px_var(--shadow)]"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold">{i.nome}</div>
                <div className="text-[13px] text-text-3">
                  {i.qtd} {i.unidade} · {brl(i.preco)}
                </div>
              </div>
              <span className="shrink-0 text-[16px] font-extrabold">
                {brl(i.qtd * i.preco)}
              </span>
              <button
                onClick={() => remover(i.id)}
                aria-label="Remover"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[18px] text-text-3"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {itens.length > 0 && (
          <button
            onClick={limpar}
            className="mt-4 h-[46px] w-full rounded-[14px] border border-border bg-card text-[14px] font-bold text-text-2"
          >
            Esvaziar carrinho
          </button>
        )}
      </div>

      {/* Barra fixa: o total sempre a vista e as tres formas de anotar a um toque. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-4px_16px_var(--shadow)]">
        <div className="mx-auto w-full max-w-[640px]">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">
              No carrinho
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[26px] font-extrabold leading-none text-brand">
                {brl(total)}
              </span>
              <span className="text-[12px] text-text-3">
                {itens.length} {itens.length === 1 ? "item" : "itens"}
              </span>
            </span>
          </div>

          {aviso && (
            <p className="mb-2 rounded-[12px] border border-border bg-card-2 px-3 py-2 text-[12px] leading-snug text-text-2">
              {aviso}
            </p>
          )}

          {lendoCodigo && (
            <div className="mb-2">
              <BarcodeScanner
                onResult={codigoLido}
                onError={() => {
                  setLendoCodigo(false);
                  setAviso("Não consegui abrir a câmera.");
                }}
              />
              <button
                onClick={() => setLendoCodigo(false)}
                className="mt-2 h-[44px] w-full rounded-[12px] border border-border bg-card text-[14px] font-bold"
              >
                Fechar câmera
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              adicionarDigitado();
            }}
            className="mb-2"
          >
            {/* Duas linhas so: nome em cima, o resto embaixo. Em 390px o wrap
                natural virava quatro linhas e comia metade da tela. */}
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setUnidade(unitFor(e.target.value));
              }}
              placeholder="O que você pegou?"
              aria-label="Item"
              className={`${campo} mb-2`}
            />
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
              </div>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                aria-label="Unidade"
                className={`${campoBase} w-[64px] shrink-0 px-1.5`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
                placeholder="preço"
                aria-label="Preço"
                className={`${campoBase} w-[76px] shrink-0 px-2 text-right`}
              />
            </div>
            {/* "Peguei" ocupa a largura toda: alvo grande erra menos com o
                celular numa mao dentro do mercado, e na linha de cima ele
                estourava a largura em telas de 390px. */}
            <button
              type="submit"
              disabled={!nome.trim()}
              className="mt-2 h-12 w-full rounded-[13px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              Peguei
            </button>
          </form>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={falar}
              className={`${btn} ${ouvindo ? "animate-pulse bg-neg text-brand-ink" : "bg-brand text-brand-ink"}`}
            >
              <MicIcon size={22} />
              {ouvindo ? "Ouvindo…" : "Falar"}
            </button>
            <button
              type="button"
              onClick={() => setLendoCodigo((v) => !v)}
              className={`${btn} border border-border bg-card-2 text-text`}
            >
              <BarcodeIcon size={22} />
              Código
            </button>
            <button
              type="button"
              onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Item"]')?.focus()}
              className={`${btn} border border-border bg-card-2 text-text`}
            >
              <PlusIcon size={22} />
              Digitar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
