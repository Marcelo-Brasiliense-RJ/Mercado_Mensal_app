"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { acertarEstoque } from "@/lib/acertarEstoque";
import { unitFor } from "@/lib/defaults";
import {
  agrupar,
  chaveLido,
  corDe,
  daMemoria,
  limpar,
  qualidadeDe,
  type Achado,
  type Box,
  type Cor,
} from "@/lib/prateleira";

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
  // a segunda olhada (recorte) leu outra coisa: as duas viram opcao de um toque
  opcoes?: string[];
};

type Fase = "foto" | "lendo" | "marcar" | "salvando";

const LADO = 1600; // px do lado maior: nitido para ler rotulo, leve para subir no 4G

async function prepararFoto(arquivo: File): Promise<HTMLCanvasElement> {
  // imageOrientation: a foto do iPhone vem deitada no arquivo; aqui ela ja fica de pe,
  // e e ESSA que vai para a IA e para a tela (os quadrados batem nas duas).
  const img = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const k = Math.min(1, LADO / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function recorte(c: HTMLCanvasElement, b: Box, lado: number): HTMLCanvasElement {
  const x = b[1] * c.width;
  const y = b[0] * c.height;
  const w = Math.max(1, (b[3] - b[1]) * c.width);
  const h = Math.max(1, (b[2] - b[0]) * c.height);
  const k = Math.min(lado / w, lado / h);
  const r = document.createElement("canvas");
  r.width = lado;
  r.height = lado;
  const g = r.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, lado, lado);
  g.drawImage(c, x, y, w, h, (lado - w * k) / 2, (lado - h * k) / 2, w * k, h * k);
  return r;
}

// Grade numerada dos recortes, para a conferencia (uma chamada so para todos).
function grade(c: HTMLCanvasElement, boxes: Box[]): string {
  const lado = 200;
  const cols = Math.ceil(Math.sqrt(boxes.length));
  const linhas = Math.ceil(boxes.length / cols);
  const g = document.createElement("canvas");
  g.width = cols * lado;
  g.height = linhas * lado;
  const ctx = g.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, g.width, g.height);
  boxes.forEach((b, i) => {
    const x = (i % cols) * lado;
    const y = Math.floor(i / cols) * lado;
    ctx.drawImage(recorte(c, b, lado - 8), x + 4, y + 4);
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 4, y + 4, 34, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(String(i + 1), x + 10, y + 24);
  });
  return g.toDataURL("image/jpeg", 0.85);
}

const COR: Record<Cor, string> = { verde: "#16a34a", amarelo: "#eab308", vermelho: "#dc2626" };

