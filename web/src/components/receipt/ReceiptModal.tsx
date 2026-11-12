"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TelegramIcon, CheckIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { BOT_HANDLE, BOT_URL } from "@/lib/config";
import { QrScanner } from "./QrScanner";
import { chaveDoQr, invokeNfce, ufDaChave } from "@/lib/nfce";
import { ItemGrid, type GridItem } from "./ItemGrid";
import { Conferencia } from "./Conferencia";
import { NotaEmPartes } from "./NotaEmPartes";
import { ValidarNota } from "./ValidarNota";
import { provaReal, type Cupom } from "@/lib/cupomPartes";
import { daListaNaNota } from "@/lib/notaLista";
import { conferir, esquecerUltimaCompra, lerUltimaCompra, type Conferencia as Conf, type ItemNota } from "@/lib/conferencia";
import { createClient } from "@/lib/supabase/client";
import type { CompraMes } from "@/lib/economia";
import { avisarComprasMudaram, diaMes } from "@/lib/compras";
import { brl } from "@/lib/format";

type Item = GridItem;
type Phase = "capture" | "scanning" | "partes" | "processing" | "review" | "conferencia" | "error";


// Reduz a foto antes de mandar (payload menor, leitura mais rapida). Cai no
// FileReader se createImageBitmap nao existir.
async function fileToDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
}

