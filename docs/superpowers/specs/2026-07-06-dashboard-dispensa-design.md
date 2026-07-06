# Dashboard web "Dispensa" — Design / Spec

- Data: 2026-07-06
- Branch: `feat/dashboard-web`
- Status: aprovado (design), pronto para plano de implementação
- Origem do design: `Dispensa.dc.html` (protótipo Claude Design, importado via MCP), blueprint em `web/Dispensa.dc.html`
- Backend: Supabase (migrations 0001 a 0004 já aplicadas; 0004 pendente de rodar), RLS por família

## 1. Contexto e objetivo

Implementar o dashboard web do projeto Mercado Mensal a partir do protótipo mobile-first `Dispensa.dc.html`. O app ("Dispensa" na UI) é um PWA que mostra estoque da dispensa, lista de compras com total, e economia, além de login por e-mail/senha e gestão de família por código de convite. A entrada de dados principal continua por voz no Telegram; o web complementa com leitura e edições manuais pontuais.

## 2. Escopo

### No escopo (v1)
- PWA mobile-first em Next.js (App Router), deploy na Vercel (projeto `mercado-mensal-app`).
- Auth e-mail/senha via Supabase Auth (login, cadastro, recuperação de senha).
- Gestão de família: criar, entrar por código, ver código/membros, conectar Telegram (deep-link).
- Telas: Landing "Como usar", Estoque (+ detalhe do produto), Lista de compras (com total), Economia, Configurações/Família.
- CRUD amplo pelo web: registrar compra, conferir estoque, adicionar/marcar/remover item da lista, definir orçamento.
- Tema claro/escuro. Instalável (manifest + ícones).
- Cada usuário só vê a própria família (RLS já configurado).

### Fora do escopo (v1)
- Integração como Telegram Mini App via SDK `telegram-web-app.js` (mantemos apenas deep-links; o botão "X" do header fica oculto/no-op fora do Telegram). Passo posterior.
- Canal WhatsApp (fase 2 do projeto).
- Job diário `mercado_daily_depletion` (é workflow n8n, não web).
- Andaimes do protótipo: moldura de telefone, status bar fake (9:41), painel demo.

## 3. Decisões

| Tema | Decisão |
| --- | --- |
| Nome na UI | "Dispensa" (repositório continua `Mercado_app`) |
| Framework | Next.js (App Router), diretório do app em `web/`, root de deploy na Vercel |
| Auth + leitura | `@supabase/ssr` (sessão em cookie), middleware protege rotas, Server Components leem no servidor, Server Actions escrevem |
| Chave no cliente | Apenas anon key (`NEXT_PUBLIC_*`). service_role nunca vai ao navegador |
| Estilo | Tailwind com os tokens do design como fonte da verdade em `globals.css`; tema por `data-theme` |
| Escrita | Mutação sempre via RPC (preserva regra de negócio). Nova migration `0005_web_rpcs.sql` com RPCs `_web` por `auth.uid()` |
| Navegação | Rotas reais do App Router (não single-page com estado) |
| Categoria de produto | Adicionar coluna `category` (nullable) em `products` |
| Git | Uma única branch (`feat/dashboard-web`), sem worktrees |

## 4. Arquitetura

```
Navegador / PWA  --(anon key + sessao em cookie)-->  Supabase (Postgres + Auth + RLS por familia)
  Next.js App Router (deploy Vercel, root = web/)
   - Server Components  -> leitura (SELECT via RLS + views/RPCs de agregacao)
   - Server Actions     -> escrita (RPCs _web por auth.uid())
   - middleware         -> refresh de sessao + protecao de rota
```

Princípio mantido do projeto: toda mutação passa por RPC no Supabase (recalibragem de estoque, cálculo de economia, baixa automática da lista). Leituras simples são SELECT direto respeitando RLS; agregações (preço médio/tendência, economia, série mensal) via view/RPC.

## 5. Estrutura de pastas