export function PrateleiraModal({ onClose, onUmSo }: { onClose: () => void; onUmSo?: (f: File) => void }) {
  const { stock, addStock, showToast } = useStore();
  const [fase, setFase] = useState<Fase>("foto");
  const [src, setSrc] = useState("");
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");
  const [desenhando, setDesenhando] = useState(false);
  const [rascunho, setRascunho] = useState<Box | null>(null);
  const [erro, setErro] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const inicioDesenho = useRef<[number, number] | null>(null);
  const segurar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memoria, setMemoria] = useState<Map<string, string>>(() => new Map());

  // Memoria da casa (0053). Sem a migration aplicada, so nao lembra: o resto funciona.
  useEffect(() => {
    void Promise.resolve(createClient().rpc("mercado_visao_web")).then(({ data }) => {
      const d = data as { ok?: boolean; memoria?: { lido: string; nome: string }[] } | null;
      if (d?.ok) setMemoria(new Map((d.memoria ?? []).map((m) => [m.lido, m.nome])));
    });
  }, []);

  const conhecidos = useMemo(() => [...stock.map((s) => s.name), ...memoria.values()], [stock, memoria]);

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setFase("lendo");
    try {
      const c = await prepararFoto(arquivo);
      canvasRef.current = c;
      const foto = c.toDataURL("image/jpeg", 0.85);
      setSrc(foto);
      const r = await fetch("/api/prateleira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foto }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok: true; itens: Achado[] }
        | { ok: false; erro: string; espera?: number }
        | null;
      if (!d?.ok) {
        setErro(
          d?.erro === "limite"
            ? `A IA está no limite agora. Tente em ${d.espera ?? 30}s.`
            : d?.erro === "ia_indisponivel"
              ? "A IA de fotos não está configurada."
              : "Não consegui ler a foto. Tente de novo.",
        );
        return setFase("foto");
      }
      const achados = limpar(d.itens);
      if (!achados.length) {
        setErro("Não achei produtos nessa foto. Chegue mais perto, com os rótulos de frente.");
        return setFase("foto");
      }
      // Um produto so: e foto de produto, nao de prateleira. Vai pelo caminho de sempre.
      if (achados.length === 1 && onUmSo) {
        onUmSo(arquivo);
        return onClose();
      }

      // Conferencia: o recorte de cada quadrado e lido de novo. Falhou? Segue sem ela.
      let conferidos: (string | undefined)[] = achados.map(() => undefined);
      try {
        const rc = await fetch("/api/prateleira", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grade: grade(c, achados.map((a) => a.box)), n: achados.length }),
        });
        const dc = (await rc.json().catch(() => null)) as { ok?: boolean; nomes?: string[] } | null;
        if (dc?.ok && dc.nomes) conferidos = dc.nomes;
      } catch {
        /* sem conferencia: a cor fica so pela leitura e pela base */
      }

      const mem = memoria;
      const lista: Caixa[] = achados.map((a, i) => {
        const lembrado = a.nome ? daMemoria(a.nome, mem) : null;
        const nome = lembrado ?? a.nome;
        const cor = corDe({ nome, legivel: a.legivel || !!lembrado, conferido: conferidos[i], daMemoria: !!lembrado, conhecidos });
        const segunda = conferidos[i];
        const opcoes = cor === "vermelho" ? [...new Set([segunda, nome].filter((x): x is string => !!x))] : undefined;
        return { id: `c${i}`, box: a.box, lido: a.nome, nome: cor === "vermelho" ? (segunda || nome || "") : nome, cor, corInicial: cor, pronto: cor === "verde", opcoes };
      });
      setCaixas(lista);
      setFase("marcar");
    } catch {
      setErro("Não consegui abrir essa foto. Tente outra.");
      setFase("foto");
    }
  }

  const atual = caixas.find((c) => c.id === sel) ?? null;
  const prontos = caixas.filter((c) => c.pronto).length;

  function abrir(c: Caixa) {
    setSel(c.id);
    setNomeEdit(c.nome);
  }

  function resolver(id: string, nome: string) {
    const n = nome.trim();
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

  async function guardar() {
    const ok = caixas.filter((c) => c.pronto && c.nome.trim());
    if (!ok.length) return showToast("Confirme pelo menos um produto.");
    setFase("salvando");
    const grupos = agrupar(ok);
    const r = await acertarEstoque(
      grupos.map((g) => ({ nome: g.nome, qtd: g.qtd, unidade: unitFor(g.nome) })),
      stock,
      addStock,
    );
    // Memoria: o que a IA leu -> o nome confirmado, e o recorte com a qualidade.
    const c = canvasRef.current;
    const aprender = ok.map((x) => ({
      lido: x.lido ? chaveLido(x.lido) : "",
      nome: x.nome.trim(),
      qualidade: qualidadeDe(x.corInicial),
      imagem: c ? recorte(c, x.box, 112).toDataURL("image/jpeg", 0.7) : null,
    }));
    void Promise.resolve(createClient().rpc("mercado_visao_aprender_web", { p_itens: aprender })).catch(() => {});
    const pendentes = caixas.length - ok.length;
    showToast(
      [
        r.ok.length ? `🏠 Despensa: ${grupos.map((g) => `${g.nome} ${g.qtd}`).join(", ")}` : "",
        r.falhou.length ? `não gravei ${r.falhou.join(", ")}` : "",
        pendentes ? `${pendentes} ficaram de fora` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={620}>
      <div className="mb-3 pr-12">
        <div className="text-[13px] font-bold text-brand">🗄️ Foto da prateleira</div>
        <div className="text-[20px] font-extrabold">
          {fase === "marcar" || fase === "salvando"
            ? `${prontos} de ${caixas.length} prontos`
            : fase === "lendo"
              ? "Procurando os produtos…"
              : "Fotografe a prateleira inteira"}
        </div>
        {fase === "marcar" && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-card-2">
            <div className="h-full rounded-full bg-pos transition-[width] duration-300" style={{ width: `${(prontos / (caixas.length || 1)) * 100}%` }} />
          </div>
        )}
      </div>

      {fase === "foto" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-text-2">
            Um quadrado aparece em cada produto: <b className="text-pos">verde</b> já entrou,{" "}
            <b className="text-warn">amarelo</b> você confirma, <b className="text-neg">vermelho</b> você diz o nome. A
            contagem vira o estoque.
          </p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Tirar foto da prateleira"
            onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={galeria} type="file" accept="image/*" className="hidden" aria-label="Foto da galeria"
            onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => camera.current?.click()} className="h-[72px] rounded-[18px] bg-brand text-[17px] font-extrabold text-brand-ink">
            📷 Tirar foto da prateleira
          </button>
          <button onClick={() => galeria.current?.click()} className="h-12 rounded-[14px] border-2 border-border bg-card text-[15px] font-bold">
            🖼 Escolher da galeria
          </button>
          {erro && <p className="rounded-[13px] border border-border bg-card-2 p-3 text-[13px] text-text-2">{erro}</p>}
        </div>
      )}

      {(fase === "lendo" || fase === "marcar" || fase === "salvando") && src && (
        <div
          ref={areaRef}
          className="relative select-none overflow-hidden rounded-[14px] bg-black"
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
              const nova: Caixa = { id: `m${Date.now()}`, box: rascunho, lido: "", nome: "", cor: "vermelho", corInicial: "vermelho", pronto: false };
              setCaixas((l) => [...l, nova]);
              abrir(nova);
            }
            setRascunho(null);
            setDesenhando(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a mesma imagem que foi para a IA */}
          <img src={src} alt="Foto da prateleira" className={`block w-full ${fase === "lendo" ? "opacity-60" : ""}`} draggable={false} />
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
                border: `2.5px solid ${COR[c.pronto ? "verde" : c.cor]}`,
                background: sel === c.id ? `${COR[c.pronto ? "verde" : c.cor]}33` : "transparent",
                boxShadow: sel === c.id ? `0 0 0 3px #fff` : undefined,
              }}
            >
              <span
                className="absolute -top-[9px] left-1/2 grid h-[18px] min-w-[18px] -translate-x-1/2 place-items-center rounded-full px-1 text-[10px] font-extrabold leading-none text-white shadow ring-2 ring-white"
                style={{ background: COR[c.pronto ? "verde" : c.cor] }}
              >
                {c.pronto ? "✓" : c.cor === "vermelho" ? "?" : i + 1}
              </span>
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
              {atual.cor === "amarelo" && !atual.pronto ? (
                <>
                  <div className="text-[13px] font-bold text-text-2">É isso mesmo?</div>
                  <div className="mb-2 text-[18px] font-extrabold">{atual.nome}</div>
                  <div className="flex gap-2">
                    <button onClick={() => resolver(atual.id, atual.nome)} className="h-12 flex-[1.4] rounded-[14px] bg-pos text-[15px] font-bold text-pos-ink">
                      ✓ Confirmar
                    </button>
                    <button onClick={() => setCaixas((l) => l.map((c) => (c.id === atual.id ? { ...c, cor: "vermelho" } : c)))} className="h-12 flex-1 rounded-[14px] border-2 border-border bg-card text-[14px] font-bold">
                      ✏️ Não é
                    </button>
                  </div>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    resolver(atual.id, nomeEdit);
                  }}
                >
                  <div className="mb-1.5 text-[13px] font-bold text-text-2">
                    {atual.pronto
                      ? "Nome do produto"
                      : atual.opcoes && atual.opcoes.length > 1
                        ? "Fiquei em dúvida. Qual é?"
                        : "Que produto é este? (pode ditar pelo teclado)"}
                  </div>
                  {!atual.pronto && atual.opcoes && atual.opcoes.length > 1 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {atual.opcoes.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => resolver(atual.id, o)}
                          className="h-11 rounded-[12px] border-2 border-border bg-card px-3 text-[14px] font-bold"
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      autoFocus={!atual.pronto}
                      value={nomeEdit}
                      onChange={(e) => setNomeEdit(e.target.value)}
                      placeholder="Ex.: café Pilão"
                      enterKeyHint="done"
                      className="h-12 min-w-0 flex-1 rounded-[13px] border border-border bg-card-2 px-3 text-[16px]"
                    />
                    <button type="submit" className="h-12 rounded-[14px] bg-pos px-4 text-[15px] font-bold text-pos-ink">
                      ✓
                    </button>
                  </div>
                </form>
              )}
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
          <button onClick={guardar} className="h-[54px] rounded-[14px] bg-brand text-[16px] font-extrabold text-brand-ink">
            🏠 Guardar {prontos} na despensa
          </button>
        </div>
      )}
      {fase === "salvando" && <p className="mt-3 text-center text-[14px] font-bold text-text-2">Guardando…</p>}
    </Modal>
  );
}
