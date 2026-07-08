# Import de compra pela NFC-e (QR da nota) — Fase 1 (web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No app web, escanear o QR do cupom NFC-e (RJ), puxar os itens da SEFAZ via Edge Function compartilhada, revisar e gravar a compra no estoque, sem fotografar item a item.

**Architecture:** Uma Supabase Edge Function `nfce-consulta` recebe a URL do QR (decodificada no navegador), busca a página da SEFAZ-RJ, parseia os itens, normaliza descrição fiscal para nome genérico + marca via Groq e valida a soma contra o total. O web escaneia o QR (BarcodeDetector com fallback JS), mostra a revisão e grava por uma RPC nova (`mercado_apply_receipt_web`) que reusa o miolo de aplicar compra. Dedup pela chave de acesso.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno/TS), Next.js (App Router) + Supabase JS no web, Groq (llama-3.3-70b) para normalização, deno-dom para parse de HTML, zxing-wasm/jsQR para fallback de leitura de QR no navegador.

## Global Constraints

- Só RJ. Portal alvo: `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=...` (copiar verbatim).
- Sem mensalidade: normalização usa Groq no free tier; nenhuma API paga.
- Segredos nunca no cliente: chave Groq só como secret da Edge Function (Supabase secrets). Alinhado ao `SECURITY.md` e à migration 0007.
- Contrato de item idêntico ao da 0005: `{ nome, marca, qtd, preco, unidade }`, `nome` genérico minúsculo, marca separada, qtd/preço número com ponto decimal. `desc_fiscal` extra só para a UI de revisão.
- Números (qtd, preço, unidade) vêm da SEFAZ e NÃO passam por LLM. LLM só produz `nome` e `marca`.
- Padrão do banco: tabelas com RLS ligado sem policy (só service_role); leitura/escrita do web por RPC `security definer set search_path = public`, household resolvido por `select household_id from household_members where auth_user_id = auth.uid() limit 1`, `grant execute ... to authenticated`.
- Next.js deste repo tem breaking changes: ler `node_modules/next/dist/docs/` antes de codar no web (ver `web/AGENTS.md`).
- Migrations são idempotentes quando possível (`create table if not exists`, `create or replace function`). Próximo número: `0014`.
- Fase 1 é web-only. O modo `image_base64` da Edge Function (decode de QR no servidor) e o caminho Telegram ficam para a Fase 2 (plano separado).

---

## Estrutura de arquivos

**Criar:**
- `supabase/migrations/0014_receipt_web.sql` — tabela `receipts`, refactor `mercado_apply_purchase_h`, RPC `mercado_apply_receipt_web`.
- `supabase/functions/nfce-consulta/index.ts` — handler HTTP (Deno.serve): valida entrada, orquestra fetch + parse + normalize + validação, responde JSON.
- `supabase/functions/nfce-consulta/parse.ts` — parser puro do HTML da SEFAZ-RJ (`parseNfceHtml`) + helpers de número. Sem rede.
- `supabase/functions/nfce-consulta/normalize.ts` — normalização via Groq (`normalizeItems`).
- `supabase/functions/nfce-consulta/parse_test.ts` — teste do parser contra fixture real.
- `supabase/functions/nfce-consulta/fixtures/nfce-rj-sample.html` — HTML real de uma NFC-e do RJ (capturado do usuário).
- `web/src/lib/nfce.ts` — cliente: `invokeNfce(qrUrl)` (chama a função) + `toReviewRows(resp)` (mapeia para a UI) + tipos.
- `web/src/lib/nfce.test.ts` — teste puro de `toReviewRows` e validação de URL.
- `web/src/components/receipt/QrScanner.tsx` — leitura de QR pela câmera (BarcodeDetector + fallback).

**Modificar:**
- `web/src/components/receipt/ReceiptModal.tsx` — captura QR + revisão real + confirmação via RPC (remove o `SAMPLE` mock).
- `web/src/lib/store.tsx` — `confirmReceipt`/novo `importReceipt` chamando `mercado_apply_receipt_web` e `reloadData()`.

---

## Task 1: Banco — tabela `receipts`, refactor `_h` e RPC `mercado_apply_receipt_web`

**Files:**
- Create: `supabase/migrations/0014_receipt_web.sql`

**Interfaces:**
- Consumes: `households(id)`, `products`, `purchases`, `shopping_list`, `household_members(auth_user_id, household_id)`, `mercado_resolve_household(bigint)` (existentes).
- Produces:
  - `mercado_apply_purchase_h(p_h uuid, p_name text, p_brand text, p_price numeric, p_qty numeric, p_unit text) returns json` — miolo de aplicar compra por household.
  - `mercado_apply_purchase(p_chat_id bigint, p_name text, p_brand text, p_price numeric, p_qty numeric, p_unit text) returns json` — wrapper que resolve household do chat e delega ao `_h` (assinatura preservada).
  - `mercado_apply_receipt_web(p_items jsonb, p_chave text, p_emitente text, p_total numeric) returns json` — grava a nota inteira do web. Retorno: `{ ok, itens, novos, total, economia }` ou `{ ok:false, erro:'sem_familia'|'ja_importada' }`.
  - tabela `receipts(household_id uuid, chave text, emitente text, total numeric, source text, imported_at timestamptz)`, único `(household_id, chave)`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/0014_receipt_web.sql`:

```sql
-- 0014_receipt_web.sql
-- Import de compra pela NFC-e no app web (usuario autenticado).
-- Refatora o miolo de aplicar compra para reuso (chat_id e auth.uid()),
-- adiciona dedup por chave de acesso e a RPC de gravar a nota inteira.

