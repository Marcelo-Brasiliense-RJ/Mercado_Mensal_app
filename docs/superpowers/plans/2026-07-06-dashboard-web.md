# Dashboard web "Dispensa" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o PWA mobile-first "Dispensa" em Next.js (App Router) sobre o Supabase existente, reproduzindo o protótipo `Dispensa.dc.html`, com auth e-mail/senha, gestão de família, e telas de Estoque, Lista e Economia com CRUD via RPCs.

**Architecture:** Next.js App Router com `@supabase/ssr` (sessão em cookie); Server Components leem via SELECT/RLS e views/RPCs de agregação; Server Actions escrevem via RPCs `_web` (por `auth.uid()`); middleware faz refresh de sessão e proteção de rota. Tailwind v4 com os tokens do design como CSS custom properties.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, `@supabase/ssr` + `@supabase/supabase-js`, Tailwind CSS v4, Vitest (lógica pura), deploy Vercel.

## Global Constraints

- Node/PWA: mobile-first; apenas anon key no cliente (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`); service_role NUNCA no navegador.
- Supabase project: `https://eqguqkojztovfoafjqji.supabase.co` (projeto `Mercado_app`).
- App name na UI: "Dispensa". Bot: `@Mercado_cellks_bot` (`https://t.me/Mercado_cellks_bot`).
- Accent/brand: `#C15F3C`. theme-color `#C15F3C`. background `#F4EEE7`.
- Toda mutação passa por RPC. Leitura simples via SELECT/RLS; agregação via view/RPC.
- Fonte: system stack; monospace `ui-monospace, Menlo, monospace`. Zero fontes externas.
- Sem em dash em textos de UI/commits. Português com acentuação correta.
- App vive em `web/`; root de deploy Vercel = `web/`. Uma única branch `feat/dashboard-web`.
- Não portar: moldura de telefone, status bar fake, painel demo do protótipo.
- Tokens de cor exatos: ver spec `docs/superpowers/specs/2026-07-06-dashboard-dispensa-design.md` seção 9.

---

## File Structure

Ver árvore completa no spec (seção 5). Responsabilidades por unidade:

- `web/src/lib/supabase/{client,server,middleware}.ts` — criação dos clients (browser/servidor) e helper de refresh.
- `web/src/middleware.ts` — refresh de sessão + guarda de rota (auth + família).
- `web/src/lib/format.ts` — BRL, datas pt-BR, cálculos puros (total da lista, ratio, trend, status de orçamento).
- `web/src/lib/queries/*` — funções de leitura tipadas (usam server client).
- `web/src/lib/actions/*` — Server Actions de escrita (chamam RPCs `_web`).
- `web/src/components/ui/*` — primitivos visuais (um arquivo por componente).
- `web/src/components/layout/*` — AppShell, TopBar, TabBar.
- `web/src/components/{estoque,lista,economia,familia}/*` — componentes por domínio.
- `web/src/app/**` — rotas (Server Components por padrão; Client Components onde há interação).
- `web/src/theme/*` — ThemeProvider (persistência clara/escura), toggle.
- `supabase/migrations/0005_web_rpcs.sql` — coluna category, views e RPCs `_web`.

---

## Task 0.1: Scaffold Next.js em `web/` + assets do design

**Files:**
- Create: `web/package.json`, `web/next.config.mjs`, `web/tsconfig.json`, `web/.gitignore`, `web/.env.local.example`
- Create: `web/src/app/layout.tsx`, `web/src/app/page.tsx` (placeholder), `web/src/app/globals.css` (placeholder)
- Create: `web/Dispensa.dc.html`, `web/public/{icon-180,icon-192,icon-512}.png`, `web/public/manifest.webmanifest`

**Interfaces:**
- Produces: app Next executável (`npm run dev`, `npm run build`), assets PWA em `public/`.

- [ ] **Step 1:** Verificar padrão atual de create-next-app + App Router via context7 (`mcp__context7` para "next.js app router setup") se necessário. Rodar scaffold em `web/` com TypeScript, sem Tailwind do wizard (será v4 manual), App Router, `src/`, import alias `@/*`. Comando (ajustar conforme versão):

```bash
cd web && npx create-next-app@latest . --ts --app --src-dir --import-alias "@/*" --no-tailwind --eslint --use-npm --yes
```

- [ ] **Step 2:** Baixar do projeto de design (via DesignSync `get_file`) e salvar em `web/`:
  - `web/Dispensa.dc.html` (referência)
  - `web/public/icon-180.png`, `web/public/icon-192.png`, `web/public/icon-512.png`

- [ ] **Step 3:** Criar `web/public/manifest.webmanifest`:

```json
{
  "name": "Dispensa",
  "short_name": "Dispensa",
  "description": "Controle da dispensa e compras do mes",
  "start_url": "/app/estoque",
  "scope": "/",
  "display": "standalone",
  "background_color": "#F4EEE7",
  "theme_color": "#C15F3C",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 4:** Criar `web/.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://eqguqkojztovfoafjqji.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=coloque-a-anon-key-aqui
```

- [ ] **Step 5:** Rodar `cd web && npm run build`. Expected: build ok (placeholders).

- [ ] **Step 6: Commit** `git add web && git commit -m "chore(web): scaffold Next.js app e assets PWA"`

---

## Task 0.2: Tailwind v4 + tokens do design + reset global

**Files:**
- Create: `web/postcss.config.mjs`
- Modify: `web/package.json` (deps tailwind), `web/src/app/globals.css`, `web/src/app/layout.tsx`

**Interfaces:**
- Produces: classes utilitárias mapeadas aos tokens (`bg-bg`, `bg-card`, `text-text`, `text-text-2`, `border-border`, `text-brand`, `bg-brand`, `bg-pos-soft`, etc.); tema por `data-theme` no `<html>`.

- [ ] **Step 1:** Instalar Tailwind v4: `cd web && npm i -D tailwindcss @tailwindcss/postcss`. Criar `web/postcss.config.mjs`:

```js
export default { plugins: { "@tailwindcss/postcss": {} } }
```

- [ ] **Step 2:** Escrever `web/src/app/globals.css` com os tokens (valores exatos da spec seção 9), tema claro em `:root`, escuro em `[data-theme="dark"]`, e mapeamento `@theme inline` para o Tailwind:

```css
@import "tailwindcss";

:root {
  --desk:#E7DFD5; --bg:#F4EEE7; --card:#FFFFFF; --card-2:#F3EDE6;
  --text:#241E1A; --text-2:#786C63; --text-3:#A99E94; --border:#EAE1D8;
  --brand:#C15F3C; --brand-ink:#FFF8F4; --brand-soft:#F6E7E2;
  --pos:#17935B; --pos-ink:#0A1710; --pos-soft:#E2F1E9;
  --warn:#C57814; --warn-ink:#3A2400; --warn-soft:#FBEAD2;
  --neg:#D6453F; --neg-ink:#FFF1F0; --neg-soft:#FBE6E4;
  --shadow:rgba(74,48,28,0.10); --shadow-lg:rgba(74,48,28,0.18);
}
[data-theme="dark"] {
  --desk:#0C0908; --bg:#161210; --card:#211B17; --card-2:#2A231D;
  --text:#F3EBE3; --text-2:#B4A89E; --text-3:#7D7167; --border:#33291F;
  --brand:#CD7A5C; --brand-ink:#2A130B; --brand-soft:#2C1A13;
  --pos:#37B37F; --pos-ink:#08140E; --pos-soft:#17281F;
  --warn:#E7A33C; --warn-ink:#2E1C00; --warn-soft:#352814;
  --neg:#E8706A; --neg-ink:#2A0E0C; --neg-soft:#361F1D;
}
@theme inline {
  --color-desk: var(--desk); --color-bg: var(--bg); --color-card: var(--card);
  --color-card-2: var(--card-2); --color-text: var(--text); --color-text-2: var(--text-2);
  --color-text-3: var(--text-3); --color-border: var(--border);
  --color-brand: var(--brand); --color-brand-ink: var(--brand-ink); --color-brand-soft: var(--brand-soft);
  --color-pos: var(--pos); --color-pos-ink: var(--pos-ink); --color-pos-soft: var(--pos-soft);
  --color-warn: var(--warn); --color-warn-ink: var(--warn-ink); --color-warn-soft: var(--warn-soft);
  --color-neg: var(--neg); --color-neg-ink: var(--neg-ink); --color-neg-soft: var(--neg-soft);
}
* { box-sizing: border-box; scrollbar-width: none; }
::-webkit-scrollbar { width: 0; height: 0; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased; background: var(--bg); color: var(--text);
}
::placeholder { color: var(--text-3); }
@keyframes shimmer { 0% { background-position: -260px 0 } 100% { background-position: 260px 0 } }
@keyframes sheetUp { from { transform: translateY(102%) } to { transform: translateY(0) } }
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px) } to { opacity: 1; transform: translate(-50%, 0) } }
@keyframes pop { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
```

- [ ] **Step 3:** Em `layout.tsx`, importar `globals.css`, setar `<html lang="pt-BR" data-theme="light">`, metadata (title "Dispensa", manifest, theme-color, apple-touch-icon), `viewport` com `width=device-width, initial-scale=1, viewport-fit=cover`.

- [ ] **Step 4:** Página `page.tsx` provisória com `<div className="bg-card text-text">teste tokens</div>`. Rodar `npm run dev`, verificar cor de fundo/texto e que `data-theme="dark"` (via devtools) troca as cores. Expected: tokens aplicam nos dois temas.

- [ ] **Step 5: Commit** `git commit -am "feat(web): Tailwind v4 + tokens do design (claro/escuro) e reset"`

---

## Task 1.1: Primitivos de UI (components/ui)

**Files:** Create um arquivo por componente em `web/src/components/ui/`: `Button.tsx`, `Card.tsx`, `Chip.tsx`, `Badge.tsx`, `ProgressBar.tsx`, `Input.tsx`, `Select.tsx`, `Sheet.tsx`, `Toast.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `AvatarInitial.tsx`, `SearchField.tsx`, `SectionLabel.tsx`.

**Interfaces (contratos — respeitar nomes/props):**
- `Button({ variant?: "primary"|"secondary"|"icon"|"ghost"|"destructive"; size?: "md"|"lg"; disabled?; onClick?; children })` — primary: `bg-brand text-brand-ink`, altura 50-52px, radius 14-16px, CTA com `shadow-[0_8px_20px_var(--shadow-lg)]`; secondary: `bg-card border border-border text-text`; icon: quadrado 40-48px radius 12px; destructive: `bg-card text-neg`; disabled: `opacity-50`.
- `Card({ className?, children })` — `bg-card border border-border rounded-[20px] p-[18px] shadow-[0_2px_10px_var(--shadow)]`.
- `Chip({ tone: "pos"|"warn"|"neg"|"brand"|"neutral"; children })` — `rounded-full px-2.5 py-[5px] bg-{tone}-soft text-{tone}`.
- `Badge({ tone?, children })` — pill pequeno `px-2 py-0.5 rounded-full`.
- `ProgressBar({ ratio: number; tone?: "auto"|"pos"|"warn"|"brand"|"neg"; height?: number })` — track `bg-card-2`; fill width `clamp(4%,ratio*100,100%)`; tone auto: ratio<0.5 -> warn senão pos.
- `Input({ label?, type?, value, onChange, placeholder?, ... })` — height 48px, `bg-card-2 rounded-[13px] px-3.5`; label 12px/700 `text-text-2`.
- `Select({ label?, value, onChange, options })`.
- `Sheet({ open, onClose, children })` — Client Component: overlay `fixed inset-0 bg-black/40 animate-[fadeIn_.2s]`, painel `bg-card rounded-t-[24px] p-6 pb-[calc(24px+env(safe-area-inset-bottom))] animate-[sheetUp_.28s_cubic-bezier(.22,1,.36,1)]` com grabber; click overlay fecha, click painel `stopPropagation`.
- `Toast({ message, onDone })` — Client, auto-dismiss 2200ms, `fixed left-1/2 bottom-40 -translate-x-1/2 bg-text text-bg rounded-xl animate-[toastIn_.22s]`.
- `EmptyState({ icon, title, description, action? })`.
- `Skeleton({ className })` — `background: linear-gradient(90deg,var(--card-2) 25%,var(--border) 37%,var(--card-2) 63%); background-size:400px 100%; animation: shimmer 1.2s infinite linear`.
- `AvatarInitial({ name, size? })` — quadrado radius 12-16px `bg-brand-soft text-brand`, primeira letra 800.
- `SearchField({ value, onChange, placeholder })` — wrapper com ícone lupa absolute, input `bg-card-2 h-[46px] pl-[42px] rounded-[14px]`.
- `SectionLabel({ children, tone? })` — 12-13px/700-800 uppercase `tracking-[0.03em] text-text-3` (warn na seção Repor).

- [ ] **Step 1:** Criar os componentes acima seguindo os contratos e tokens. Ícones como SVG inline (paths no blueprint seção 2/4). Client Components apenas onde há estado/interação (`Sheet`, `Toast`, `SearchField`, `Input` controlado).
- [ ] **Step 2:** Criar página de verificação `web/src/app/kitchen-sink/page.tsx` renderizando todos os primitivos nas variações, nos dois temas (botão local de toggle `data-theme`).
- [ ] **Step 3:** `npm run dev`, abrir `/kitchen-sink`, conferir visual (claro e escuro). Ajustar até fiel ao protótipo. `npm run build` ok.
- [ ] **Step 4: Commit** `git commit -am "feat(web): primitivos de UI (design system)"`

---

## Task 1.2: Layout do app (AppShell, TopBar, TabBar)

**Files:** Create `web/src/components/layout/{AppShell,TopBar,TabBar}.tsx`.

**Interfaces:**
- `AppShell({ children })` — coluna flex: TopBar fixo topo, conteúdo scroll `p-4 pb-[104px]`, TabBar fixo base.
- `TopBar({ title, subtitle?, left?: "back"|"logo"|"none", right?: ReactNode, onBack? })` — height 52px `bg-card border-b border-border`; centro título 15px/700 + subtítulo 11px.
- `TabBar({ active: "estoque"|"lista"|"economia" })` — 3 links (`next/link`) para `/app/estoque|lista|economia`, ícones SVG 24px (paths no blueprint), label 11px/600, ativo `text-brand` inativo `text-text-3`, `pb-[env(safe-area-inset-bottom)]`.

- [ ] **Step 1:** Criar os três componentes com os contratos e ícones do blueprint.
- [ ] **Step 2:** Adicionar ao `/kitchen-sink` um exemplo de AppShell. Verificar no dev.
- [ ] **Step 3: Commit** `git commit -am "feat(web): AppShell, TopBar e TabBar"`

---

## Task 2.1: Lógica pura + testes (format e cálculos) [TDD]

**Files:** Create `web/src/lib/format.ts`, `web/src/lib/format.test.ts`; Modify `web/package.json` (vitest), Create `web/vitest.config.ts`.

**Interfaces (Produces):**
- `brl(n: number): string` -> "R$ 1.234,56"
- `listTotal(items: {desired_quantity:number; estimated_price:number|null; status:string}[]): number` — soma `desired_quantity*estimated_price` de `status==='pending'`.
- `pendingCount(items): number`
- `stockRatio(current:number, par:number): number` — `par>0 ? current/par : 1`
- `stockStatus(current:number, par:number): "repor"|"ok"` — ratio<0.5 -> repor
- `budgetStatus(spent:number, total:number): { pct:number; over:boolean; saldo:number; tone:"brand"|"warn"|"neg" }` — over se spent>total; warn se pct>85.

- [ ] **Step 1: Failing test** `web/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brl, listTotal, pendingCount, stockRatio, stockStatus, budgetStatus } from "./format";

describe("format", () => {
  it("brl", () => { expect(brl(1234.5)).toBe("R$ 1.234,50"); });
  it("listTotal soma so pendentes", () => {
    const items = [
      { desired_quantity: 2, estimated_price: 5, status: "pending" },
      { desired_quantity: 1, estimated_price: 9, status: "bought" },
    ];
    expect(listTotal(items)).toBe(10);
    expect(pendingCount(items)).toBe(1);
  });
  it("stock", () => {
    expect(stockRatio(1, 4)).toBe(0.25);
    expect(stockStatus(1, 4)).toBe("repor");
    expect(stockStatus(3, 4)).toBe("ok");
  });
  it("budget", () => {
    const b = budgetStatus(120, 100);
    expect(b.over).toBe(true); expect(b.tone).toBe("neg");
  });
});
```

- [ ] **Step 2: Run, verify fail** `cd web && npx vitest run src/lib/format.test.ts` -> FAIL (módulo/funcs não existem). (Instalar antes: `npm i -D vitest`; criar `vitest.config.ts` com ambiente node.)
- [ ] **Step 3: Implement** `web/src/lib/format.ts` com as funções acima (Intl.NumberFormat pt-BR para `brl`).
- [ ] **Step 4: Run, verify pass** `npx vitest run src/lib/format.test.ts` -> PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(web): utils de formatacao e calculos (TDD)"`

---

## Task 2.2: Clients Supabase + middleware de sessão/guarda

**Files:** Create `web/src/lib/supabase/{client,server,middleware}.ts`, `web/src/middleware.ts`; Modify `web/package.json` (`@supabase/ssr`, `@supabase/supabase-js`).

**Interfaces (Produces):**
- `createBrowserClient()` (client.ts) — para Client Components.
- `createServerClient()` (server.ts) — async, usa `cookies()` do `next/headers`.
- `updateSession(request)` (middleware.ts helper) — refresh + retorna `{ response, user }`.
- `middleware.ts` — aplica guarda: sem user + rota protegida -> `/login`; user sem família -> `/familia`; matcher exclui assets.

- [ ] **Step 1:** Instalar `cd web && npm i @supabase/ssr @supabase/supabase-js`. Verificar padrão atual via context7 ("supabase ssr nextjs app router") para casar a API de cookies vigente.
- [ ] **Step 2:** Implementar os três arquivos seguindo o padrão `@supabase/ssr` (getAll/setAll de cookies). `server.ts` lê `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY`.
- [ ] **Step 3:** `web/src/middleware.ts`:

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*|manifest.webmanifest|.*\\.png).*)"],
};
```

- [ ] **Step 4:** No helper `updateSession`, após obter `user`: se rota começa com `/app` ou `/familia` e sem user -> redirect `/login`; se user e rota `/app*`, checar família via `mercado_my_household` (RPC) e redirecionar a `/familia` se vazio. (Cachear a checagem por request.)
- [ ] **Step 5:** `npm run build` ok (sem rotas ainda, middleware não quebra). **Commit** `git commit -am "feat(web): clients Supabase (ssr) e middleware de sessao/guarda"`

---

## Task 2.3: Telas de Auth (login, signup, recuperar, callback)

**Files:** Create `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`, `web/src/app/recuperar-senha/page.tsx`, `web/src/app/auth/callback/route.ts`, `web/src/lib/actions/auth.ts`.

**Interfaces:**
- Server Actions em `auth.ts`: `signIn(formData)`, `signUp(formData)` (guarda `name` em `options.data.name`), `requestReset(formData)`, `signOut()`.
- `auth/callback/route.ts` — troca `code` por sessão (`exchangeCodeForSession`) e redireciona (`/app/estoque` ou `/familia`).

- [ ] **Step 1:** Criar `actions/auth.ts` (Server Actions "use server") usando server client. Erros retornados como estado para exibir na tela.
- [ ] **Step 2:** Criar as três páginas conforme protótipo (headers, inputs, links "ou"/"Criar conta"/"Entrar"/"Esqueci a senha"). Usar componentes `ui/`. Form via Server Actions.
- [ ] **Step 3:** Criar `auth/callback/route.ts`.
- [ ] **Step 4:** Testar fluxo real: signup -> (confirmação conforme config do projeto) -> login -> redireciona. Verificar no dev com Supabase real.
- [ ] **Step 5: Commit** `git commit -am "feat(web): telas de autenticacao (login, cadastro, recuperar)"`

---

## Task 3.1: Landing "Como usar"

**Files:** Modify `web/src/app/page.tsx`; Create `web/src/components/familia/OnboardingStepCard.tsx`.

- [ ] **Step 1:** Implementar landing: logo `icon-512.png`, H1 "Sua dispensa sob controle", parágrafo, 4 `OnboardingStepCard` (1 Crie conta / 2 Monte família / 3 Abra o Telegram / 4 Mande um áudio), CTA "Entrar no app" (-> `/login`), botão "Abrir no Telegram" (deep-link). Se já logado, redirecionar a `/app/estoque`.
- [ ] **Step 2:** Verificar no dev (claro/escuro). **Commit** `git commit -am "feat(web): landing Como usar"`

---

## Task 3.2: Família (escolher, criar, entrar, conectar Telegram) + guarda

**Files:** Create `web/src/app/familia/page.tsx`, `familia/criar/page.tsx`, `familia/entrar/page.tsx`, `familia/conectar-telegram/page.tsx`; Create `web/src/lib/actions/familia.ts`, `web/src/lib/queries/household.ts`; Create `web/src/components/familia/{ChoiceCard,FamilyCodeDisplay}.tsx`.

**Interfaces:**
- `queries/household.ts`: `getMyHousehold()` -> RPC `mercado_my_household` (`{ household_id, familia, invite_code, role } | null`).
- `actions/familia.ts`: `createFamily(name)` -> RPC `mercado_create_family_web`; `joinFamily(code)` -> RPC `mercado_join_family_web`. Ambas retornam `{ ok, invite_code?, erro? }`.

- [ ] **Step 1:** Implementar `getMyHousehold` e as actions chamando as RPCs existentes (0003).
- [ ] **Step 2:** `/familia` (2 ChoiceCards). `/familia/criar` (form nome -> mostra código grande + copiar/compartilhar + "Continuar" -> `/familia/conectar-telegram`). `/familia/entrar` (input código uppercase, habilita >=4 chars). `/familia/conectar-telegram` (código + "Abrir no Telegram" + "Ir para o app" -> `/app/estoque`).
- [ ] **Step 3:** `FamilyCodeDisplay` com `navigator.clipboard` + toast e `navigator.share` com fallback (Client Component).
- [ ] **Step 4:** Testar criar/entrar com usuário real; confirmar guarda (usuário sem família cai em `/familia`). 
- [ ] **Step 5: Commit** `git commit -am "feat(web): fluxo de familia (criar/entrar/conectar) e guarda"`

---

## Task 4.1: Migration 0005 (category, views, RPCs `_web`)

**Files:** Create `supabase/migrations/0005_web_rpcs.sql`; Create `web/src/lib/database.types.ts` (gerado).

**Interfaces (Produces):** RPCs/vistas listadas na spec seção 8.

- [ ] **Step 1:** Escrever `0005_web_rpcs.sql`:
  - `alter table products add column if not exists category text;`
  - helper inline nas RPCs: `select household_id from household_members where auth_user_id = auth.uid() limit 1` (erro `sem_familia`).
  - `mercado_apply_purchase_web`, `mercado_apply_inventory_web`, `mercado_add_to_list_web` — copiar corpo das versões de Telegram (0003) trocando resolução de `h` por `auth.uid()`.
  - `mercado_toggle_list_item_web(p_list_id uuid, p_bought boolean)`, `mercado_remove_from_list_web(p_list_id uuid)` — update em `shopping_list` do próprio household.
  - `mercado_set_budget_web(p_month date, p_amount numeric)` — `insert ... on conflict (household_id, month) do update`.
  - `create view v_stock_web with (security_invoker = on) as select ...` (campos da spec, price_last/price_avg/trend por subquery em purchases). `grant select on v_stock_web to authenticated;`
  - `mercado_economy_web()` (SECURITY DEFINER, filtra por household do uid): JSON `{ savings[], budget{}, months[] }`.
  - grants de execute a `authenticated` para as RPCs `_web`.
- [ ] **Step 2:** Aplicar no Supabase via MCP `mcp__supabase__apply_migration` (name `web_rpcs`). Rodar `mcp__supabase__get_advisors` (security) e revisar.
- [ ] **Step 3:** Gerar tipos: `mcp__supabase__generate_typescript_types` -> salvar em `web/src/lib/database.types.ts`.
- [ ] **Step 4:** Smoke test das RPCs via `mcp__supabase__execute_sql` (ex.: `select mercado_economy_web();` autenticado não se aplica no MCP; validar assinatura/erros com dados dummy ou via app na tarefa seguinte).
- [ ] **Step 5: Commit** `git add supabase web/src/lib/database.types.ts && git commit -m "feat(db): migration 0005 RPCs _web + view v_stock_web + economy"`

---

## Task 5.1: Estoque (lista + estados) 

**Files:** Create `web/src/app/app/layout.tsx`, `web/src/app/app/estoque/page.tsx`, `web/src/app/app/estoque/loading.tsx`; Create `web/src/lib/queries/estoque.ts`; Create `web/src/components/estoque/{StockItem,StockList}.tsx`.

**Interfaces:**
- `queries/estoque.ts`: `getStock()` -> `select * from v_stock_web` ordenado; retorna itens com `id,name,category,unit,current_stock,par_level,price_last,price_avg,trend`.
- `app/layout.tsx` — AppShell + TopBar (logo + toggle tema) + TabBar; server-side confirma sessão/família.

- [ ] **Step 1:** `app/layout.tsx` com AppShell/TopBar/TabBar; `getStock()`.
- [ ] **Step 2:** `estoque/page.tsx` (Server Component): agrupar em Repor (ratio<0.5) e No estoque; `SearchField` (client, filtra por nome); badges de contagem; `StockItem` (button -> `/app/item/[id]`). Estado empty (2 ChoiceCards: "primeira compra monta sozinha" e "falar no Telegram" com ribbon Recomendado). `loading.tsx` com skeletons (78px).
- [ ] **Step 3:** Testar com dados reais (inserir produtos via RPC de Telegram ou SQL). Verificar agrupamento, busca, temas.
- [ ] **Step 4: Commit** `git commit -am "feat(web): tela de Estoque (lista, secoes, busca, estados)"`

---

## Task 5.2: Detalhe do produto

**Files:** Create `web/src/app/app/item/[id]/page.tsx`; Create `web/src/components/estoque/{StockDetail,HistoryTimeline}.tsx`; Modify `web/src/lib/queries/estoque.ts` (`getStockItem(id)`, `getProductHistory(id)`).

- [ ] **Step 1:** `getStockItem(id)` (de `v_stock_web`), `getProductHistory(id)` (de `purchases`, últimas N).
- [ ] **Step 2:** `StockDetail`: header (avatar, nome, categoria, chip status), "Nível em casa" (%, qty/normal, barra), Último/Médio preço + trend (queda=pos, alta=neg), `HistoryTimeline`, botão "Adicionar à lista de compras" (Server Action `addToList` -> toast -> vai para `/app/lista`). Animação `pop`. TopBar com back.
- [ ] **Step 3:** Testar. **Commit** `git commit -am "feat(web): detalhe do produto + historico"`

---

## Task 6.1: Lista de compras (resumo + itens + ações)

**Files:** Create `web/src/app/app/lista/page.tsx`, `lista/loading.tsx`; Create `web/src/lib/queries/lista.ts`; Create `web/src/lib/actions/lista.ts`; Create `web/src/components/lista/{ShopListItem,SummaryCard,AddItemSheet}.tsx`.

**Interfaces:**
- `queries/lista.ts`: `getList()` -> `select` de `shopping_list` (status != 'removed'), ordenado (pendentes primeiro).
- `actions/lista.ts`: `addToList(name,qty,unit,price)` -> `mercado_add_to_list_web`; `toggleBought(id,bought)` -> `mercado_toggle_list_item_web`; `removeItem(id)` -> `mercado_remove_from_list_web`. `revalidatePath('/app/lista')`.

- [ ] **Step 1:** Implementar queries e actions.
- [ ] **Step 2:** `page.tsx`: `SummaryCard` (Total a pagar via `listTotal`, Faltando via `pendingCount`), lista de `ShopListItem` (checkbox -> `toggleBought`, subtotal, line-through/opacity quando comprado, comprados ao fim), empty state + "Adicionar item", FAB (+) que abre `AddItemSheet`. `loading.tsx` skeletons.
- [ ] **Step 3:** `AddItemSheet` (Client + Sheet): nome, qtd, unidade (select un/kg/g/L/ml/pct/cx/dz), preço -> `addToList`, toast.
- [ ] **Step 4:** Testar add/marcar/remover e recalcular total. **Commit** `git commit -am "feat(web): lista de compras (total, itens, add/marcar/remover)"`

---

## Task 7.1: Economia (economia + orçamento + gráfico)

**Files:** Create `web/src/app/app/economia/page.tsx`, `economia/loading.tsx`; Create `web/src/lib/queries/economia.ts`; Create `web/src/lib/actions/orcamento.ts`; Create `web/src/components/economia/{SavingsCard,BudgetCard,BudgetSheet,BarChart}.tsx`.

**Interfaces:**
- `queries/economia.ts`: `getEconomy()` -> RPC `mercado_economy_web()` -> `{ savings[], budget{month,total,spent,over,pct,saldo}, months[] }`.
- `actions/orcamento.ts`: `setBudget(month, amount)` -> `mercado_set_budget_web`.

- [ ] **Step 1:** Implementar query e action.
- [ ] **Step 2:** `page.tsx`: `SavingsCard` (total economizado + linhas name/preço antigo riscado/novo/-R$), `BudgetCard` (gasto/total, %, barra com tone via `budgetStatus`, pill "Restam"/"Acima em", ou CTA "Definir orçamento" -> `BudgetSheet`), `BarChart` (barras por mês + linha tracejada de orçamento; cor: >linha neg, mês atual brand, senão pos). Empty "Ainda sem histórico".
- [ ] **Step 3:** Testar com compras/orçamento reais. **Commit** `git commit -am "feat(web): tela de Economia (economia, orcamento, grafico)"`

---

## Task 8.1: Configurações/Família + tema

**Files:** Create `web/src/app/app/config/page.tsx`; Create `web/src/components/familia/MemberRow.tsx`; Create `web/src/theme/{ThemeProvider,ThemeToggle}.tsx`; Modify `layout.tsx` (ThemeProvider), `TopBar` (toggle).

**Interfaces:**
- `ThemeProvider` — lê preferência de `localStorage` + `prefers-color-scheme`, seta `data-theme` no `<html>`; expõe `useTheme()`.
- `queries/household.ts`: `getMembers()` -> `select` de `household_members`.

- [ ] **Step 1:** `ThemeProvider` + `ThemeToggle` (sol/lua), persistência; script anti-flash no `layout` (set `data-theme` antes da hidratação).
- [ ] **Step 2:** `config/page.tsx`: card nome + código (copiar/compartilhar), `MemberRow[]` (avatar, nome, role Admin/Membro, status Telegram conectado/pendente), card Telegram (abrir bot), botão "Sair da conta" (`signOut`). Abertura via menu (3 pontos) no TopBar do app.
- [ ] **Step 3:** Testar toggle de tema persistente e membros reais. **Commit** `git commit -am "feat(web): configuracoes/familia e tema persistente"`

---

## Task 9.1: Polimento PWA e acessibilidade

**Files:** Modify `layout.tsx` (metadata final), componentes conforme necessário; Create `web/public/apple-touch-icon` links se preciso.

- [ ] **Step 1:** Confirmar instalabilidade (Lighthouse PWA no dev/preview): manifest, ícones, theme-color, display standalone, start_url. Ajustar.
- [ ] **Step 2:** A11y: labels em inputs, `aria-current` na tab ativa, foco visível, alvos de toque >=44px, contraste nos dois temas. Deep-links Telegram `target=_blank rel=noopener`.
- [ ] **Step 3:** `npm run build` + `npm run lint` limpos. **Commit** `git commit -am "chore(web): polimento PWA e acessibilidade"`

---

## Task 10.1: Deploy na Vercel

**Files:** Create `web/vercel.json` se necessário; docs de deploy.

- [ ] **Step 1:** Configurar projeto `mercado-mensal-app` (Root Directory `web/`), envs `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production + Preview). Via MCP da Vercel ou CLI (token em env, nunca no código).
- [ ] **Step 2:** Deploy de preview, verificar rotas, auth, leitura/escrita ponta a ponta.
- [ ] **Step 3:** Promover a produção. Registrar URL. **Commit** de eventuais ajustes.

---

## Notas de execução
- Verificar padrões atuais (Next App Router, `@supabase/ssr`, Tailwind v4) via context7 antes de codar cada peça de infra.
- RLS: leituras diretas e a view `v_stock_web` (security_invoker) filtram por família automaticamente; as RPCs `_web` resolvem household por `auth.uid()`.
- Preferir Server Components; Client Components só onde há interação (Sheet, Toast, SearchField, checkbox da lista, toggles, copiar/compartilhar).
- Commits frequentes por tarefa, todos na branch `feat/dashboard-web`.
