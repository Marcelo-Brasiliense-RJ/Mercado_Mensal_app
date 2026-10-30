"use client";

import { useEffect, useRef, useState } from "react";
import { AvisoParecido } from "@/components/ui/AvisoParecido";
import { AvisoMaisBarato } from "@/components/ofertas/AvisoMaisBarato";
import { AvisoPrecoSubiu } from "@/components/ofertas/AvisoPrecoSubiu";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { BarcodeIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { unitFor, findByName } from "@/lib/defaults";
import { isTypedBarcode, onlyDigits, prettyBarcode } from "@/lib/barcode";
import { BarcodeScanner } from "./BarcodeScanner";
import { DestinoSwitch, type Destino } from "@/components/ui/Destino";
import { quantoPedir, TambemNaLista } from "@/components/ui/TambemNaLista";
import { useLugar } from "@/lib/lugar";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { ehRuim, nomeMercado, termoEvitar } from "@/lib/ofertas";
import { marcarRuim, useEvitar } from "@/components/ofertas/useEvitar";
import { precoNoMercado } from "@/lib/precoMercado";
import { usePrecosVistos } from "@/lib/precosVistos";
import { enfileirarFoto, marcarLeitor, useFilaFotos } from "@/lib/filaFotos";

// Ler o codigo, dizer a quantidade, pronto: o item cai no carrinho.
//
// Por que existe: dentro do mercado, digitar o nome do produto e a parte cara da
// entrada (regra 1 da secao 0.1 do tarefas.md, nunca perguntar duas vezes). A
// embalagem ja diz qual e o produto. Da primeira vez que um codigo aparece, o app
// pergunta o nome UMA vez e guarda o vinculo; da segunda em diante so a quantidade.
//
// O leitor nao fecha depois de cada item: fecha o ciclo e volta a ler, porque no
// mercado se pega um produto atras do outro.
//
// Destino pela tela: aberto do Estoque, o codigo SOMA em casa (ou da baixa, "Usei"),
// sem preco e sem carrinho; aberto da Lista, vai para o carrinho. A chave no topo
// troca na hora.

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field = "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

type Fase = "ler" | "confirmar";

export function BarcodeModal({
  open,
  onClose,
  destinoPadrao = "carrinho",
}: {
  open: boolean;
  onClose: () => void;
  destinoPadrao?: "estoque" | "carrinho";
}) {
  const { findBarcode, addTripItemByBarcode, addStockByBarcode, addShopItem, baixaStock, showToast, trip, stock } = useStore();
  // Dentro de um mercado conhecido (GPS), o codigo vai para o carrinho de qualquer tela.
  const { noMercado, mercado } = useLugar();
  // No mercado identificado, o preco ja vem DAQUELE mercado: encarte ou ultimo visto la.
  const ofertas = useListaOfertas();
  const vistos = usePrecosVistos(noMercado ? mercado : null);
  const [origemPreco, setOrigemPreco] = useState<string | null>(null);
  // Produto da lista "Não compro" (0045): avisa antes de pegar.
  const evitar = useEvitar();
  function sugerirPreco(n: string, code: string) {
    // nomeMercado devolve o proprio nome para mercado fora da lista ("Atacadão")
    const s = precoNoMercado(n, code, noMercado ? mercado : null, ofertas, vistos, nomeMercado);
    if (!s) return;
    setPreco(String(s.preco));
    setOrigemPreco(s.texto);
  }
  const padrao: Destino = noMercado ? "carrinho" : destinoPadrao;
  const [destino, setDestino] = useState<Destino>(padrao);
  const emCasa = destino === "estoque";
  const paraLista = destino === "lista";
  // Guardar em casa e ja pedir na lista ("tem, mas esta acabando").
  const [tambem, setTambem] = useState(false);

  const [fase, setFase] = useState<Fase>("ler");
  const [codigo, setCodigo] = useState("");
  const [conhecido, setConhecido] = useState(false);
  const [marca, setMarca] = useState("");
  // Foto da embalagem vinda da base publica: confere num relance se leu o produto certo.
  const [foto, setFoto] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("un");
  const [preco, setPreco] = useState("");
  const [digitado, setDigitado] = useState("");
  // O nome vem pronto do codigo; editar e excecao, entao o campo so aparece
  // quando a pessoa pede. Menos coisa na tela, menos duvida.
  const [editandoNome, setEditandoNome] = useState(false);
  const [semCamera, setSemCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  // O que ja entrou nesta sessao de leitura, so pra dar retorno visivel sem
  // precisar fechar o leitor e conferir o carrinho.
  const [lidos, setLidos] = useState<string[]>([]);
  // Foto do produto quando o codigo nao le (amassado, curvo, sem codigo): vai para a
  // fila da IA e a pessoa segue lendo. Ao fechar o leitor, cada uma vira um popup
  // "e isso mesmo?" (FilaFotos, no AppShell).
  const inputFoto = useRef<HTMLInputElement>(null);
  const { fila } = useFilaFotos();
  const naFila = fila.filter((x) => x.estado === "preparando" || x.estado === "esperando" || x.estado === "reconhecendo").length;
  const prontas = fila.filter((x) => x.estado === "pronto" || x.estado === "falhou").length;
  useEffect(() => {
    marcarLeitor(open);
    return () => marcarLeitor(false);
  }, [open]);

  async function resolver(code: string) {
    {
      setBusy(true);
      const info = await findBarcode(code);
      setBusy(false);
      setCodigo(code);
      setFase("confirmar");
      setQtd("1");
      setOrigemPreco(null);
      if (info?.encontrado) {
        setConhecido(true);
        setNome(info.nome);
        setUnidade(info.unidade || unitFor(info.nome));
        setPreco(info.preco != null ? String(info.preco) : "");
        sugerirPreco(info.nome, code);
      } else {
        // Codigo novo para esta casa: antes de pedir o nome, pergunta na base
        // publica. Ler o codigo e ainda ter que digitar "refrigerante" quebra a
        // promessa do leitor.
        setConhecido(false);
        setNome("");
        setUnidade("un");
        setPreco("");
        setMarca("");
        try {
          const r = await fetch(`/api/produto?codigo=${encodeURIComponent(code)}`);
          const d = (await r.json()) as {
            ok?: boolean;
            encontrado?: boolean;
            nome?: string;
            unidade?: string | null;
            marca?: string;
            foto?: string | null;
          };
          if (d?.ok && d.encontrado && d.nome) {
            setNome(d.nome);
            setMarca(d.marca ?? "");
            setFoto(d.foto ?? null);
            setUnidade(d.unidade || unitFor(d.nome));
            // Preco da ultima compra desse item, se a casa ja comprou.
            const jaTem = findByName(d.nome, stock);
            if (jaTem?.priceLast != null) setPreco(String(jaTem.priceLast));
            sugerirPreco(d.nome, code);
          }
        } catch {
          // Base fora do ar: segue como antes, com o campo vazio.
        }
      }
    }
  }

  // Nome digitado na primeira leitura: unidade pela palavra e preco da ultima
  // compra, se a casa ja tem esse item (regra 2, campo nasce preenchido).
  function onNome(v: string) {
    setNome(v);
    if (conhecido) return;
    const item = findByName(v, stock);
    setUnidade(item?.unit ?? unitFor(v));
    setPreco(item?.priceLast != null ? String(item.priceLast) : "");
  }

  function voltarALer() {
    setFase("ler");
    setCodigo("");
    setNome("");
    setPreco("");
    setQtd("1");
    setUnidade("un");
    setConhecido(false);
    setFoto(null);
    setDigitado("");
    setEditandoNome(false);
  }

  function fechar() {
    onClose();
    voltarALer();
    setLidos([]);
    setSemCamera(false);
    setDestino(padrao);
  }

  function buscarDigitado() {
    const code = onlyDigits(digitado);
    if (!isTypedBarcode(code)) return showToast("Código de barras inválido.");
    resolver(code);
  }

  async function guardar() {
    setBusy(true);
    const r = await addStockByBarcode({
      code: codigo,
      name: nome.trim(),
      qty: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
    });
    if (r.ok && tambem) {
      const pedir = quantoPedir(nome, Number(qtd.replace(",", ".")) || 1, stock);
      await addShopItem({ name: nome.trim(), desired_quantity: pedir.qtd, unit: unidade, estimated_price: pedir.preco });
    }
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setLidos((l) => [`+${qtd} ${nome.trim()}`, ...l]);
    showToast(`${nome.trim()}: +${qtd} ${unidade} no estoque${tambem ? " e na lista" : ""}`, { desfazer: !tambem });
    setTambem(false);
    voltarALer();
  }

  // Dar baixa lendo a embalagem: "usei" tira do estoque o que ja existe em casa.
  async function usei() {
    const item = findByName(nome, stock);
    if (!item) return showToast("Esse produto ainda não está no estoque.");
    setBusy(true);
    const q = Number(qtd.replace(",", ".")) || 1;
    const r = await baixaStock(item.id, q);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setLidos((l) => [`-${qtd} ${nome.trim()}`, ...l]);
    showToast(`${nome.trim()}: usei ${qtd} ${item.unit}`, { desfazer: true });
    voltarALer();
  }

  async function pegar() {
    if (!nome.trim()) return showToast("Diga o nome do produto.");
    if (emCasa) return guardar();
    if (paraLista) {
      setBusy(true);
      const r = await addShopItem({
        name: nome.trim(),
        desired_quantity: Number(qtd.replace(",", ".")) || 1,
        unit: unidade,
        estimated_price: preco.trim() === "" ? (findByName(nome, stock)?.priceLast ?? null) : Number(preco.replace(",", ".")) || null,
      });
      setBusy(false);
      if (!r.ok) return showToast(r.erro);
      setLidos((l) => [`📝 ${nome.trim()}`, ...l]);
      showToast(`${nome.trim()} na lista`);
      return voltarALer();
    }
    setBusy(true);
    const r = await addTripItemByBarcode({
      code: codigo,
      name: nome.trim(),
      // Sem preco digitado o banco cai no ultimo pago; se o item nunca foi
      // comprado, ele responde sem_preco e o toast pede o valor.
      price: preco.trim() === "" ? null : Number(preco.replace(",", ".")) || 0,
      qty: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    setLidos((l) => [nome.trim(), ...l]);
    showToast(`${nome.trim()} no carrinho`);
    voltarALer();
  }

  const total = trip?.total ?? 0;
  // O que ESTE item vai somar, mostrado no proprio botao: confere o preco antes
  // de confirmar, sem precisar fazer conta de cabeca no corredor.
  const totalItem =
    (Number(qtd.replace(",", ".")) || 0) * (Number(preco.replace(",", ".")) || 0);

  return (
    <Modal open={open} onClose={fechar} maxWidth={440}>
      <div className="mb-[18px] flex items-start justify-between gap-3 pr-12">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-brand">
            <BarcodeIcon size={18} />
            Leitor de código
          </div>
          <div className="text-[19px] font-extrabold">
            {fase === "ler"
              ? "Leia o código do produto"
              : emCasa
                ? "Quanto tem aí?"
                : paraLista
                  ? "Quanto quer comprar?"
                  : "Quanto você pegou?"}
          </div>
        </div>
        {trip && !emCasa && (
          <div className="shrink-0 text-right">
            <div className="text-[18px] font-extrabold leading-none">{brl(total)}</div>
            <div className="mt-1 text-[12px] text-text-3">no carrinho</div>
          </div>
        )}
      </div>

      {noMercado && destinoPadrao !== "carrinho" && (
        <div className="mb-2 text-[12px] font-bold text-brand">📍 Você está num mercado: vai para o carrinho</div>
      )}
      <DestinoSwitch valor={destino} opcoes={["estoque", "lista", "carrinho"]} onChange={setDestino} />

      {fase === "ler" ? (
        <>
          {!semCamera && (
            <div className="mb-3.5">
              <BarcodeScanner onResult={resolver} onError={() => setSemCamera(true)} />
            </div>
          )}
          {semCamera && (
            <p className="mb-3.5 rounded-[13px] border border-border bg-card-2 p-3 text-[13px] leading-snug text-text-2">
              Não consegui abrir a câmera. Digite os números que ficam embaixo do
              código de barras.
            </p>
          )}

          <label className={labelCls}>Ou digite o código</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              buscarDigitado();
            }}
            className="mb-4 flex gap-2"
          >
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              inputMode="numeric"
              placeholder="7891234567890"
              aria-label="Código de barras"
              className={field}
            />
            <button
              type="submit"
              disabled={busy || !digitado.trim()}
              className="h-12 shrink-0 rounded-[13px] bg-brand px-5 text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              Buscar
            </button>
          </form>

          <input
            ref={inputFoto}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Foto do produto"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void enfileirarFoto(f, emCasa ? "estoque" : "carrinho");
              showToast("📷 Foto na fila. Pode ler o próximo.");
            }}
          />
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            className="mb-1.5 h-[50px] w-full rounded-[14px] border-2 border-dashed border-brand text-[15px] font-bold text-brand"
          >
            📷 Não leu? Tire uma foto do produto
          </button>
          <p className="mb-4 text-center text-[12px] text-text-3">
            {naFila || prontas
              ? `${naFila ? `${naFila} reconhecendo` : ""}${naFila && prontas ? " · " : ""}${prontas ? `${prontas} pronta${prontas > 1 ? "s" : ""}` : ""}. Você confere ao fechar o leitor.`
              : "A IA reconhece em fila e você confere depois, sem esperar."}
          </p>

          {lidos.length > 0 && (
            <div className="mb-4 rounded-[13px] border border-border bg-card-2 p-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-3">
                Nesta leitura
              </div>
              <div className="text-[13px] leading-relaxed text-text-2">
                {lidos.join(" · ")}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={fechar}
            className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
          >
            {lidos.length > 0 ? "Concluir" : "Fechar"}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pegar();
          }}
        >
          {/* O produto em destaque, nao num campo de formulario: a pessoa
              precisa RECONHECER o que leu num relance, nao ler um rotulo de
              campo. Trocar o nome e excecao, entao vira um link discreto. */}
          <div className="mb-4 rounded-[16px] border-[1.5px] border-brand bg-brand/5 p-4">
            <div className="flex items-start gap-3">
              {foto && (
                // eslint-disable-next-line @next/next/no-img-element -- foto da loja, so referencia visual
                <img src={foto} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain" />
              )}
              <div className="min-w-0 text-[20px] font-extrabold leading-tight">{nome || "Produto novo"}</div>
            </div>
            <div className="mt-1 text-[12px] text-text-3">
              {marca ? `${marca} · ` : ""}
              {prettyBarcode(codigo)}
            </div>
            {!editandoNome ? (
              <button
                type="button"
                onClick={() => setEditandoNome(true)}
                className="mt-2 text-[13px] font-bold text-brand"
              >
                {nome ? "Não é esse? Trocar o nome" : "Escrever o nome"}
              </button>
            ) : (
              <input
                value={nome}
                onChange={(e) => onNome(e.target.value)}
                placeholder="Ex.: Arroz"
                className={`${field} mt-2.5`}
                autoFocus
              />
            )}
          </div>

          {!conhecido && (
            <AvisoParecido
              nome={nome}
              onUsar={(n, u) => {
                setNome(n);
                setUnidade(u);
              }}
            />
          )}

          {(() => {
            const ruim = nome ? ehRuim(nome, evitar, codigo) : null;
            return ruim ? (
              <div className="mb-4 rounded-[14px] border-2 border-neg bg-neg-soft p-3 text-neg" role="alert">
                <div className="text-[16px] font-extrabold">⚠️ Você marcou como ruim</div>
                <div className="text-[13px]">{ruim.motivo ?? "Está na sua lista Não compro."}</div>
              </div>
            ) : nome ? (
              <button
                type="button"
                onClick={async () => {
                  const ok = await marcarRuim({ termo: termoEvitar(nome, marca), nome, barcode: codigo, foto });
                  showToast(ok ? `👎 ${nome} no Não compro` : "Não deu para marcar.");
                }}
                className="-mt-2 mb-3 text-[13px] font-bold text-text-2 underline"
              >
                👎 Produto ruim? Marcar para não comprar
              </button>
            ) : null;
          })()}

          <div className="mb-4">
            <label className={labelCls}>Quantidade</label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
              </div>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                aria-label="Unidade"
                className="h-12 w-[78px] shrink-0 rounded-[13px] border border-border bg-card-2 px-2 text-[15px]"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {emCasa ? (
            <>
            <p className="mb-3 rounded-[13px] bg-card-2 p-3 text-[13px] text-text-2">
              {(() => {
                const item = findByName(nome, stock);
                return item
                  ? `Em casa agora: ${item.current} ${item.unit}. "Guardar" soma, "Usei" tira.`
                  : "Ainda não está no estoque: “Guardar” cria o item.";
              })()}
            </p>
            <TambemNaLista valor={tambem} onChange={setTambem} />
            </>
          ) : (
            <>
          <label className={labelCls}>{paraLista ? "Preço (se souber)" : "Quanto custou?"} (por {unidade})</label>
          <div className="relative mb-1.5">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-text-3">
              R$
            </span>
            <input
              value={preco}
              onChange={(e) => {
                setPreco(e.target.value);
                setOrigemPreco(null);
              }}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Preço"
              // Nome e quantidade ja vem prontos: o teclado abre direto no unico
              // campo que a pessoa precisa preencher.
              autoFocus={Boolean(nome) && !editandoNome}
              className="h-[58px] w-full rounded-[14px] border border-border bg-card-2 pl-[52px] pr-4 text-[22px] font-bold"
            />
          </div>
          {origemPreco ? (
            <p className="mb-5 text-[13px] font-bold text-brand">📍 {origemPreco}. Confira e confirme.</p>
          ) : (
            <p className="mb-5 text-[12px] text-text-3">
              Em branco, usamos o preço da última compra desse item.
            </p>
          )}

          <AvisoPrecoSubiu nome={nome} preco={preco.trim() === "" ? null : Number(preco.replace(",", ".")) || null} />
          <AvisoMaisBarato
            nome={nome}
            preco={preco.trim() === "" ? null : Number(preco.replace(",", ".")) || null}
            unidade={unidade}
            qtd={Number(qtd.replace(",", ".")) || 1}
            onFeito={voltarALer}
          />

            </>
          )}

          <div data-rodape className="flex gap-3">
            {emCasa && findByName(nome, stock) ? (
              <button
                type="button"
                onClick={usei}
                disabled={busy}
                className="h-[56px] flex-1 rounded-[14px] border-2 border-border bg-card text-[15px] font-bold disabled:opacity-50"
              >
                − Usei
              </button>
            ) : (
              <button
                type="button"
                onClick={voltarALer}
                className="h-[56px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
              >
                Ler outro
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !nome.trim()}
              className="h-[56px] flex-[2] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
            >
              {busy
                ? "Salvando…"
                : emCasa
                  ? tambem
                    ? "+ Guardar e pôr na lista"
                    : "+ Guardar no estoque"
                  : paraLista
                  ? "📝 Pôr na lista"
                  : totalItem > 0
                  ? `Colocar · ${brl(totalItem)}`
                  : "Colocar no carrinho"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