-- ===== 1. Tabela de notas importadas (dedup + cache leve) =====
create table if not exists receipts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  chave        text not null,
  emitente     text,
  total        numeric,
  source       text not null default 'web',   -- web | telegram
  imported_at  timestamptz not null default now(),
  unique (household_id, chave)
);
alter table receipts enable row level security;
-- Sem policy: RPCs security definer acessam; cliente nao le direto.

-- ===== 2. Miolo de aplicar compra por household (reuso) =====
-- Mesma logica do mercado_apply_purchase original (0005), mas recebe o household
-- pronto. Nao checa 'sem_familia' (o chamador ja resolveu e checou).
create or replace function mercado_apply_purchase_h(
  p_h uuid, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; prev_price numeric; saved numeric;
begin
  p_name := lower(trim(p_name));

  select id into pid from products where household_id = p_h and name = p_name;
  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (p_h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (p_h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = p_h and product_id = pid and status = 'pending';

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', (select current_stock from products where id = pid),
    'preco_anterior', prev_price, 'economia', saved);
end $$;

-- ===== 3. Wrapper por chat_id (Telegram) delega ao miolo =====
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_apply_purchase_h(h, p_name, p_brand, p_price, p_qty, p_unit);
end $$;

-- ===== 4. Gravar a nota inteira (web) =====
-- Resolve household pelo auth.uid(), dedup pela chave, aplica item a item.
create or replace function mercado_apply_receipt_web(
  p_items jsonb, p_chave text, p_emitente text default null, p_total numeric default 0)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it jsonb; r json;
        total numeric := 0; economia numeric := 0; n int := 0; novos int := 0;
        item_name text; qtd numeric; preco numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  if p_chave is not null and exists (
      select 1 from receipts where household_id = hid and chave = p_chave) then
    return json_build_object('ok', false, 'erro', 'ja_importada');
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    item_name := lower(trim(coalesce(it->>'nome','')));
    if item_name = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);

    perform 1 from products where household_id = hid and name = item_name;
    if not found then novos := novos + 1; end if;

    r := mercado_apply_purchase_h(hid, item_name, nullif(it->>'marca',''),
           preco, qtd, coalesce(nullif(it->>'unidade',''), 'un'));

    n := n + 1;
    total := total + preco * qtd;
    economia := economia + coalesce((r->>'economia')::numeric, 0);
  end loop;

  if p_chave is not null then
    insert into receipts (household_id, chave, emitente, total, source)
      values (hid, p_chave, p_emitente, nullif(p_total,0), 'web')
      on conflict (household_id, chave) do nothing;
  end if;

  return json_build_object('ok', true, 'itens', n, 'novos', novos,
    'total', round(total, 2), 'economia', round(economia, 2));
end $$;

-- ===== 5. Permissoes =====
revoke execute on all functions in schema public from public, anon;
grant execute on function
  mercado_apply_purchase_h(uuid, text, text, numeric, numeric, text),
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text)
  to service_role;
grant execute on function
  mercado_apply_receipt_web(jsonb, text, text, numeric)
  to authenticated;
```

- [ ] **Step 2: Aplicar a migration no Supabase**

Aplicar via o fluxo do projeto (SQL editor do Supabase ou `supabase db push`). Confirmar que roda sem erro.
Esperado: sem erro; funções e tabela criadas.

- [ ] **Step 3: Escrever e rodar o smoke test SQL (falha antes, passa depois)**

Rodar este bloco no SQL editor (usa um chat/usuário de teste e limpa no fim). Como `mercado_apply_receipt_web` depende de `auth.uid()`, o smoke aqui testa o miolo `_h` e o dedup por chave direto:

```sql
do $$
declare fam json; h uuid; r json; cid bigint := 999999014;
begin
  fam := mercado_create_family(cid, 'Casa Teste 0014', 'Tester');
  h := mercado_resolve_household(cid);

  -- aplica dois itens pelo miolo _h
  perform mercado_apply_purchase_h(h, 'arroz', 'tio joao', 5.49, 2, 'un');
  perform mercado_apply_purchase_h(h, 'feijao', null, 8.90, 3, 'un');

  assert (select current_stock from products where household_id=h and name='arroz') = 2, 'estoque arroz';
  assert (select par_level     from products where household_id=h and name='feijao') = 3, 'par_level feijao';

  -- dedup: insere uma receipt e confirma unicidade
  insert into receipts (household_id, chave, emitente, total, source)
    values (h, 'CHAVE_TESTE_0014', 'Mercado X', 44.17, 'web');
  begin
    insert into receipts (household_id, chave, source) values (h, 'CHAVE_TESTE_0014', 'web');
    raise exception 'dedup falhou: aceitou chave duplicada';
  exception when unique_violation then
    null; -- esperado
  end;

  -- limpeza
  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SMOKE TEST 0014 OK';
end $$;
```
Esperado: `NOTICE: SMOKE TEST 0014 OK`, sem exceção.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_receipt_web.sql
git commit -m "feat(db): import de nota web (receipts, apply_purchase_h, apply_receipt_web)"
```

