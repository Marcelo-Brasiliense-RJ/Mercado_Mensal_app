// Parser puro do HTML da consulta NFC-e da SEFAZ-RJ (webapp padrao consultaNFCe).
// Sem rede: recebe HTML, devolve itens + cabecalho. Testavel por fixture.
//
// AVISO: os seletores abaixo sao os da webapp padrao `consultaNFCe` (usada pelo RJ).
// Sao o ponto de partida; o teste (parse_test.ts) e montado a partir de um HTML
// real e, se o RJ divergir, ajusta-se os seletores ate o teste passar.

import { DOMParser, type Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

export function parseBrNumber(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

export type NfceItem = {
  desc_fiscal: string;
  qtd: number;
  unidade: string;
  preco: number;
  total_item: number;
};

export type NfceParsed = {
  emitente: string;
  chave: string;
  total_nota: number;
  itens: NfceItem[];
};

// Texto de um seletor dentro de um escopo, sem os rotulos ("Qtde.:", "UN:", etc).
function txt(scope: Element, sel: string): string {
  const el = scope.querySelector(sel);
  if (!el) return "";
  const strong = el.querySelector("strong");
  if (strong) strong.remove();
  return (el.textContent ?? "").trim();
}

export function parseNfceHtml(html: string): NfceParsed {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("html_invalido");

  const rows = Array.from(doc.querySelectorAll("#tabResult tr")) as unknown as Element[];
  const itens: NfceItem[] = rows
    .map((tr) => {
      const nome = txt(tr, ".txtTit") || txt(tr, ".txtTit2");
      const qtd = parseBrNumber(txt(tr, ".Rqtd"));
      const unidade = (txt(tr, ".RUN") || "un").toLowerCase();
      const preco = parseBrNumber(txt(tr, ".RvlUnit"));
      const total_item = parseBrNumber(txt(tr, ".valor"));
      return { desc_fiscal: nome, qtd: qtd || 1, unidade, preco, total_item };
    })
    .filter((i) => i.desc_fiscal.length > 0);

  const emitente = (doc.querySelector(".txtTopo")?.textContent ?? "").trim();
  const chaveRaw = (doc.querySelector(".chave")?.textContent ?? "").replace(/\D/g, "");
  const total_nota = parseBrNumber(
    doc.querySelector("#totalNota .totalNumb")?.textContent ??
      doc.querySelector(".totalNumb")?.textContent ??
      "",
  );

  return { emitente, chave: chaveRaw, total_nota, itens };
}