```
Mercado_app/
  supabase/migrations/
    0001..0004 (existentes)
    0005_web_rpcs.sql            <- novo: RPCs _web + views de leitura + coluna category
  docs/superpowers/specs/
    2026-07-06-dashboard-dispensa-design.md
  web/                            <- app Next.js (root de deploy na Vercel)
    package.json, next.config.mjs, tsconfig.json
    tailwind.config.ts, postcss.config.mjs
    .env.local.example            (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)
    Dispensa.dc.html              (referencia de design; fora do build)
    public/
      icon-180.png, icon-192.png, icon-512.png
      manifest.webmanifest
    src/
      middleware.ts               (refresh de sessao + protecao de rota)
      app/
        layout.tsx                (html, tema, meta PWA, fonte system)
        globals.css               (tokens do design como CSS vars, claro/escuro por data-theme)
        page.tsx                  (landing "Como usar")
        login/ signup/ recuperar-senha/   (page.tsx cada)
        auth/callback/route.ts     (troca de code: confirmacao de e-mail / reset)
        familia/
          page.tsx (escolher) | criar/ | entrar/ | conectar-telegram/
        app/
          layout.tsx              (AppShell: TopBar + TabBar + guarda de familia)
          estoque/ lista/ economia/ item/[id]/ config/
      components/
        ui/        Button, Card, Chip, Badge, ProgressBar, Input, Select, Sheet, Toast, EmptyState, Skeleton, AvatarInitial, SearchField
        layout/    TopBar, TabBar, AppShell
        estoque/   StockItem, StockList, StockDetail, HistoryTimeline
        lista/     ShopListItem, SummaryCard, AddItemSheet
        economia/  SavingsCard, BudgetCard, BudgetSheet, BarChart
        familia/   ChoiceCard, FamilyCodeDisplay, MemberRow, OnboardingStepCard
      lib/
        supabase/  client.ts (browser) | server.ts (cookies) | middleware.ts (helper)
        queries/   leituras tipadas (estoque, lista, economia, household, membros)
        actions/   Server Actions (familia, lista, orcamento, compra, conferencia)
        format.ts  (BRL, datas pt-BR)
        database.types.ts   (tipos gerados via supabase gen types)
      theme/       ThemeProvider + toggle + persistencia
```

## 6. Rotas e telas

| Tela (protótipo) | Rota | Origem dos dados |
| --- | --- | --- |
| Landing "Como usar" | `/` | estático (4 passos numerados, CTAs) |
| Login | `/login` | Supabase Auth |
| Cadastro | `/signup` | Supabase Auth (nome vai para metadata + nome do membro) |
| Recuperar senha | `/recuperar-senha` | Supabase Auth (reset por e-mail) |
| Confirmação/reset | `/auth/callback` | troca de code por sessão |
| Família: escolher | `/familia` | - |
| Família: criar | `/familia/criar` | RPC `mercado_create_family_web` |
| Família: entrar | `/familia/entrar` | RPC `mercado_join_family_web` |
| Conectar Telegram | `/familia/conectar-telegram` | `mercado_my_household` + deep-link |
| Estoque | `/app/estoque` | view `v_stock_web` |
| Detalhe do produto | `/app/item/[id]` | view `v_stock_web` + histórico de `purchases` |
| Lista de compras | `/app/lista` | SELECT `shopping_list` + Server Actions |
| Economia | `/app/economia` | RPC `mercado_economy_web` |
| Configurações/Família | `/app/config` | SELECT `household_members` + `households`; logout |

Cada aba do app tem três estados de dados do design: **loading (skeleton) / empty / normal**. Modelar no fetch (Suspense + skeletons especificados no blueprint).

### Fluxo de auth e guarda de acesso (middleware + layout `app/`)
- Sem sessão acessando `/app/*` ou `/familia*` -> redireciona a `/login`.
- Com sessão mas sem família (`mercado_my_household` vazio) -> redireciona a `/familia`.
- Com sessão e família -> `/app/estoque`.
- Middleware também faz refresh da sessão (padrão `@supabase/ssr`).

## 7. Modelo de dados e mapeamento

Tabelas existentes (todas com `household_id`, RLS por família para `authenticated` via `mercado_uid_households()`): `households`, `household_members`, `products`, `purchases`, `shopping_list`, `budgets`.