---

## Task 2: Capturar a fixture de HTML real da SEFAZ-RJ

**Files:**
- Create: `supabase/functions/nfce-consulta/fixtures/nfce-rj-sample.html`

**Interfaces:**
- Produces: um arquivo HTML real da página de consulta NFC-e do RJ, usado como fonte de verdade dos seletores no Task 3.

Esta tarefa é manual e destrava o parser. Sem HTML real, os seletores seriam chute.

- [ ] **Step 1: Obter a URL do QR de um cupom real**

Escanear com qualquer leitor de QR o cupom (ex.: o da foto de referência). Copiar a URL, que começa com `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=...`.

- [ ] **Step 2: Abrir a URL no navegador e salvar o HTML renderizado**

Abrir a URL, esperar a página dos itens carregar, e salvar o código-fonte (Ctrl+S "somente HTML" ou copiar o `outerHTML` do `document` via DevTools) em:
`supabase/functions/nfce-consulta/fixtures/nfce-rj-sample.html`.

- [ ] **Step 3: Conferir que o HTML tem os itens**

Abrir o arquivo e confirmar que aparecem as descrições dos produtos, quantidades e o total (ex.: buscar por "Vl. Unit" ou pelo nome de um produto). Se a página exigiu CAPTCHA, anotar (muda o design) e parar para reavaliar.
Esperado: HTML com a lista de itens presente.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/nfce-consulta/fixtures/nfce-rj-sample.html
git commit -m "test(nfce): fixture de HTML real da NFC-e RJ para o parser"
```

---

## Task 3: Parser puro do HTML da SEFAZ-RJ (`parse.ts`)

**Files:**
- Create: `supabase/functions/nfce-consulta/parse.ts`
- Test: `supabase/functions/nfce-consulta/parse_test.ts`

**Interfaces:**
- Consumes: a fixture do Task 2; `deno-dom` (`https://deno.land/x/deno_dom/deno-dom-wasm.ts`).
- Produces:
  - `parseBrNumber(s: string): number` — "1.542,46" → 1542.46.
  - `type NfceItem = { desc_fiscal: string; qtd: number; unidade: string; preco: number; total_item: number }`
  - `type NfceParsed = { emitente: string; chave: string; total_nota: number; itens: NfceItem[] }`
  - `parseNfceHtml(html: string): NfceParsed` — parse sem rede.

Os seletores abaixo são os da webapp padrão `consultaNFCe` (usada pelo RJ). São o ponto de partida; o teste é montado a partir da fixture real e, se o RJ divergir, ajusta-se os seletores até o teste passar.

- [ ] **Step 1: Escrever o teste falhando a partir da fixture**

Antes, abrir a fixture e anotar os valores reais esperados (nome de 1-2 itens, qtd, preço, total da nota). Preencher os asserts com esses valores reais. Criar `supabase/functions/nfce-consulta/parse_test.ts`:

```ts
import { assertEquals, assert } from "https://deno.land/std/assert/mod.ts";
import { parseNfceHtml, parseBrNumber } from "./parse.ts";

Deno.test("parseBrNumber lida com milhar e virgula", () => {
  assertEquals(parseBrNumber("1.542,46"), 1542.46);
  assertEquals(parseBrNumber("5,49"), 5.49);
  assertEquals(parseBrNumber("12"), 12);
});

Deno.test("parseNfceHtml extrai itens e total da fixture RJ", async () => {
  const html = await Deno.readTextFile(
    new URL("./fixtures/nfce-rj-sample.html", import.meta.url),
  );
  const r = parseNfceHtml(html);

  assert(r.itens.length > 0, "esperava itens");
  // TROCAR pelos valores REAIS lidos da fixture no passo acima:
  // assertEquals(r.itens.length, 117);
  // assertEquals(r.total_nota, 1542.46);
  // assertEquals(r.itens[0].desc_fiscal, "SABONETE FRANCIS ...");
  // assertEquals(r.itens[0].qtd, 1);
  // assertEquals(r.itens[0].preco, 3.99);

  // Invariante: soma dos itens bate com o total (tolerancia p/ desconto/arredondamento)
  const soma = r.itens.reduce((a, i) => a + i.qtd * i.preco, 0);
  assert(Math.abs(soma - r.total_nota) < Math.max(1, r.total_nota * 0.02),
    `soma ${soma} vs total ${r.total_nota}`);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `deno test --allow-read supabase/functions/nfce-consulta/parse_test.ts`
Esperado: FAIL ("Module not found ./parse.ts" ou parse não definido).

- [ ] **Step 3: Implementar o parser**

Criar `supabase/functions/nfce-consulta/parse.ts`:

```ts
import { DOMParser, Element } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