export function ReceiptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { confirmReceipt, showToast, updateCompra, reloadData, notaDaCompra, shopping, buyItems, stock } = useStore();
  // Revisao: primeiro a validacao facil (so as duvidas); "Ver e editar todos" abre a grade.
  const [validar, setValidar] = useState(true);
  async function riscarDaLista(ids: string[]) {
    if (!ids.length) return 0;
    const r = await buyItems(ids);
    return r.ok ? ids.length : 0;
  }
  // Carrinho que acabou de fechar (guardado ao finalizar): com ele, a nota vira
  // conferencia carrinho x nota em vez da revisao simples.
  const [conf, setConf] = useState<Conf | null>(null);
  // Nota para uma compra ja registrada: nao e conferencia do ultimo carrinho.
  const ultima = open && !notaDaCompra ? lerUltimaCompra() : null;
  // O leitor de QR guarda a funcao do primeiro render: a compra-alvo vai por ref.
  const notaRef = useRef(notaDaCompra);
  useEffect(() => {
    notaRef.current = notaDaCompra;
  }, [notaDaCompra]);
  // QR da nota (qualquer estado): tenta a SEFAZ e, se ela barrar (a do RJ barra
  // servidor), guarda a chave e pede a foto. qr = o que o QR/link trouxe.
  const [qr, setQr] = useState<{ url: string; chave: string; uf: string } | null>(null);
  const [colando, setColando] = useState(false);
  const [link, setLink] = useState("");
  const [phase, setPhase] = useState<Phase>("capture");
  const [items, setItems] = useState<Item[]>([]);
  // O que veio na nota risca da lista o item certo (dono: "fazer o match correto do que
  // veio da nota com o que esta na lista"), mesmo com nome diferente.
  const daLista = daListaNaNota(shopping, items.filter((i) => i.nome.trim()));
  const [saving, setSaving] = useState(false);
  // Origem da leitura: "qr" (SEFAZ) usa dedup pela chave; "ocr" (foto) nao tem chave.
  const [source, setSource] = useState<"qr" | "ocr">("qr");
  const [chave, setChave] = useState("");
  const [emitente, setEmitente] = useState("");
  const [totalNota, setTotalNota] = useState(0);
  // "Qtde. total de itens" do rodape: a prova real na tela de conferir.
  const [qtdNota, setQtdNota] = useState(0);
  const [confere, setConfere] = useState(true);

  function close() {
    onClose();
    setPhase("capture");
    setItems([]);
    setSaving(false);
    setSource("qr");
    setChave("");
    setEmitente("");
    setTotalNota(0);
    setQtdNota(0);
    setConfere(true);
    setQr(null);
    setColando(false);
    setLink("");
    setConf(null);
    setValidar(true);
  }

  // QR ou link da nota: tenta a SEFAZ (itens prontos, sem foto). A do RJ barra acesso de
  // servidor (bloqueio por IP, confirmado em 2026-11-11), entao la a resposta e a foto,
  // mas com a chave do QR guardada: nota repetida fica barrada com certeza.
  const onQr = useCallback(async (texto: string) => {
    const ch = chaveDoQr(texto);
    if (!ch) return;
    navigator.vibrate?.(40);
    setQr({ url: texto, chave: ch, uf: ufDaChave(ch) });
    setChave(ch);
    setSource("qr");
    setPhase("processing");
    const resp = await Promise.race([
      invokeNfce(texto).catch(() => ({ ok: false as const, erro: "falhou" })),
      new Promise<{ ok: false; erro: string }>((ok) => setTimeout(() => ok({ ok: false, erro: "demorou" }), 8000)),
    ]);
    if (!resp.ok || !resp.itens?.length) {
      setPhase("capture"); // volta para a tela da nota, agora pedindo a foto
      return;
    }
    setItems(
      resp.itens.map((it) => ({
        nome: it.nome || "",
        marca: it.marca || "",
        qtd: Number(it.qtd) || 1,
        preco: Number(it.preco) || 0,
        unidade: it.unidade || "un",
      })),
    );
    setChave(resp.chave || ch);
    setEmitente(resp.emitente);
    setTotalNota(resp.total_nota);
    setConfere(resp.total_confere);
    irParaRevisao(resp.itens.map((it) => ({ nome: it.nome || "", marca: it.marca || "", qtd: Number(it.qtd) || 1, preco: Number(it.preco) || 0, unidade: it.unidade || "un" })), resp.total_nota);
  }, []);
  const semCamera = useCallback(() => {}, []);

  // Com a ultima compra guardada: conferencia. Sem: revisao para gravar na despensa.
  function irParaRevisao(nota: ItemNota[], total: number) {
    // Nota de uma compra ja registrada: confere com o que o carrinho anotou NELA (itens da
    // compra no banco), com foto e marca; o botao troca a compra pela nota.
    const alvo = notaRef.current;
    if (alvo) {
      setPhase("processing");
      void createClient()
        .rpc("mercado_compra_itens_web", { p_id: alvo.id })
        .then(({ data }) => {
          const daCompra = ((data as { itens?: CompraMes[] } | null)?.itens ?? []).map((c) => ({
            name: c.name,
            quantity: Number(c.qty),
            unit: c.unit,
            unit_price: Number(c.price),
          }));
          if (!daCompra.length) return setPhase("review");
          setConf(conferir(daCompra, nota, total));
          setPhase("conferencia");
        });
      return;
    }
    const u = lerUltimaCompra();
    if (u) {
      setConf(conferir(u.itens, nota, total));
      setPhase("conferencia");
    } else setPhase("review");
  }

  // Fecha o ciclo: o esquecido entra na despensa (e a nota fica registrada pela chave),
  // e o valor cobrado corrige o anotado nas compras de hoje.
  async function aplicarConferencia(esquecidos: ItemNota[], corrigir: boolean) {
    if (!conf) return;
    setSaving(true);
    let feitos = 0;
    // A nota e da compra do carrinho que acabou de fechar: os esquecidos entram NELA e
    // ela sai das pendencias (0055). Sem a 0055 no banco, segue o caminho antigo.
    const sb = createClient();
    const ult = await sb.rpc("mercado_compra_ultimo_carrinho_web");
    const compraId = (ult.data as { ok?: boolean; id?: string } | null)?.id;
    if (compraId) {
      const r = await sb.rpc("mercado_compra_nota_web", {
        p_id: compraId,
        p_items: esquecidos.map((n) => ({ nome: n.nome, marca: n.marca, qtd: n.qtd, preco: n.preco, unidade: n.unidade })),
        p_trocar: false,
        p_chave: chave || null,
        p_emitente: emitente || null,
        p_total: conf.totalNota || null,
      });
      const d = r.data as { ok?: boolean; erro?: string } | null;
      if (d?.ok) feitos += esquecidos.length;
      else if (d?.erro === "ja_importada") showToast("Essa nota já tinha sido registrada.");
      avisarComprasMudaram();
    } else if (esquecidos.length) {
      const res = await confirmReceipt(
        esquecidos.map((n) => ({ nome: n.nome, marca: n.marca, qtd: n.qtd, preco: n.preco, unidade: n.unidade })),
        chave ? { chave, emitente, total: conf.totalNota } : undefined,
      );
      if (res.ok === false && res.erro === "ja_importada") showToast("Essa nota já tinha sido registrada.");
      else if (res.ok !== false) feitos += esquecidos.length;
    }
    if (corrigir && conf.diferentes.length) {
      const { data } = await createClient().rpc("mercado_economia_mes_web", { p_mes: null });
      const compras = ((data as { compras?: CompraMes[] } | null)?.compras ?? []).slice();
      for (const d of conf.diferentes) {
        const i = compras.findIndex(
          (c) => c.name.trim().toLowerCase() === d.c.name.trim().toLowerCase() && Math.abs(Number(c.price) - d.c.unit_price) < 0.01,
        );
        if (i < 0) continue;
        const [c] = compras.splice(i, 1);
        const r = await updateCompra(c.id, { price: d.n.preco, qty: d.n.qtd });
        if (r.ok) feitos++;
      }
      await reloadData();
    }
    esquecerUltimaCompra();
    setSaving(false);
    showToast(feitos ? `✓ ${feitos} ${feitos > 1 ? "ajustes" : "ajuste"} pela nota` : "Nada para ajustar");
    close();
  }

  // Nota pela foto, em partes guiadas (NotaEmPartes): cada parte ja vem lida e juntada.
  function cupomPronto(c: Cupom, confereTotal: boolean) {
    setSource("ocr");
    const lidos = c.itens.map((it) => ({
      nome: it.nome || "",
      marca: it.marca || "",
      qtd: Number(it.qtd) || 1,
      preco: Number(it.preco) || 0,
      unidade: it.unidade || "un",
      duvida: !!it.duvida,
    }));
    if (!lidos.length) return setPhase("error");
    setItems(lidos);
    setChave(qr?.chave || c.chave || "");
    setEmitente(c.emitente || "");
    setTotalNota(c.total || 0);
    setConfere(confereTotal);
    setQtdNota(c.qtdItens || 0);
    irParaRevisao(lidos.map((x) => ({ nome: x.nome, marca: x.marca, qtd: x.qtd, preco: x.preco, unidade: x.unidade })), c.total || 0);
  }

  function patch(i: number, field: "nome" | "qtd" | "preco", value: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? {
              ...it,
              [field]:
                field === "nome" ? value : Number(value.replace(",", ".")) || 0,
            }
          : it,
      ),
    );
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Nota de uma compra ja registrada: os itens da nota SUBSTITUEM os da compra, na mesma
  // data (o carrinho anotou 820, a nota foi 1.800). Gasto e estoque nao duplicam.
  async function trocarNaCompra(clean: Item[], riscar?: string[]) {
    if (!notaDaCompra) return;
    const { data, error } = await createClient().rpc("mercado_compra_nota_web", {
      p_id: notaDaCompra.id,
      p_items: clean,
      p_trocar: true,
      p_chave: chave || null,
      p_emitente: emitente || null,
      p_total: totalNota || null,
    });
    const d = data as { ok?: boolean; erro?: string; antes?: number; depois?: number } | null;
    if (error || !d?.ok) {
      setSaving(false);
      return showToast(
        d?.erro === "ja_importada"
          ? "Essa nota já está em outra compra."
          : error?.code === "PGRST202"
            ? "Falta rodar a migration 0055 no Supabase."
            : "Não consegui trocar a nota. Tente de novo.",
      );
    }
    const riscados = await riscarDaLista(riscar ?? daLista.map((x) => x.id));
    await reloadData();
    avisarComprasMudaram();
    showToast(
      `Compra de ${diaMes(notaDaCompra.data)}: ${brl(Number(d.antes))} → ${brl(Number(d.depois))} pela nota${riscados ? ` · ${riscados} riscados da lista` : ""}`,
    );
    close();
  }

  // lista/riscar: vindos da validacao (ValidarNota); sem eles, o que esta na tela.
  async function confirm(lista?: Item[], riscar?: string[]) {
    const clean = (lista ?? items).filter((i) => i.nome.trim());
    if (!clean.length) return;
    setSaving(true);
    if (notaDaCompra) return trocarNaCompra(clean, riscar);
    try {
      const res = await confirmReceipt(
        clean,
        chave ? { chave, emitente, total: totalNota } : undefined,
      );
      if (res && res.ok === false) {
        if (res.erro === "ja_importada") {
          showToast("Essa nota já foi importada");
          close();
        } else {
          setSaving(false);
          showToast("Não consegui salvar. Tente de novo.");
        }
        return;
      }
      const riscados = await riscarDaLista(riscar ?? daLista.map((x) => x.id));
      showToast(`${clean.length} itens adicionados ao estoque${riscados ? ` · ${riscados} riscados da lista` : ""}`);
      close();
    } catch {
      setSaving(false);
      showToast("Não consegui salvar. Tente de novo.");
    }
  }

  // Tela cheia da nota, como os apps de mercado: camera lendo o QR e, embaixo, foto,
  // galeria e colar link. Depois do QR de um estado que nao deixa ler, vira o aviso
  // "pela foto" com a chave ja guardada.
  if (open && phase === "capture") {
    const inputs = (
      <>
      </>
    );
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
        {!qr && <QrScanner cheia onResult={onQr} onError={semCamera} />}
        <div className="relative z-10 flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <button onClick={close} aria-label="Fechar" className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-[20px] backdrop-blur">
            ✕
          </button>
          <span className="rounded-full bg-white/15 px-4 py-2 text-[15px] font-bold backdrop-blur">{notaDaCompra ? `Nota da compra de ${diaMes(notaDaCompra.data)}` : ultima ? "Conferir com a nota" : "Nota fiscal"}</span>
          <span className="w-12" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 text-center">
          {qr ? (
            // Depois do QR de um estado que nao libera os itens (RJ): uma coisa por linha.
            // Print do dono: "ta de dificil entendimento" quando era um paragrafo so.
            <div className="w-full max-w-[360px] text-left">
              <div className="mb-5 flex items-center gap-2 rounded-full bg-pos/20 px-3 py-1.5 text-[14px] font-bold text-[#7CE3A8] w-fit">
                <span aria-hidden>✓</span> QR lido{qr.uf ? `: nota do ${qr.uf}` : ""}
              </div>
              <h2 className="text-[26px] font-extrabold leading-tight">Falta só a foto da nota</h2>
              <p className="mt-1 text-[14px] leading-snug text-white/60">
                O site da Receita{qr.uf ? ` do ${qr.uf}` : ""} não mostra os itens pelo QR. Pela foto eu leio.
              </p>
              <ol className="mt-5 space-y-3">
                {[
                  ["Toque em Tirar foto da nota", "Cupom inteiro, de perto, com luz. Comprido? Tire em partes."],
                  ["Toque em Ler nota", "Eu leio cada item e preço."],
                  [notaDaCompra ? "Confira e toque em Trocar pela nota" : "Confira e toque em Confirmar", notaDaCompra ? `Os ${notaDaCompra.itens} itens da compra de ${diaMes(notaDaCompra.data)} (${brl(notaDaCompra.total)}) viram os da nota.` : "Os itens entram no estoque e no gasto do mês."],
                ].map(([t, d], n) => (
                  <li key={n} className="flex gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[15px] font-extrabold text-brand-ink">{n + 1}</span>
                    <span className="leading-snug">
                      <span className="block text-[16px] font-bold">{t}</span>
                      <span className="block text-[13px] text-white/60">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : ultima ? (
            <p className="mt-[78vw] text-[16px] font-bold drop-shadow sm:mt-80">
              Leia a nota desta compra e eu confiro item por item
              <span className="block text-[14px] font-normal text-white/70">o que você esqueceu de anotar e onde o preço mudou</span>
              <button onClick={() => { esquecerUltimaCompra(); close(); }} className="mt-3 h-10 rounded-full bg-white/15 px-4 text-[14px] font-bold">
                Agora não
              </button>
            </p>
          ) : (
            <p className="mt-[78vw] text-[17px] font-bold drop-shadow sm:mt-80">
              Aponte para o QR code da nota
              <span className="block text-[14px] font-normal text-white/70">
                {notaDaCompra ? "Ele fica no pé do cupom. Sem QR? Toque em Tirar foto." : "Ele fica no pé do cupom"}
              </span>
            </p>
          )}
        </div>

        <div className="relative z-10 mx-3 mb-[max(14px,env(safe-area-inset-bottom))] rounded-[28px] bg-[#1c1c1e] p-2.5">
          {colando && !qr ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (chaveDoQr(link)) void onQr(link);
                else showToast("Link sem a chave da nota.");
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Cole o link da nota"
                className="h-14 min-w-0 flex-1 rounded-full bg-white/10 px-5 text-[16px] text-white placeholder:text-white/40"
              />
              <button type="submit" className="h-14 shrink-0 rounded-full bg-brand px-5 font-extrabold text-brand-ink">Ler</button>
            </form>
          ) : (
            <button onClick={() => setPhase("partes")} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-extrabold text-brand-ink">
              📷 Tirar foto da nota
            </button>
          )}
          {qr ? (
            <button onClick={() => setPhase("partes")} className="mt-1 h-12 w-full text-[15px] font-bold text-white/85">🖼 Escolher foto da galeria</button>
          ) : (
            <div className="mt-1 grid grid-cols-2">
              <button onClick={() => setPhase("partes")} className="h-12 text-[15px] font-bold text-white/85">🖼 Da galeria</button>
              <button onClick={() => setColando((c) => !c)} className="h-12 text-[15px] font-bold text-white/85">
                {colando ? "📷 Foto" : "🔗 Colar link"}
              </button>
            </div>
          )}
        </div>
        {inputs}
      </div>
    );
  }

  // Conferencia em tela cheia (desenho no Claude Design: "Despensa — Carrinho × nota").
  if (open && phase === "conferencia" && conf) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-bg text-text">
        <Conferencia
          conf={conf}
          busy={saving}
          mercado={emitente}
          onAplicar={(e, c) => void aplicarConferencia(e, c)}
          onFechar={close}
          daLista={daLista.map((x) => x.name)}
          troca={
            notaDaCompra
              ? {
                  onTrocar: () => {
                    const clean = items.filter((i) => i.nome.trim());
                    if (!clean.length) return;
                    setSaving(true);
                    void trocarNaCompra(clean);
                  },
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <Modal open={open} onClose={close}>
      {phase === "partes" && (
        <NotaEmPartes
          titulo={notaDaCompra ? `Nota da compra de ${diaMes(notaDaCompra.data)}` : "Nota fiscal pela foto"}
          lerArquivo={fileToDataUrl}
          onPronto={cupomPronto}
          onSair={() => setPhase("capture")}
        />
      )}

      {phase === "processing" && (
        <div className="py-2.5 text-center">
          <div className="relative mx-auto mb-5 h-[216px] w-[170px] overflow-hidden rounded-[14px] border border-border bg-card-2">
            <div className="absolute inset-x-0 top-0 h-[38%] animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-brand/45 to-transparent" />
          </div>
          <div className="mb-1 text-[18px] font-extrabold">Lendo sua nota fiscal...</div>
          <div className="text-[13px] text-text-2">
            {source === "qr"
              ? "Consultando a SEFAZ e identificando itens"
              : "Lendo item por item."}
          </div>
        </div>
      )}

      {phase === "review" && validar && (
        <ValidarNota
          itens={items}
          lista={shopping}
          conhecidos={stock.map((x) => x.name)}
          busy={saving}
          rotuloSalvar={notaDaCompra ? "Trocar pela nota" : "Salvar"}
          onSalvar={(final, riscar) => {
            setItems(final);
            void confirm(final, riscar);
          }}
          onEditarTodos={() => setValidar(false)}
          onCancelar={close}
        />
      )}

      {phase === "review" && !validar && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-pos-soft text-pos">
              <CheckIcon size={14} />
            </span>
            <div className="text-[20px] font-extrabold">
              {items.length} {items.length === 1 ? "item" : "itens"}
            </div>
          </div>
          {(() => {
            const pr = provaReal(items, qtdNota);
            if (!pr) return null;
            return pr.bate ? (
              <div className="mb-2 rounded-[10px] bg-pos-soft px-3 py-2 text-[13px] font-bold text-pos">
                ✓ Prova real: {pr.noCupom} de {pr.noCupom} itens do cupom
              </div>
            ) : (
              <div className="mb-2 rounded-[10px] bg-warn-soft px-3 py-2 text-[13px] font-bold text-text">
                ⚠ Prova real: o cupom diz {pr.noCupom} itens e aqui tem {pr.lidos}. Confira as quantidades ou volte e tire a parte que faltou.
              </div>
            );
          })()}
          {!confere && (
            <div className="mb-2 rounded-[10px] bg-warn-soft px-3 py-2 text-[12px] font-bold text-warn">
              O total dos itens não bateu com o total da nota. Confira antes de confirmar.
            </div>
          )}
          {notaDaCompra ? (
            <div className="mb-3.5 rounded-[14px] bg-warn-soft p-3 text-[13px] leading-snug text-text">
              Vai <b>trocar</b> os {notaDaCompra.itens} itens da compra de {diaMes(notaDaCompra.data)} (
              {brl(notaDaCompra.total)}) por estes{totalNota ? <>, total da nota <b>{brl(totalNota)}</b></> : null}. A
              data continua {diaMes(notaDaCompra.data)} e o estoque é acertado. Confira e toque para editar.
            </div>
          ) : (
            <div className="mb-3.5 text-[14px] text-text-2">
              Confira e ajuste antes de adicionar ao estoque. Toque para editar.
            </div>
          )}
          {daLista.length > 0 && (
            <div className="mb-3 rounded-[12px] bg-pos-soft px-3 py-2.5 text-[13px] leading-snug">
              <b>📝 Vai riscar {daLista.length} da lista:</b>{" "}
              {daLista.slice(0, 8).map((x) => x.name).join(", ")}
              {daLista.length > 8 ? ` e mais ${daLista.length - 8}` : ""}
            </div>
          )}
          <ItemGrid items={items} onPatch={patch} onRemove={remove} />
          <div data-rodape className="flex gap-3">
            <button
              onClick={close}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirm()}
              disabled={saving || items.length === 0}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {saving ? "Salvando..." : notaDaCompra ? `Trocar pela nota · ${brl(items.reduce((a, i) => a + Number(i.preco) * Number(i.qtd), 0))}` : "Confirmar e adicionar"}
            </button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="text-center">
          <div className="mb-1 text-[20px] font-extrabold">Não consegui ler a nota</div>
          <p className="mb-5 text-[14px] leading-relaxed text-text-2">
            A leitura falhou ou a imagem ficou difícil de entender. Tente escanear o
            QR de novo, fotografar a nota, ou mandar no {BOT_HANDLE} no Telegram.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPhase("capture")}
              className="h-[50px] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
            >
              Tentar de novo
            </button>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] border border-border bg-card text-[15px] font-bold"
            >
              <TelegramIcon size={18} className="text-[#2AABEE]" /> Mandar no Telegram
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