| Campo no design | Tabela.coluna / origem |
| --- | --- |
| estoque: current / normal / unit | `products.current_stock` / `par_level` / `unit` |
| estoque: priceLast / priceAvg / trend | agregação de `purchases` (view `v_stock_web`) |
| estoque: cat (categoria) | `products.category` (novo, nullable) |
| estoque: status Repor / Nível ok | derivado: `current_stock/par_level < 0.5` |
| lista: qty / unitPrice / checked | `shopping_list.desired_quantity` / `estimated_price` / `status` |
| lista: Total a pagar | soma de `desired_quantity*estimated_price` onde `status='pending'` |
| lista: Faltando | contagem de itens `status='pending'` |
| economia: savings | agregação de `purchases` (preço anterior vs atual por produto) |
| economia: orçamento (total/gasto) | `budgets.amount` (mês atual) + soma de `purchases` do mês |
| economia: gráfico mensal | soma de `purchases` por mês (últimos ~6) + linha de orçamento |
| detalhe: history | `purchases` do produto (data, preço) |
| família: nome / código | `households.name` / `invite_code` |
| família: membros (nome/role/tg) | `household_members.name` / `role` (owner=Admin, member=Membro) / `telegram_chat_id is not null` |

## 8. Migration `0005_web_rpcs.sql` (contratos)

RPCs de escrita são `SECURITY DEFINER` e resolvem a família via `auth.uid()`:
`select household_id from household_members where auth_user_id = auth.uid() limit 1` (erro `sem_familia` se null). Espelham a lógica das RPCs de Telegram já existentes em 0003.

- `alter table products add column if not exists category text;`

Escrita (grant a `authenticated`):
- `mercado_apply_purchase_web(p_name text, p_brand text default null, p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')` — espelha `mercado_apply_purchase`.
- `mercado_apply_inventory_web(p_name text, p_qty numeric, p_unit text default 'un')` — espelha `mercado_apply_inventory` (recalibra taxa).
- `mercado_add_to_list_web(p_name text, p_qty numeric default 1, p_unit text default 'un', p_price numeric default null)` — espelha `mercado_add_to_list` (checa "já tem em casa").
- `mercado_toggle_list_item_web(p_list_id uuid, p_bought boolean)` — status pending<->bought (+ bought_at).
- `mercado_remove_from_list_web(p_list_id uuid)` — status removed.
- `mercado_set_budget_web(p_month date, p_amount numeric)` — upsert em `budgets` (unique household+month).

Leitura:
- View `v_stock_web` com `security_invoker = on` (aplica RLS do chamador): por produto retorna `id, household_id, name, category, unit, current_stock, par_level, consumption_rate_month, last_inventory_at, price_last (última compra), price_avg (média), trend ((price_last-price_avg)/nullif(price_avg,0))`. Grant select a `authenticated`.
- `mercado_economy_web()` — `SECURITY DEFINER` filtrando pela família do `auth.uid()`; retorna JSON com `savings[]` (name, old_price, new_price, saved), `budget` (month, total, spent, over, pct, saldo), `months[]` (label, value, current). Grant execute a `authenticated`.

Após aplicar: `supabase gen types typescript` para `web/src/lib/database.types.ts`.

## 9. Design tokens

Fonte: system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. Monospace (código de família): `ui-monospace, Menlo, monospace`. Zero fontes externas. `--brand` e `--brand-soft` derivam do accent (`#C15F3C`); os demais são fixos por tema.