export function parseBrNumber(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

export type NfceItem = {
  desc_fiscal: string; qtd: number; unidade: string; preco: number; total_item: number;
};
export type NfceParsed = {
  emitente: string; chave: string; total_nota: number; itens: NfceItem[];
};

// Texto de um seletor dentro de um escopo, sem os rotulos ("Qtde.:", "UN:", etc).
function txt(scope: Element, sel: string): string {
  const el = scope.querySelector(sel);
  if (!el) return "";
  // remove <strong>rotulo</strong> se houver
  const strong = el.querySelector("strong");
  if (strong) strong.remove();
  return (el.textContent ?? "").trim();
}

export function parseNfceHtml(html: string): NfceParsed {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("html_invalido");

  const rows = Array.from(doc.querySelectorAll("#tabResult tr")) as Element[];
  const itens: NfceItem[] = rows.map((tr) => {
    const nome = txt(tr, ".txtTit") || txt(tr, ".txtTit2");
    const qtd = parseBrNumber(txt(tr, ".Rqtd"));
    const unidade = (txt(tr, ".RUN") || "un").toLowerCase();
    const preco = parseBrNumber(txt(tr, ".RvlUnit"));
    const total_item = parseBrNumber(txt(tr, ".valor"));
    return { desc_fiscal: nome, qtd: qtd || 1, unidade, preco, total_item };
  }).filter((i) => i.desc_fiscal.length > 0);

  const emitente = (doc.querySelector(".txtTopo")?.textContent ?? "").trim();
  const chaveRaw = (doc.querySelector(".chave")?.textContent ?? "").replace(/\D/g, "");
  const total_nota = parseBrNumber(
    doc.querySelector("#totalNota .totalNumb")?.textContent ??
    doc.querySelector(".totalNumb")?.textContent ?? "",
  );

  return { emitente, chave: chaveRaw, total_nota, itens };
}
```

- [ ] **Step 4: Rodar o teste; ajustar seletores até passar**

Run: `deno test --allow-read supabase/functions/nfce-consulta/parse_test.ts`
Se falhar por seletor (itens vazios, total 0), inspecionar a fixture, corrigir os seletores em `parse.ts` para casar com o HTML real do RJ, repetir.
Esperado: PASS com os asserts de valores reais preenchidos.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/nfce-consulta/parse.ts supabase/functions/nfce-consulta/parse_test.ts
git commit -m "feat(nfce): parser do HTML da NFC-e RJ com teste por fixture"
```

---

## Task 4: Normalização fiscal → genérico via Groq (`normalize.ts`)

**Files:**
- Create: `supabase/functions/nfce-consulta/normalize.ts`

**Interfaces:**
- Consumes: `NfceItem[]` do Task 3; env `GROQ_API_KEY`.
- Produces:
  - `type NormItem = { nome: string; marca: string; qtd: number; preco: number; unidade: string; desc_fiscal: string }`
  - `normalizeItems(itens: NfceItem[], apiKey: string): Promise<NormItem[]>` — só `nome`/`marca` vêm do LLM; qtd/preço/unidade vêm dos `itens`.

- [ ] **Step 1: Implementar a normalização**

Criar `supabase/functions/nfce-consulta/normalize.ts`:

```ts
import type { NfceItem } from "./parse.ts";

export type NormItem = {
  nome: string; marca: string; qtd: number; preco: number; unidade: string; desc_fiscal: string;
};

const SYS = `Voce normaliza descricoes fiscais de cupom (NFC-e) brasileiras.
Para cada descricao, devolva o NOME GENERICO do produto (minusculo, sem marca,
sem gramatura) e a MARCA (minusculo, "" se nao houver).
Exemplos:
"CRE DEN COLGATE TRI AC XT" -> nome "creme dental", marca "colgate"
"ABS INTIMUS NAT EXP" -> nome "absorvente", marca "intimus"
"SABONETE FRANCIS BRAS L DOCE" -> nome "sabonete", marca "francis"
Responda SOMENTE um JSON: {"itens":[{"i":0,"nome":"...","marca":"..."}, ...]}`;

export async function normalizeItems(itens: NfceItem[], apiKey: string): Promise<NormItem[]> {
  if (itens.length === 0) return [];
  const lista = itens.map((it, i) => `${i}: ${it.desc_fiscal}`).join("\n");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: lista },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`groq_${resp.status}`);
  const data = await resp.json();
  let parsed: { itens?: { i: number; nome: string; marca: string }[] } = {};
  try { parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
  const byIndex = new Map((parsed.itens ?? []).map((x) => [x.i, x]));

  return itens.map((it, i) => {
    const n = byIndex.get(i);
    return {
      nome: (n?.nome ?? it.desc_fiscal).toLowerCase().trim(),
      marca: (n?.marca ?? "").toLowerCase().trim(),
      qtd: it.qtd, preco: it.preco, unidade: it.unidade, desc_fiscal: it.desc_fiscal,
    };
  });
}
```

- [ ] **Step 2: Sanidade de compilação (type check)**

Run: `deno check supabase/functions/nfce-consulta/normalize.ts`
Esperado: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/nfce-consulta/normalize.ts
git commit -m "feat(nfce): normalizacao fiscal->generico via Groq"
```

---

## Task 5: Handler da Edge Function (`index.ts`) e deploy

**Files:**
- Create: `supabase/functions/nfce-consulta/index.ts`

**Interfaces:**
- Consumes: `parseNfceHtml` (Task 3), `normalizeItems` (Task 4), envs `GROQ_API_KEY`.
- Produces: endpoint `POST /nfce-consulta` com contrato:
  - entrada `{ qr_url: string }`
  - saída ok `{ ok:true, chave, emitente, data, total_nota, total_itens, total_confere, itens: NormItem[] }`
  - saída erro `{ ok:false, erro: 'qr_invalido'|'sefaz_indisponivel'|'parse_falhou'|'total_nao_confere' }`

- [ ] **Step 1: Implementar o handler**

Criar `supabase/functions/nfce-consulta/index.ts`:

```ts
import { parseNfceHtml } from "./parse.ts";
import { normalizeItems } from "./normalize.ts";

const RJ_HOST = "consultadfe.fazenda.rj.gov.br";

function chaveFromQr(qrUrl: string): string {
  try {
    const p = new URL(qrUrl).searchParams.get("p") ?? "";
    return (p.split("|")[0] ?? "").replace(/\D/g, "");
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

  let body: { qr_url?: string };
  try { body = await req.json(); } catch { return json({ ok: false, erro: "qr_invalido" }, 400); }

  const qrUrl = (body.qr_url ?? "").trim();
  if (!qrUrl || !qrUrl.includes(RJ_HOST)) return json({ ok: false, erro: "qr_invalido" }, 400);

  // 1. Buscar a pagina da SEFAZ-RJ
  let html: string;
  try {
    const r = await fetch(qrUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Android) AppleWebKit/537.36 Chrome" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return json({ ok: false, erro: "sefaz_indisponivel" }, 502);
    html = await r.text();
  } catch { return json({ ok: false, erro: "sefaz_indisponivel" }, 502); }

  if (/captcha/i.test(html) && !/tabResult/.test(html)) {
    return json({ ok: false, erro: "captcha_detectado" }, 502);
  }

  // 2. Parse
  let parsed;
  try { parsed = parseNfceHtml(html); } catch { return json({ ok: false, erro: "parse_falhou" }, 502); }
  if (parsed.itens.length === 0) return json({ ok: false, erro: "parse_falhou" }, 502);

  // 3. Normalizar (nome/marca)
  const apiKey = Deno.env.get("GROQ_API_KEY") ?? "";
  let itens;
  try { itens = await normalizeItems(parsed.itens, apiKey); }
  catch { itens = parsed.itens.map((it) => ({
    nome: it.desc_fiscal.toLowerCase(), marca: "", qtd: it.qtd, preco: it.preco,
    unidade: it.unidade, desc_fiscal: it.desc_fiscal })); } // fallback: sem normalizar

  // 4. Validar total
  const total_itens = round2(itens.reduce((a, i) => a + i.qtd * i.preco, 0));
  const total_nota = round2(parsed.total_nota);
  const tol = Math.max(1, total_nota * 0.02);
  const total_confere = total_nota === 0 ? true : Math.abs(total_itens - total_nota) <= tol;

  const chave = parsed.chave || chaveFromQr(qrUrl);
  return json({
    ok: true, chave, emitente: parsed.emitente, data: null,
    total_nota, total_itens, total_confere, itens,
  });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
```

- [ ] **Step 2: Type check**

Run: `deno check supabase/functions/nfce-consulta/index.ts`
Esperado: sem erros.

- [ ] **Step 3: Configurar o secret e fazer deploy**

```bash
supabase secrets set GROQ_API_KEY=<chave-groq>
supabase functions deploy nfce-consulta
```
Esperado: deploy concluído; a função aparece no painel do Supabase.

- [ ] **Step 4: Testar ponta a ponta com a URL real**

```bash
curl -s -X POST "https://<PROJ>.supabase.co/functions/v1/nfce-consulta" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"qr_url":"https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=..."}'
```
Esperado: JSON com `ok:true`, `itens` preenchidos, `total_confere:true`.
Se `parse_falhou`: rever seletores no Task 3 contra a fixture; se `total_nao_confere`: checar tolerância/parse de número.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/nfce-consulta/index.ts
git commit -m "feat(nfce): edge function nfce-consulta (fetch SEFAZ-RJ + parse + normaliza + valida)"
```

---

## Task 6: Cliente web — `nfce.ts` (invoke + mapeamento) com teste puro

**Files:**
- Create: `web/src/lib/nfce.ts`
- Test: `web/src/lib/nfce.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`.
- Produces:
  - `type NfceResp = { ok: true; chave: string; emitente: string; total_nota: number; total_itens: number; total_confere: boolean; itens: { nome: string; marca: string; qtd: number; preco: number; unidade: string; desc_fiscal: string }[] } | { ok: false; erro: string }`
  - `type ReviewRow = { nome: string; marca: string; qty: number; price: number; unit: string; desc: string }`
  - `isRjQrUrl(url: string): boolean`
  - `toReviewRows(resp: NfceResp): ReviewRow[]`
  - `invokeNfce(qrUrl: string): Promise<NfceResp>`

- [ ] **Step 1: Escrever o teste falhando**

Criar `web/src/lib/nfce.test.ts` (usa o runner de teste já presente no projeto; se não houver, rodar com `node --test` após transpile, ou `vitest` se configurado):

```ts
import { describe, it, expect } from "vitest";
import { isRjQrUrl, toReviewRows } from "./nfce";

describe("nfce helpers", () => {
  it("reconhece URL de QR do RJ", () => {
    expect(isRjQrUrl("https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=x")).toBe(true);
    expect(isRjQrUrl("https://google.com")).toBe(false);
  });

  it("mapeia resposta ok para linhas de revisao", () => {
    const rows = toReviewRows({
      ok: true, chave: "1", emitente: "X", total_nota: 10, total_itens: 10, total_confere: true,
      itens: [{ nome: "arroz", marca: "tio joao", qtd: 2, preco: 5, unidade: "un", desc_fiscal: "ARROZ TJ" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nome: "arroz", qty: 2, price: 5 });
  });

  it("resposta de erro vira lista vazia", () => {
    expect(toReviewRows({ ok: false, erro: "parse_falhou" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run (na pasta `web`): `npx vitest run src/lib/nfce.test.ts`
Esperado: FAIL (módulo `./nfce` não existe). Se o projeto não tiver vitest, adicionar como devDependency antes: `npm i -D vitest`.

- [ ] **Step 3: Implementar `nfce.ts`**

Criar `web/src/lib/nfce.ts`:

```ts
import { createClient } from "@/lib/supabase/client";

export type NfceItem = {
  nome: string; marca: string; qtd: number; preco: number; unidade: string; desc_fiscal: string;
};
export type NfceResp =
  | { ok: true; chave: string; emitente: string; total_nota: number; total_itens: number;
      total_confere: boolean; itens: NfceItem[] }
  | { ok: false; erro: string };

export type ReviewRow = {
  nome: string; marca: string; qty: number; price: number; unit: string; desc: string;
};

export function isRjQrUrl(url: string): boolean {
  return /consultadfe\.fazenda\.rj\.gov\.br\/consultaNFCe/i.test(url);
}

export function toReviewRows(resp: NfceResp): ReviewRow[] {
  if (!resp.ok) return [];
  return resp.itens.map((it) => ({
    nome: it.nome, marca: it.marca, qty: it.qtd, price: it.preco, unit: it.unidade, desc: it.desc_fiscal,
  }));
}

export async function invokeNfce(qrUrl: string): Promise<NfceResp> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("nfce-consulta", {
    body: { qr_url: qrUrl },
  });
  if (error) return { ok: false, erro: "sefaz_indisponivel" };
  return data as NfceResp;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run (na pasta `web`): `npx vitest run src/lib/nfce.test.ts`
Esperado: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/nfce.ts web/src/lib/nfce.test.ts web/package.json web/package-lock.json
git commit -m "feat(web): cliente nfce (invoke edge fn + mapeamento) com teste"
```

---

## Task 7: Componente de leitura de QR pela câmera (`QrScanner.tsx`)

**Files:**
- Create: `web/src/components/receipt/QrScanner.tsx`

**Interfaces:**
- Consumes: `isRjQrUrl` de `@/lib/nfce`.
- Produces: `<QrScanner onResult={(qrUrl: string) => void} onError={(msg: string) => void} />` — abre a câmera, detecta um QR do RJ e chama `onResult` com a URL.

Câmera não é testável em unidade (sem device no CI); a verificação é manual no Task 9. Isolar a lib atrás deste componente.

- [ ] **Step 1: Implementar o componente**

Criar `web/src/components/receipt/QrScanner.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { isRjQrUrl } from "@/lib/nfce";

// BarcodeDetector existe em Chrome/Android; iOS Safari cai no fallback jsQR.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function QrScanner({
  onResult, onError,
}: { onResult: (qrUrl: string) => void; onError: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector: Detector | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const BD = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector })
          .BarcodeDetector;
        if (BD) detector = new BD({ formats: ["qr_code"] });

        const canvas = document.createElement("canvas");
        const jsQR = BD ? null : (await import("jsqr")).default;

        const tick = async () => {
          if (doneRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            let value = "";
            if (detector) {
              const codes = await detector.detect(v);
              value = codes[0]?.rawValue ?? "";
            } else if (jsQR) {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(img.data, img.width, img.height)?.data ?? "";
            }
            if (value && isRjQrUrl(value)) {
              doneRef.current = true;
              onResult(value);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        onError("camera_indisponivel");
      }
    }
    start();

    return () => {
      doneRef.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult, onError]);

  return (
    <div className="relative mx-auto h-[280px] w-full overflow-hidden rounded-[14px] border border-border bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-8 rounded-[12px] border-2 border-white/70" />
    </div>
  );
}
```

- [ ] **Step 2: Instalar a lib de fallback**

Run (na pasta `web`): `npm i jsqr`
Esperado: `jsqr` em `dependencies`.

- [ ] **Step 3: Type check / build**

Run (na pasta `web`): `npx tsc --noEmit`
Esperado: sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/receipt/QrScanner.tsx web/package.json web/package-lock.json
git commit -m "feat(web): componente QrScanner (BarcodeDetector + fallback jsQR)"
```

