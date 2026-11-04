"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Sugestoes } from "@/components/lista/Sugestoes";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { acertarEstoque, produtoDoEstoque } from "@/lib/acertarEstoque";
import { SomarOuSubstituir, type Modo } from "@/components/ui/SomarOuSubstituir";
import { findByName, unitFor } from "@/lib/defaults";
import { brl } from "@/lib/format";
import { casaItem, maisBarato } from "@/lib/ofertas";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { mercadoAtual } from "@/lib/lugar";
import {
  agrupar,
  chaveLido,
  marcarCarrinho,
  mesmoProduto,
  corDe,
  daMemoria,
  qualidadeDe,
  unidadesDe,
  type Box,
  type Cor,
} from "@/lib/prateleira";
import { canvasDe, enfileirarPrateleira, recorte, tirarJob, type JobFoto } from "@/lib/filaPrateleira";
import type { Destino } from "@/lib/filaFotos";
import { FotoItem } from "@/components/ui/FotoItem";
import { acentuar, nomeBonito } from "@/lib/nomeBonito";

// Foto da prateleira (pedido do dono): cada produto ganha um quadrado colorido em
// cima dele. Verde ja entra; amarelo confirma com um toque; vermelho a pessoa diz o
// nome. A cada quadrado resolvido, a contagem da despensa vai se completando, e no fim
// o estoque passa a ser o que a foto mostrou (contagem, substitui).
//
// O quadrado no lugar certo: a imagem que vai para a IA e a MESMA que aparece aqui
// (reduzida e ja de pe no celular), os quadrados sao desenhados em % dela, e cada um e
// conferido de novo pelo recorte (lib/server/prateleira.ts).
//
// Tudo que se confirma aqui vira memoria da casa (0053): o par "o que a IA leu" ->
// "nome da casa" (a proxima foto ja vem verde) e o recorte com a qualidade.

type Caixa = {
  id: string;
  box: Box;
  lido: string; // o que a IA leu (para a memoria)
  nome: string; // nome final, editavel
  cor: Cor;
  corInicial: Cor;
  pronto: boolean;
  unidades: number; // dentro da embalagem: fardo de 12 = 12
  carrinho?: boolean; // foto no mercado: ja estava no carrinho (cinza, nao entra de novo)
  // a segunda olhada (recorte) leu outra coisa: as duas viram opcao de um toque
  opcoes?: string[];
};

type Fase = "foto" | "lendo" | "marcar" | "revisar" | "precos" | "salvando";

const COR: Record<Cor, string> = { verde: "#16a34a", amarelo: "#eab308", vermelho: "#dc2626" };