### Tema claro
| Token | Hex | Token | Hex |
| --- | --- | --- | --- |
| `--desk` | `#E7DFD5` | `--brand` | `#C15F3C` |
| `--bg` | `#F4EEE7` | `--brand-ink` | `#FFF8F4` |
| `--card` | `#FFFFFF` | `--brand-soft` | `#F6E7E2` |
| `--card-2` | `#F3EDE6` | `--pos` | `#17935B` |
| `--text` | `#241E1A` | `--pos-ink` | `#0A1710` |
| `--text-2` | `#786C63` | `--pos-soft` | `#E2F1E9` |
| `--text-3` | `#A99E94` | `--warn` | `#C57814` |
| `--border` | `#EAE1D8` | `--warn-ink` | `#3A2400` |
| `--shadow` | `rgba(74,48,28,0.10)` | `--warn-soft` | `#FBEAD2` |
| `--shadow-lg` | `rgba(74,48,28,0.18)` | `--neg` | `#D6453F` |
| | | `--neg-ink` | `#FFF1F0` |
| | | `--neg-soft` | `#FBE6E4` |

### Tema escuro
| Token | Hex | Token | Hex |
| --- | --- | --- | --- |
| `--desk` | `#0C0908` | `--brand` | ~`#CD7A5C` (accent + branco 24%) |
| `--bg` | `#161210` | `--brand-ink` | `#2A130B` |
| `--card` | `#211B17` | `--brand-soft` | ~`#2C1A13` (accent + bg 82%) |
| `--card-2` | `#2A231D` | `--pos` | `#37B37F` |
| `--text` | `#F3EBE3` | `--pos-ink` | `#08140E` |
| `--text-2` | `#B4A89E` | `--pos-soft` | `#17281F` |
| `--text-3` | `#7D7167` | `--warn` | `#E7A33C` |
| `--border` | `#33291F` | `--warn-ink` | `#2E1C00` |
| `--shadow` | `rgba(0,0,0,0.45)` | `--warn-soft` | `#352814` |
| `--shadow-lg` | `rgba(0,0,0,0.6)` | `--neg` | `#E8706A` |
| | | `--neg-ink` | `#2A0E0C` |
| | | `--neg-soft` | `#361F1D` |

Fora do sistema de tokens: Telegram `#2AABEE` (texto branco).

### Raios, espaçamentos, sombras
- Raios: tela interna 36px; cards 20px (padrão), 18/16px; botões 14-16px; inputs 13-14px; avatares 12-16px; chips/pills/badges 999px; bottom sheet `24px 24px 0 0`; FAB 18px; busca 14px; barras de progresso 4-10px.
- Espaços: conteúdo do app `padding: 16px 16px 104px` (reserva tab bar + FAB); auth `24px 20px 28px`; landing `22px 20px 28px`; gaps de lista 10px. Alturas: inputs 46-54px, botões primários 50-52px, ícone-botões 40-48px.
- Sombras: card leve `0 1px 3px var(--shadow)`; card padrão `0 2px 10px var(--shadow)`; CTA `0 8px 20px var(--shadow-lg)`; FAB `0 10px 24px var(--shadow-lg)`; sheet `0 -10px 40px rgba(0,0,0,0.3)`; toast `0 10px 26px var(--shadow-lg)`.

## 10. Catálogo de componentes (do blueprint)

- Layout: AppShell (tela interna), TopBar (back|logo | título+subtítulo | menu+X / toggle tema), TabBar (Estoque/Lista/Economia), FAB (+ só na aba Lista com dados).
- ui: Button (primary/secondary/iconButton/ghost/destructive), Card, StatusChip/Pill, CountBadge, SectionLabel, ProgressBar (warn se ratio<0.5 senão pos), SearchField, Input+Label/Select, BottomSheet (overlay + grabber; fecha no overlay), Toast (auto-dismiss 2200ms), EmptyState, Skeleton/shimmer, AvatarInitial.
- estoque: StockItem (button; avatar, nome, qty, barra+%, chevron; variante Repor com `border-left:3px solid var(--warn)`), StockList (seções Repor / No estoque com badge de contagem), StockDetail (nível em casa, último/médio preço + trend, histórico, "Adicionar à lista"), HistoryTimeline.
- lista: ShopListItem (checkbox 24px, nome com line-through quando comprado, "qty unit · preço unit", subtotal), SummaryCard (Total a pagar 36px | divisor | Faltando N itens), AddItemSheet (nome, qtd, unidade select, preço).
- economia: SavingsCard (linhas name / preço antigo riscado / novo / -R$ economizado), BudgetCard (gasto/total, %, barra, pill status), BudgetSheet (valor), BarChart (barras por mês + linha tracejada de orçamento).
- familia: ChoiceCard (com ribbon "Recomendado"), FamilyCodeDisplay (monospace grande + copiar/compartilhar), MemberRow, OnboardingStepCard (badge numerado).