---

## Task 8: Ligar o `ReceiptModal` (captura QR + revisão real + confirmação)

**Files:**
- Modify: `web/src/components/receipt/ReceiptModal.tsx`
- Modify: `web/src/lib/store.tsx`

**Interfaces:**
- Consumes: `QrScanner` (Task 7), `invokeNfce`/`toReviewRows`/`ReviewRow` (Task 6), RPC `mercado_apply_receipt_web` (Task 1).
- Produces: fluxo do modal `capture(scan QR | foto fallback) -> processing -> review(itens reais editáveis) -> confirm`. `store.importReceipt(items, chave, emitente, total)` chama a RPC e recarrega.

- [ ] **Step 1: Adicionar `importReceipt` ao store**

Em `web/src/lib/store.tsx`, adicionar ao tipo `Store` e ao provider (ao lado de `confirmReceipt`):

```tsx
// no type Store:
importReceipt: (
  items: { nome: string; marca: string; qty: number; price: number; unit: string }[],
  chave: string, emitente: string, total: number,
) => Promise<{ ok: boolean; erro?: string; itens?: number }>;
```

```tsx
// no provider:
const importReceipt = useCallback(
  async (
    items: { nome: string; marca: string; qty: number; price: number; unit: string }[],
    chave: string, emitente: string, total: number,
  ) => {
    const p_items = items.map((i) => ({
      nome: i.nome, marca: i.marca, qtd: i.qty, preco: i.price, unidade: i.unit,
    }));
    const { data } = await createClient().rpc("mercado_apply_receipt_web", {
      p_items, p_chave: chave, p_emitente: emitente, p_total: total,
    });
    const res = (data ?? { ok: false }) as { ok: boolean; erro?: string; itens?: number };
    if (res.ok) await reloadData();
    return res;
  },
  [reloadData],
);
```