// Sem `job`: escolher a foto, que vai para a fila em segundo plano (lib/filaPrateleira)
// e a tela fecha na hora. Com `job` (a foto ja lida): marcar, conferir e guardar.
export function PrateleiraModal({
  onClose,
  destino = "estoque",
  job,
  onListaEscrita,
}: {
  onClose: () => void;
  destino?: Destino;
  job?: JobFoto;
  onListaEscrita?: (f: File) => void; // foto de lista no papel: vai para o "entender" (voz)
}) {
  const { stock, addStock, addTripItem, trip, showToast } = useStore();
  const noMercado = destino === "carrinho";
  const ofertas = useListaOfertas();
  const [precos, setPrecos] = useState<Record<string, { qtd: number; preco: string }>>({});
  const [fase, setFase] = useState<Fase>(job ? "lendo" : "foto");
  const [src, setSrc] = useState("");
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");
  const [buscando, setBuscando] = useState(false); // busca padrao de produto aberta
  const [editando, setEditando] = useState(false); // trocar o nome / "nao e nenhum desses"
  // Confronto com o estoque, por produto: so a pessoa sabe se e contagem ou compra nova.
  const [modos, setModos] = useState<Record<string, Modo>>({});
  const [desenhando, setDesenhando] = useState(false);
  const [rascunho, setRascunho] = useState<Box | null>(null);
  const [erro, setErro] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const papel = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const inicioDesenho = useRef<[number, number] | null>(null);
  const segurar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memoria, setMemoria] = useState<Map<string, string>>(() => new Map());
  const [memoriaPronta, setMemoriaPronta] = useState(false);

  // Memoria da casa (0053). Sem a migration aplicada, so nao lembra: o resto funciona.
  useEffect(() => {
    void Promise.resolve(createClient().rpc("mercado_visao_web")).then(({ data }) => {
      const d = data as { ok?: boolean; memoria?: { lido: string; nome: string }[] } | null;
      if (d?.ok) setMemoria(new Map((d.memoria ?? []).map((m) => [m.lido, m.nome])));
    }).finally(() => setMemoriaPronta(true));
  }, []);

  const conhecidos = useMemo(() => [...stock.map((s) => s.name), ...memoria.values()], [stock, memoria]);

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    try {
      const doCarrinho = (trip?.items ?? []).map((t) => t.name);
      await enfileirarPrateleira(arquivo, destino, {
        nomes: [...doCarrinho, ...stock.map((x) => x.name), ...memoria.values()],
        carrinho: noMercado ? doCarrinho : undefined,
      });
      showToast("📸 Analisando a foto. Pode seguir usando o app: aviso quando ficar pronta.");
      onClose();
    } catch {
      setErro("Não consegui abrir essa foto. Tente outra.");
    }
  }

  // Foto ja lida em segundo plano: monta os quadrados com a memoria da casa.
  const montado = useRef(false);
  useEffect(() => {
    if (!job || !memoriaPronta || montado.current) return;
    montado.current = true;
    void canvasDe(job.src).then((c) => (canvasRef.current = c)).catch(() => {});
    const achados = job.achados ?? [];
    const conferidos = job.conferidos ?? [];
    const lista: Caixa[] = achados.map((a, i) => {
      const lembrado = a.nome ? daMemoria(a.nome, memoria) : null;
      const conf = conferidos[i] ?? undefined;
      // Sem nome da primeira leitura: usa o da segunda olhada (nunca "produto sem nome"
      // quando alguma das duas viu o produto).
      const nome = lembrado ?? (a.nome || conf || "");
      const vizinhos = achados.filter((_, k) => k !== i).map((x) => x.nome).filter(Boolean);
      const cor = corDe({ nome, legivel: a.legivel || !!lembrado, conferido: conf, daMemoria: !!lembrado, conhecidos, vizinhos });
      const opcoes = cor !== "verde" ? [...new Set([nome, conf].filter((x): x is string => !!x))] : undefined;
      return { id: `c${i}`, box: a.box, lido: a.nome, nome: cor === "vermelho" ? (conf || nome || "") : nome, cor, corInicial: cor, pronto: cor === "verde", unidades: unidadesDe(a), opcoes };
    });
    setSrc(job.src);
    setCaixas(noMercado ? marcarCarrinho(lista, trip?.items ?? []).map((c) => (c.carrinho ? { ...c, pronto: true } : c)) : lista);
    setFase("marcar");
  }, [job, memoriaPronta, memoria, conhecidos, noMercado, trip]);

  const atual = caixas.find((c) => c.id === sel) ?? null;
  const prontos = caixas.filter((c) => c.pronto).length;

  function abrir(c: Caixa) {
    setSel(c.id);
    setEditando(false);
    setNomeEdit(c.pronto || c.cor !== "vermelho" ? "" : c.nome);
    setBuscando(false);
  }

  function resolver(id: string, nome: string) {
    const n = acentuar(nome.trim().replace(/\s+/g, " "));
    if (!n) return showToast("Escreva o nome do produto.");
    setCaixas((l) => l.map((c) => (c.id === id ? { ...c, nome: n, pronto: true, cor: "verde" } : c)));
    // proximo pendente, para seguir sem procurar
    const prox = caixas.find((c) => c.id !== id && !c.pronto);
    if (prox) abrir(prox);
    else setSel(null);
  }

  function apagar(id: string) {
    setCaixas((l) => l.filter((c) => c.id !== id));
    setSel(null);
    showToast("Quadrado apagado");
  }

  // Desenhar o que faltou: arrasta o dedo em volta do produto.
  function pontoRel(e: React.PointerEvent): [number, number] {
    const r = areaRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))];
  }

  const prontosOk = caixas.filter((c) => c.pronto && c.nome.trim());
  const gruposProntos = agrupar(prontosOk);
  const modoDe = (nome: string): Modo => modos[chaveLido(nome)] ?? "substituir";

  // Guardar: se algum produto ja existe no estoque, mostra o confronto primeiro.
  function irGuardar() {
    if (!prontosOk.length) return showToast("Confirme pelo menos um produto.");
    if (noMercado) {
      setPrecos(Object.fromEntries(gruposCarrinho().map((g) => [g.chave, { qtd: g.novos, preco: g.preco }])));
      return setFase("precos");
    }
    if (gruposProntos.some((g) => produtoDoEstoque(g.nome, stock))) return setFase("revisar");
    void guardar();
  }

  async function guardar() {
    const ok = prontosOk;
    if (!ok.length) return showToast("Confirme pelo menos um produto.");
    setFase("salvando");
    const grupos = gruposProntos;
    const r = await acertarEstoque(
      grupos.map((g) => ({ nome: g.nome, qtd: g.qtd, unidade: unitFor(g.nome), modo: modoDe(g.nome) })),
      stock,
      addStock,
    );
    // Memoria: o que a IA leu -> o nome confirmado, e o recorte com a qualidade.
    aprender(ok);
    const pendentes = caixas.length - ok.length;
    showToast(
      [
        r.ok.length ? `🏠 Despensa: ${grupos.map((g) => `${nomeBonito(g.nome)} ${g.qtd}`).join(", ")}` : "",
        r.falhou.length ? `não gravei ${r.falhou.join(", ")}` : "",
        pendentes ? `${pendentes} ficaram de fora` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    if (job) tirarJob(job.id);
    onClose();
  }

  // Preco do produto: o ultimo que a casa pagou; senao a oferta (do mercado onde esta, primeiro).
  function precoDe(nome: string): string {
    const ult = findByName(nome, stock)?.priceLast;
    if (ult) return String(ult);
    const m = mercadoAtual();
    const casam = ofertas.filter((o) => casaItem(o, nome)).sort(maisBarato);
    const o = casam.find((x) => x.mercado === m) ?? casam[0];
    return o ? String(o.preco_por) : "";
  }

  // Por produto: quantos a foto mostra, quantos o carrinho ja tem, quantos sao novos.
  function gruposCarrinho() {
    return agrupar(prontosOk).map((g) => {
      const ja = (trip?.items ?? []).filter((t) => mesmoProduto(t.name, g.nome)).reduce((s, t) => s + t.quantity, 0);
      return { chave: chaveLido(g.nome), nome: g.nome, foto: g.qtd, ja, novos: Math.max(0, g.qtd - ja), preco: precoDe(g.nome) };
    });
  }

  function aprender(ok: Caixa[]) {
    const c = canvasRef.current;
    const itens = ok
      .filter((x) => !x.carrinho)
      .map((x) => ({
        lido: x.lido ? chaveLido(x.lido) : "",
        nome: x.nome.trim(),
        qualidade: qualidadeDe(x.corInicial),
        imagem: c ? recorte(c, x.box, 112).toDataURL("image/jpeg", 0.7) : null,
      }));
    if (itens.length) void Promise.resolve(createClient().rpc("mercado_visao_aprender_web", { p_itens: itens })).catch(() => {});
  }

  async function guardarCarrinho() {
    const grupos = gruposCarrinho().filter((g) => (precos[g.chave]?.qtd ?? 0) > 0);
    if (!grupos.length) return showToast("Nada novo para pôr no carrinho.");
    setFase("salvando");
    const feitos: string[] = [];
    const falhou: string[] = [];
    let total = 0;
    for (const g of grupos) {
      const p = precos[g.chave];
      const preco = p.preco.trim() === "" ? null : Number(p.preco.replace(",", ".")) || null;
      const r = await addTripItem({ name: g.nome, price: preco, qty: p.qtd, unit: unitFor(g.nome) });
      if (r.ok) {
        feitos.push(`${nomeBonito(g.nome)} ${p.qtd}`);
        total += (preco ?? 0) * p.qtd;
      } else falhou.push(nomeBonito(g.nome));
    }
    aprender(prontosOk);
    showToast(
      [feitos.length ? `🛒 ${feitos.join(", ")}${total ? ` · ${brl(total)}` : ""}` : "", falhou.length ? `não pus ${falhou.join(", ")}` : ""]
        .filter(Boolean)
        .join(" · "),
    );
    if (job) tirarJob(job.id);
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={620}>
      <div className="mb-3 pr-12">
        {(noMercado || fase !== "foto") && (
          <div className="text-[13px] font-bold text-brand">{noMercado ? "🛒 Foto do carrinho" : "📸 Foto dos produtos"}</div>
        )}
        <div className="text-[20px] font-extrabold">
          {fase === "revisar"
            ? "Somar ou substituir?"
            : fase === "precos"
            ? "Conferir preços"
            : noMercado && (fase === "marcar" || fase === "salvando")
            ? `${caixas.filter((c) => c.pronto && !c.carrinho).length} de ${caixas.filter((c) => !c.carrinho).length} novos prontos`
            : fase === "marcar" || fase === "salvando"
            ? `${prontos} de ${caixas.length} prontos`
            : fase === "lendo"
              ? "Abrindo…"
              : "Fotografe sua despensa"}
        </div>
        {fase === "marcar" && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-card-2">
            <div className="h-full rounded-full bg-pos transition-[width] duration-300" style={{ width: `${(prontos / (caixas.length || 1)) * 100}%` }} />
          </div>
        )}
      </div>

      {fase === "foto" && (
        <div className="flex flex-col gap-2">
          {noMercado && (
            <p className="rounded-[13px] bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand">
              🛒 Fotografe o carrinho a cada corredor: só os novos entram.
            </p>
          )}
          {/* A venda da funcao em uma imagem: o visor da camera sobre uma prateleira
              e CADA produto reconhecido ao mesmo tempo, com o nome. Sem legenda de
              cores: isso a pessoa aprende na tela de conferir. */}
          <div className="processo relative mb-1 overflow-hidden rounded-[18px] bg-card-2 px-4 pb-3 pt-5">
            {/* cantos do visor */}
            <span aria-hidden className="absolute left-2.5 top-2.5 h-5 w-5 rounded-tl-md border-l-[3px] border-t-[3px] border-text" />
            <span aria-hidden className="absolute right-2.5 top-2.5 h-5 w-5 rounded-tr-md border-r-[3px] border-t-[3px] border-text" />
            <span aria-hidden className="absolute bottom-2.5 left-2.5 h-5 w-5 rounded-bl-md border-b-[3px] border-l-[3px] border-text" />
            <span aria-hidden className="absolute bottom-2.5 right-2.5 h-5 w-5 rounded-br-md border-b-[3px] border-r-[3px] border-text" />
            {/* luz que varre, como na leitura de verdade */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 h-10 animate-[varrer_2.4s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-pos/20 to-transparent" />
            <div className="relative grid grid-cols-4 gap-2" aria-label="Uma foto reconhece vários produtos de uma vez">
              {[
                { ic: "🍝", nome: "Macarrão" },
                { ic: "🥫", nome: "Molho" },
                { ic: "🧃", nome: "Suco" },
                { ic: "🥛", nome: "Leite" },
              ].map((p, k) => (
                <div key={p.nome} className="flex flex-col items-center gap-1">
                  <div
                    className="relative grid h-14 w-full place-items-center rounded-xl border-[3px] border-pos bg-card text-[30px] animate-[surgir_0.5s_ease_both]"
                    style={{ animationDelay: `${0.2 + k * 0.25}s` }}
                  >
                    <span aria-hidden>{p.ic}</span>
                    <span aria-hidden className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-pos text-[11px] font-extrabold text-white">✓</span>
                  </div>
                  <span className="max-w-full truncate rounded-full bg-pos-soft px-1.5 py-0.5 text-[11px] font-bold text-pos">{p.nome}</span>
                </div>
              ))}
            </div>
            {/* prateleira */}
            <div aria-hidden className="relative mt-1.5 h-1.5 rounded-full bg-border" />
          </div>
          <p className="mb-1 text-center text-[15px] font-extrabold">
            1 foto → <span className="text-pos">todos os produtos</span> de uma vez
          </p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Tirar foto dos produtos"
            onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={galeria} type="file" accept="image/*" className="hidden" aria-label="Foto da galeria"
            onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => camera.current?.click()} className="h-[72px] rounded-[18px] bg-brand text-[17px] font-extrabold text-brand-ink">
            📷 Tirar foto
          </button>
          <button onClick={() => galeria.current?.click()} className="h-12 rounded-[14px] border-2 border-border bg-card text-[15px] font-bold">
            🖼 Escolher da galeria
          </button>
          {onListaEscrita && (
            <>
              <input ref={papel} type="file" accept="image/*" className="hidden" aria-label="Foto de uma lista escrita"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onListaEscrita(f); }} />
              <button onClick={() => papel.current?.click()} className="h-10 text-[13px] font-bold text-text-2 underline">
                📝 É uma lista escrita no papel
              </button>
            </>
          )}
          {erro && <p className="rounded-[13px] border border-border bg-card-2 p-3 text-[13px] text-text-2">{erro}</p>}
        </div>
      )}

      {fase === "precos" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-2">
            Só o que é <b>novo</b> entra (o que já estava no carrinho fica de fora). Confira a quantidade e o preço de
            cada um.
          </p>
          <div className="flex max-h-[52dvh] flex-col gap-2.5 overflow-y-auto">
            {gruposCarrinho().map((g) => {
              const p = precos[g.chave] ?? { qtd: g.novos, preco: g.preco };
              const v = Number(p.preco.replace(",", ".")) || 0;
              const mudar = (x: Partial<{ qtd: number; preco: string }>) => setPrecos((m) => ({ ...m, [g.chave]: { ...p, ...x } }));
              return (
                <div key={g.chave} className={`rounded-[14px] border border-border bg-card p-3 ${p.qtd ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <FotoItem nome={g.nome} className="h-11 w-11 shrink-0 rounded-[10px] border border-border" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{nomeBonito(g.nome)}</div>
                      <div className="truncate text-[12px] text-text-2">
                        📷 na foto: {g.foto}
                        {g.ja ? ` · 🛒 já tinha ${g.ja}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-[15px] font-extrabold">{v && p.qtd ? brl(v * p.qtd) : "—"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label="Menos um" onClick={() => mudar({ qtd: Math.max(0, p.qtd - 1) })} className="h-10 w-10 rounded-[10px] border-2 border-border bg-card text-[18px] font-extrabold">−</button>
                      <span className="min-w-[2.5ch] text-center text-[17px] font-extrabold">{p.qtd}</span>
                      <button type="button" aria-label="Mais um" onClick={() => mudar({ qtd: p.qtd + 1 })} className="h-10 w-10 rounded-[10px] border-2 border-border bg-card text-[18px] font-extrabold">+</button>
                    </div>
                    <span className="text-[13px] text-text-2">un ×</span>
                    <label className="flex h-10 min-w-[96px] flex-1 items-center rounded-[10px] border border-border bg-card-2 px-2">
                      <span className="text-[13px] text-text-2">R$</span>
                      <input
                        inputMode="decimal"
                        value={p.preco}
                        onChange={(e) => mudar({ preco: e.target.value })}
                        placeholder="0,00"
                        aria-label={`Preço de ${nomeBonito(g.nome)}`}
                        className="h-full w-full min-w-0 bg-transparent px-1 text-[16px]"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-baseline justify-between px-1 text-[15px]">
            <span className="font-bold text-text-2">Total dos novos</span>
            <span className="text-[18px] font-extrabold">
              {brl(gruposCarrinho().reduce((t, g) => {
                const p = precos[g.chave];
                return t + (p ? (Number(p.preco.replace(",", ".")) || 0) * p.qtd : 0);
              }, 0))}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFase("marcar")} className="h-[54px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Voltar
            </button>
            <button onClick={() => void guardarCarrinho()} className="h-[54px] flex-[2] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
              🛒 Pôr no carrinho
            </button>
          </div>
        </div>
      )}

      {fase === "revisar" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-2">
            Alguns já estão no estoque. Para cada um: <b>somar</b> (chegou compra) ou <b>substituir</b> (contei o que tem)?
          </p>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-bold text-text-2">Todos:</span>
            {(["somar", "substituir"] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModos(Object.fromEntries(gruposProntos.map((g) => [chaveLido(g.nome), m])))}
                className="h-9 rounded-full border-2 border-border bg-card px-3 font-bold"
              >
                {m === "somar" ? "＋ Somar" : "＝ Substituir"}
              </button>
            ))}
          </div>
          <div className="flex max-h-[52dvh] flex-col gap-2.5 overflow-y-auto">
            {gruposProntos.map((g) => {
              const est = produtoDoEstoque(g.nome, stock);
              return (
                <div key={g.nome} className="rounded-[14px] border border-border bg-card p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <FotoItem nome={g.nome} className="h-9 w-9 rounded-[8px]" />
                      <span className="truncate text-[15px] font-extrabold">{nomeBonito(g.nome)}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-text-2">
                      📷 foto: <b>{g.qtd}</b>
                      {est ? (
                        <>
                          {" "}· 🏠 estoque: <b>{est.current}</b> {est.unit}
                        </>
                      ) : null}
                    </span>
                  </div>
                  {est ? (
                    <SomarOuSubstituir
                      compacto
                      atual={est.current}
                      unidade={est.unit}
                      qtd={g.qtd}
                      modo={modoDe(g.nome)}
                      onModo={(m) => setModos((x) => ({ ...x, [chaveLido(g.nome)]: m }))}
                    />
                  ) : (
                    <div className="text-[12px] font-bold text-pos">🆕 Novo no estoque: entra com {g.qtd}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFase("marcar")} className="h-[54px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Voltar
            </button>
            <button onClick={() => void guardar()} className="h-[54px] flex-[2] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
              🏠 Guardar na despensa
            </button>
          </div>
        </div>
      )}

      {(fase === "lendo" || fase === "marcar" || fase === "salvando") && src && (
        <div
          ref={areaRef}
          className="relative mx-auto w-fit max-w-full select-none overflow-hidden rounded-[14px] bg-black"
          style={{ touchAction: desenhando ? "none" : "auto" }}
          onPointerDown={(e) => {
            if (!desenhando) return;
            inicioDesenho.current = pontoRel(e);
            setRascunho(null);
          }}
          onPointerMove={(e) => {
            if (!desenhando || !inicioDesenho.current) return;
            const [y0, x0] = inicioDesenho.current;
            const [y1, x1] = pontoRel(e);
            setRascunho([Math.min(y0, y1), Math.min(x0, x1), Math.max(y0, y1), Math.max(x0, x1)]);
          }}
          onPointerUp={() => {
            if (!desenhando) return;
            inicioDesenho.current = null;
            if (rascunho && (rascunho[2] - rascunho[0]) * (rascunho[3] - rascunho[1]) > 0.002) {
              const nova: Caixa = { id: `m${Date.now()}`, box: rascunho, lido: "", nome: "", cor: "vermelho", corInicial: "vermelho", pronto: false, unidades: 1 };
              setCaixas((l) => [...l, nova]);
              abrir(nova);
            }
            setRascunho(null);
            setDesenhando(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a mesma imagem que foi para a IA */}
          <img src={src} alt="Foto dos produtos" className={`block h-auto max-h-[46dvh] w-auto max-w-full ${fase === "lendo" ? "opacity-60" : ""}`} draggable={false} />
          {fase === "lendo" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[14px] font-bold text-white">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Procurando e conferindo cada produto…
              </div>
            </div>
          )}
          {caixas.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`${c.nome || "Produto sem nome"} (${c.pronto ? "pronto" : c.cor})`}
              onClick={() => !desenhando && abrir(c)}
              onPointerDown={() => {
                if (desenhando) return;
                segurar.current = setTimeout(() => apagar(c.id), 650); // segurar = apagar
              }}
              onPointerUp={() => segurar.current && clearTimeout(segurar.current)}
              onPointerLeave={() => segurar.current && clearTimeout(segurar.current)}
              className="absolute rounded-[6px] transition-[box-shadow]"
              style={{
                top: `${c.box[0] * 100}%`,
                left: `${c.box[1] * 100}%`,
                height: `${(c.box[2] - c.box[0]) * 100}%`,
                width: `${(c.box[3] - c.box[1]) * 100}%`,
                border: c.carrinho ? "2.5px dashed #9ca3af" : `2.5px solid ${COR[c.pronto ? "verde" : c.cor]}`,
                background: sel === c.id ? `${COR[c.pronto ? "verde" : c.cor]}33` : "transparent",
                boxShadow: sel === c.id ? `0 0 0 3px #fff` : undefined,
              }}
            >
              <span
                className="absolute -top-[9px] left-1/2 grid h-[18px] min-w-[18px] -translate-x-1/2 place-items-center rounded-full px-1 text-[10px] font-extrabold leading-none text-white shadow ring-2 ring-white"
                style={{ background: c.carrinho ? "#6b7280" : COR[c.pronto ? "verde" : c.cor] }}
              >
                {c.carrinho ? "🛒" : c.pronto ? "✓" : c.cor === "vermelho" ? "?" : i + 1}
              </span>
              {c.unidades > 1 && (
                <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                  ×{c.unidades}
                </span>
              )}
            </button>
          ))}
          {rascunho && (
            <div
              className="pointer-events-none absolute rounded-[6px] border-[3px] border-dashed border-white"
              style={{ top: `${rascunho[0] * 100}%`, left: `${rascunho[1] * 100}%`, height: `${(rascunho[2] - rascunho[0]) * 100}%`, width: `${(rascunho[3] - rascunho[1]) * 100}%` }}
            />
          )}
        </div>
      )}

      {fase === "marcar" && (
        <div className="mt-3 flex flex-col gap-2">
          {atual ? (
            <div
              className="rounded-[16px] border-2 p-3"
              style={{ borderColor: COR[atual.pronto ? "verde" : atual.cor] }}
            >
              {atual.nome && !(atual.cor === "vermelho" && !atual.pronto && (atual.opcoes?.length ?? 0) > 1) && (
                <Cartao nome={atual.nome} unidades={atual.unidades} rotulo={atual.carrinho ? "🛒 Já está no carrinho" : atual.pronto ? "✓ Pronto" : atual.cor === "amarelo" ? "É isso mesmo?" : "Acho que é"} />
              )}
              {atual.cor === "amarelo" && !atual.pronto ? (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => resolver(atual.id, atual.nome)} className="h-12 flex-[1.4] rounded-[14px] bg-pos text-[15px] font-bold text-pos-ink">
                    ✓ Confirmar
                  </button>
                  <button
                    onClick={() => {
                      setCaixas((l) => l.map((c) => (c.id === atual.id ? { ...c, cor: "vermelho" } : c)));
                      setEditando(true);
                    }}
                    className="h-12 flex-1 rounded-[14px] border-2 border-border bg-card text-[14px] font-bold"
                  >
                    ✏️ Não é
                  </button>
                </div>
              ) : atual.carrinho ? (
                <button
                  onClick={() => setCaixas((l) => l.map((c) => (c.id === atual.id ? { ...c, carrinho: false } : c)))}
                  className="mt-2 text-[13px] font-bold text-brand underline"
                >
                  Não, peguei mais um: contar como novo
                </button>
              ) : atual.pronto && !editando ? (
                <button onClick={() => setEditando(true)} className="mt-2 text-[13px] font-bold text-brand underline">
                  ✏️ Trocar o produto
                </button>
              ) : (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    resolver(atual.id, nomeEdit);
                  }}
                >
                  {!atual.pronto && atual.opcoes && atual.opcoes.length > 1 && (
                    <>
                      <div className="mb-2 text-[13px] font-bold text-text-2">Fiquei em dúvida. Qual é?</div>
                      <div className="mb-3 flex flex-col gap-2">
                        {atual.opcoes.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => resolver(atual.id, o)}
                            className="flex items-center gap-3 rounded-[14px] border-2 border-border bg-card p-2 text-left active:border-brand"
                          >
                            <FotoItem nome={o} className="h-12 w-12 rounded-[10px]" />
                            <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-tight">{nomeBonito(o)}</span>
                            <span className="pr-2 text-[18px] text-pos" aria-hidden>✓</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {(atual.pronto || !atual.nome || editando || !(atual.opcoes && atual.opcoes.length > 1)) && (
                    <>
                      <div className="mb-1.5 text-[13px] font-bold text-text-2">
                        {atual.nome ? "Não é? Escreva o produto certo" : "Que produto é este? (pode ditar pelo teclado)"}
                      </div>
                      <div className="flex gap-2">
                        <input
                          autoFocus={!atual.nome}
                          value={nomeEdit}
                          onChange={(e) => {
                            setNomeEdit(e.target.value);
                            setBuscando(true);
                          }}
                          placeholder="Ex.: iogurte"
                          enterKeyHint="done"
                          className="h-12 min-w-0 flex-1 rounded-[13px] border border-border bg-card-2 px-3 text-[16px]"
                        />
                        <button type="submit" className="h-12 rounded-[14px] bg-pos px-4 text-[15px] font-bold text-pos-ink">
                          ✓
                        </button>
                      </div>
                    </>
                  )}
                  {!editando && atual.opcoes && atual.opcoes.length > 1 && (
                    <button type="button" onClick={() => setEditando(true)} className="text-[13px] font-bold text-brand underline">
                      ✏️ Não é nenhum desses
                    </button>
                  )}
                  {buscando && nomeEdit.trim().length >= 2 && (
                    <div className="mt-2">
                      <Sugestoes
                        termo={nomeEdit}
                        onEscolher={(e) => {
                          setBuscando(false);
                          resolver(atual.id, e.nome);
                        }}
                      />
                    </div>
                  )}
                </form>
              )}
              <div className="mt-3 flex items-center justify-between gap-2 rounded-[12px] bg-card-2 px-3 py-2">
                <span className="text-[13px] font-bold text-text-2">
                  {atual.unidades > 1 ? "📦 Caixa/fardo: unidades dentro" : "Unidades neste quadrado"}
                </span>
                <div className="flex items-center gap-1">
                  {[-1, 1].map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-label={d < 0 ? "Menos uma unidade" : "Mais uma unidade"}
                      onClick={() => setCaixas((l) => l.map((c) => (c.id === atual.id ? { ...c, unidades: Math.max(1, c.unidades + d) } : c)))}
                      className={`grid h-10 w-10 place-items-center rounded-[10px] border-2 border-border bg-card text-[18px] font-extrabold ${d > 0 ? "order-3" : ""}`}
                    >
                      {d < 0 ? "−" : "+"}
                    </button>
                  ))}
                  <span className="order-2 min-w-[2.5ch] text-center text-[17px] font-extrabold">{atual.unidades}</span>
                </div>
              </div>
              <button onClick={() => apagar(atual.id)} className="mt-2 text-[13px] font-bold text-text-3 underline">
                🗑 Não é produto: apagar este quadrado
              </button>
            </div>
          ) : (
            <p className="text-center text-[13px] text-text-2">
              Toque num quadrado para confirmar ou corrigir. Segure para apagar.
            </p>
          )}

          <button
            onClick={() => {
              setDesenhando((v) => !v);
              setSel(null);
            }}
            className={`h-11 rounded-[14px] border-2 text-[14px] font-bold ${desenhando ? "border-brand bg-brand-soft text-brand" : "border-dashed border-border bg-card"}`}
          >
            {desenhando ? "Arraste o dedo em volta do produto…" : "+ Marcar produto que faltou"}
          </button>
          <button onClick={irGuardar} className="h-[54px] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
            {noMercado ? "🛒 Conferir preços e pôr no carrinho" : `🏠 Guardar ${prontos} na despensa`}
          </button>
          {job && (
            <button
              onClick={() => {
                tirarJob(job.id);
                showToast("Foto descartada");
                onClose();
              }}
              className="h-10 text-[13px] font-bold text-text-3 underline"
            >
              🗑 Descartar esta foto
            </button>
          )}
        </div>
      )}
      {fase === "salvando" && <p className="mt-3 text-center text-[14px] font-bold text-text-2">Guardando…</p>}
    </Modal>
  );
}

// Produto reconhecido: fotinha + nome bem escrito (+ quantas unidades).
function Cartao({ nome, unidades, rotulo }: { nome: string; unidades: number; rotulo: string }) {
  return (
    <div className="flex items-center gap-3">
      <FotoItem nome={nome} className="h-14 w-14 rounded-[12px] border border-border" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-text-2">{rotulo}</div>
        <div className="text-[18px] font-extrabold leading-tight">{nomeBonito(nome)}</div>
      </div>
      {unidades > 1 && <span className="rounded-full bg-card-2 px-2.5 py-1 text-[14px] font-extrabold">×{unidades}</span>}
    </div>
  );
}