## 11. Interações e animações

Keyframes: `shimmer` (skeleton), `sheetUp` (`translateY(102%)->0`, `0.28s cubic-bezier(0.22,1,0.36,1)`), `fadeIn` (overlay), `toastIn`, `pop` (entrada de Detalhe/Config). Comportamentos: boot loading->normal; abrir detalhe via StockItem; sheets abrem por FAB/CTA e fecham no overlay (stopPropagation no painel); checkbox reordena comprados para o fim e recalcula total; copiar código via `navigator.clipboard` + toast, compartilhar via `navigator.share` com fallback; toggle de tema re-injeta variáveis; deep-links Telegram `https://t.me/Mercado_cellks_bot` (`target=_blank rel=noopener`). Sem gestos de swipe/drag.

## 12. PWA

- `manifest.webmanifest`: `name`/`short_name` "Dispensa", `theme_color #C15F3C`, `background_color #F4EEE7`, `display standalone`, ícones 192/512.
- `<meta name="theme-color" content="#C15F3C">`, `apple-touch-icon` (180), viewport `width=device-width, initial-scale=1`.
- `env(safe-area-inset-bottom)` na tab bar e sheets. Reset global: `box-sizing:border-box`, scrollbars ocultas, `html,body{margin:0;height:100%}`, `::placeholder{color:var(--text-3)}`.
- Reuso dos ícones já presentes no projeto de design (`icon-180/192/512.png`).

## 13. Env vars e deploy

- `.env.local` (não versionado): `NEXT_PUBLIC_SUPABASE_URL=https://eqguqkojztovfoafjqji.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>`. Exemplo em `.env.local.example`.
- Vercel: projeto `mercado-mensal-app`, Root Directory `web/`, mesmas envs. Token/CLI ou MCP da Vercel (nunca token no código). service_role fica só no n8n.

## 14. Ordem de implementação

0. Fundação: scaffold Next em `web/`, Tailwind + tokens (claro/escuro), PWA (manifest + ícones), layout raiz, salvar `Dispensa.dc.html` e assets, `.env.local.example`. Build local ok.
1. Design system: componentes `ui/` e `layout/` numa página "kitchen sink" para travar fidelidade visual.
2. Auth: clients Supabase (browser/server), middleware, `/login` `/signup` `/recuperar-senha` + `auth/callback`.
3. Família + guarda: `/familia*` com RPCs `_web` existentes e gating por `mercado_my_household`.
4. Migration `0005_web_rpcs.sql` + geração de tipos.
5. Estoque (lista + detalhe + estados vazio/loading).
6. Lista (total + add/marcar/remover via Server Actions).
7. Economia (economia + orçamento + gráfico + definir orçamento).
8. Config/Família (membros, copiar/compartilhar código, logout, toggle de tema).
9. Polimento PWA (instalável, deep-links Telegram, a11y/responsivo).
10. Deploy final na Vercel + verificação ponta a ponta.

## 15. Riscos e questões abertas

- Migration 0004 ainda não foi rodada no Supabase (pendência do projeto). Não bloqueia o web (0004 é dispatcher do Telegram), mas rodar 0005 pressupõe 0001-0003 aplicadas.
- Confirmação de e-mail do Supabase Auth: dependa da config do projeto. Se ativa, o cadastro exige confirmação antes do login; `/auth/callback` cobre o retorno.
- View `v_stock_web` precisa `security_invoker=on` (Postgres 15+, Supabase ok) para respeitar RLS do chamador.
- Economia (savings) é heurística de preço anterior vs atual; alinhar a fórmula com a lógica de `mercado_apply_purchase` para consistência com o que o bot informa.
- Telegram Mini App (SDK) e onboarding "primeira dispensa" ficam como evoluções pós-v1.