Incluir `importReceipt` no objeto `value` e nas duas listas de deps do `useMemo` (junto de `confirmReceipt`).

- [ ] **Step 2: Reescrever o `ReceiptModal` para usar dados reais**

Substituir `web/src/components/receipt/ReceiptModal.tsx` (remover `SAMPLE`; usar estado real):

```tsx
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ReceiptIcon, TelegramIcon, CheckIcon, ChevronRight } from "@/components/ui/icons";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BOT_URL } from "@/lib/config";
import { QrScanner } from "./QrScanner";
import { invokeNfce, toReviewRows, type ReviewRow } from "@/lib/nfce";

type Phase = "capture" | "scanning" | "processing" | "review" | "error";
const botUrl = BOT_URL;

export function ReceiptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importReceipt, showToast } = useStore();
  const [phase, setPhase] = useState<Phase>("capture");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [meta, setMeta] = useState<{ chave: string; emitente: string; total: number; confere: boolean }>(
    { chave: "", emitente: "", total: 0, confere: true },
  );
  const [errMsg, setErrMsg] = useState("");

  function close() {
    onClose();
    setPhase("capture"); setRows([]); setErrMsg("");
  }

  async function onQr(qrUrl: string) {
    setPhase("processing");
    const resp = await invokeNfce(qrUrl);
    if (!resp.ok) {
      setErrMsg(resp.erro);
      setPhase("error");
      return;
    }
    setRows(toReviewRows(resp));
    setMeta({ chave: resp.chave, emitente: resp.emitente, total: resp.total_nota, confere: resp.total_confere });
    setPhase("review");
  }

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }

  async function confirm() {
    const res = await importReceipt(
      rows.map((r) => ({ nome: r.nome, marca: r.marca, qty: r.qty, price: r.price, unit: r.unit })),
      meta.chave, meta.emitente, meta.total,
    );
    if (res.ok) {
      showToast(`${res.itens ?? rows.length} itens adicionados ao estoque`);
      close();
    } else if (res.erro === "ja_importada") {
      showToast("Essa nota já foi importada");
      close();
    } else {
      setErrMsg(res.erro ?? "erro"); setPhase("error");
    }
  }

  const total = rows.reduce((a, r) => a + r.qty * r.price, 0);

  return (
    <Modal open={open} onClose={close}>
      {phase === "capture" && (
        <>
          <div className="mb-1 text-[20px] font-extrabold">Registrar compra</div>
          <p className="mb-[18px] text-[14px] leading-relaxed text-text-2">
            Escaneie o QR code do cupom fiscal. A gente puxa os itens da nota pra você.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPhase("scanning")}
              className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
                <ReceiptIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">Escanear QR da nota</span>
                <span className="block text-[13px] leading-snug text-text-2">
                  Aponte a câmera pro QR code do cupom.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-text-3" />
            </button>
            <a
              href={botUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-[#2AABEE] bg-card p-4"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#2AABEE] text-white">
                <TelegramIcon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">Áudio no Telegram</span>
                <span className="block text-[13px] leading-snug text-text-2">
                  Fale o que comprou e o bot registra pra você.
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-[#2AABEE]" />
            </a>
          </div>
        </>
      )}

      {phase === "scanning" && (
        <>
          <div className="mb-3 text-[18px] font-extrabold">Aponte pro QR code</div>
          <QrScanner onResult={onQr} onError={(m) => { setErrMsg(m); setPhase("error"); }} />
          <button onClick={() => setPhase("capture")}
            className="mt-3 h-10 w-full text-[13px] font-bold text-text-2">Cancelar</button>
        </>
      )}

      {phase === "processing" && (
        <div className="py-2.5 text-center">
          <div className="relative mx-auto mb-5 h-[216px] w-[170px] overflow-hidden rounded-[14px] border border-border bg-card-2">
            <div className="absolute inset-x-0 top-0 h-[38%] animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-brand/45 to-transparent" />
          </div>
          <div className="mb-1 text-[18px] font-extrabold">Lendo sua nota fiscal...</div>
          <div className="text-[13px] text-text-2">Consultando a SEFAZ e identificando itens</div>
        </div>
      )}

      {phase === "error" && (
        <div className="py-4 text-center">
          <div className="mb-1 text-[18px] font-extrabold">Não consegui ler a nota</div>
          <div className="mb-4 text-[13px] text-text-2">
            {errMsg === "camera_indisponivel"
              ? "Não consegui abrir a câmera. Você pode registrar pelo Telegram."
              : "A SEFAZ pode estar fora do ar ou o QR não foi lido. Tente de novo ou use o Telegram."}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPhase("capture")}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Tentar de novo
            </button>
            <a href={botUrl} target="_blank" rel="noopener noreferrer"
              className="grid h-[50px] flex-1 place-items-center rounded-[14px] bg-[#2AABEE] text-[15px] font-bold text-white">
              Abrir Telegram
            </a>
          </div>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-pos-soft text-pos">
              <CheckIcon size={14} />
            </span>
            <div className="text-[20px] font-extrabold">Encontramos {rows.length} itens</div>
          </div>
          {!meta.confere && (
            <div className="mb-2 rounded-[10px] bg-[#fff3cd] px-3 py-2 text-[12px] font-bold text-[#8a6d3b]">
              O total dos itens não bateu com o total da nota. Confira antes de confirmar.
            </div>
          )}
          <div className="mb-3.5 text-[14px] text-text-2">Confira e confirme para adicionar ao seu estoque.</div>
          <div className="mb-4 max-h-[45vh] overflow-y-auto rounded-[16px] border border-border">
            {rows.map((r, i) => (
              <div key={i} className={`flex items-center gap-2.5 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="min-w-0 flex-1">
                  <input
                    value={r.nome}
                    onChange={(e) => updateRow(i, { nome: e.target.value })}
                    className="w-full bg-transparent text-[14px] font-bold outline-none"
                  />
                  <div className="text-[12px] text-text-3">{r.qty} × {brl(r.price)} · {r.desc}</div>
                </div>
                <span className="text-[14px] font-extrabold">{brl(r.qty * r.price)}</span>
                <button onClick={() => removeRow(i)} className="text-[12px] font-bold text-neg">x</button>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border bg-card-2 px-4 py-3.5">
              <span className="text-[13px] font-extrabold uppercase tracking-wide text-text-2">Total</span>
              <span className="text-[20px] font-extrabold">{brl(total)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={close}
              className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Cancelar
            </button>
            <button onClick={confirm}
              className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink">
              Confirmar e adicionar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
```

Nota: o input de foto/OCR (`capture="environment"`) do MVP anterior sai da tela principal; o fallback de captura agora é o Telegram (o OCR por foto permanece disponível pelo bot, Fase 2). Se `neg`/`bg-[#fff3cd]` não existirem no tema, usar cores equivalentes já presentes em `globals.css`.

- [ ] **Step 3: Build do web**

Run (na pasta `web`): `npx tsc --noEmit && npm run build`
Esperado: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/receipt/ReceiptModal.tsx web/src/lib/store.tsx
git commit -m "feat(web): ReceiptModal le QR da NFC-e e grava compra real (fim da Fase 1)"
```

---

## Task 9: Verificação E2E manual com cupom real

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o web e abrir no celular (HTTPS)**

Deploy de preview na Vercel (ou `npm run dev` com túnel HTTPS). Câmera exige HTTPS.

- [ ] **Step 2: Escanear o cupom real**

Abrir "Registrar compra" → "Escanear QR da nota" → apontar pro QR do cupom da foto de referência.
Esperado: some a câmera, aparece "Lendo sua nota fiscal...", depois a revisão com os itens reais.

- [ ] **Step 3: Conferir os dados**

Verificar: quantidade de itens condiz com a nota; nomes normalizados fazem sentido; preços e total conferem (sem selo de aviso).
Esperado: dados corretos; total ~ igual ao "Valor a pagar" do cupom.

- [ ] **Step 4: Confirmar e validar no estoque**

Clicar "Confirmar e adicionar". Ir na aba Estoque e conferir que os itens entraram com estoque/preço. Escanear a MESMA nota de novo e confirmar que aparece "Essa nota já foi importada" (dedup).
Esperado: itens no estoque; segunda importação bloqueada pelo dedup.

---

## Self-review (feito na escrita do plano)

- **Cobertura do spec**: serviço `nfce-consulta` (Tasks 3-5), web capture/review/confirm (Tasks 6-8), SQL/dedup/refactor (Task 1), fallback e erros (Task 5 códigos + Task 8 tela de erro), segurança/secret/tolerância de total (Tasks 5), testes/fixture (Tasks 2-3, 6, 9). Fase 2 (Telegram, `image_base64`) explicitamente fora, vira plano próprio.
- **Sem placeholders**: código real em cada passo; os únicos "TROCAR" são os asserts do parser que dependem de valores da fixture real (Task 3 Step 1), por natureza da TDD contra dado real.
- **Consistência de tipos**: `NfceItem`/`NormItem` (parse/normalize/index), `NfceResp`/`ReviewRow`/`toReviewRows`/`invokeNfce` (web), `mercado_apply_receipt_web(p_items, p_chave, p_emitente, p_total)` e `importReceipt(items, chave, emitente, total)` batem entre Task 1, 6 e 8.
- **Risco conhecido**: seletores do parser (Task 3) podem precisar de ajuste contra o HTML real; o teste por fixture é o mecanismo de correção.
