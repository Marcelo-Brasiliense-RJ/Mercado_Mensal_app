# Modo "No mercado" — carrinho de compras

Data: 2026-07-08
Status: aprovado para planejamento

## Problema

Hoje a Lista de compras serve pra **planejar** em casa: monta a lista, vê o
total do que falta, e ao "comprar" repõe o estoque. Falta o momento oposto: o
usuário **dentro do mercado**, pegando itens, querendo:

1. Não comprar a mais — ser confrontado quando já tem o item em casa.
2. Acompanhar o total do carrinho subindo conforme pega.
3. Registrar tudo de uma vez ao final (repor estoque + gastos), não item a item.

A entrada de itens é pelo **Telegram** (voz/texto), que já é o canal principal
do projeto. O app web é o painel que reflete o carrinho ao vivo.

## Decisões travadas

| Tema | Decisão |
|---|---|
| Forma | Modo "No mercado" dedicado (aparece quando há compra aberta) |
| Entrada dos itens | Telegram (voz/texto), via bot n8n |
| Confronto "já tenho" | Sim, com confirmação, **só se estoque ≥ nível normal** (`par_level`) |
| Carrinho | Sessão com "Finalizar compra" (repõe estoque + registra gastos no fim) |
| Abrir/fechar sessão | Comandos explícitos no Telegram: "tô no mercado" abre, "finalizar" fecha |
| Preço do item | Bot **sempre pergunta** o preço de cada item pego (total exato) |
| Desambiguação | Na dúvida de intenção, o bot **pergunta** antes de gravar |
| Link do painel | O bot **manda o link do app** nas respostas-chave (abrir compra, finalizar) |
| App web | Painel ao vivo: carrinho + total subindo + botão "Finalizar compra"; polling ~4s |

## Reaproveitamento (não reinventar)

- A condição de confronto `estoque ≥ par_level` já existe em
  `mercado_add_to_list` (0002_functions.sql), campo `ja_tem_em_casa`. O carrinho
  reusa a mesma condição.
- Finalizar reusa a lógica de `mercado_apply_purchase`: repõe estoque, grava
  em `purchases` (histórico/economia) e marca item da `shopping_list` como
  comprado. Finalizar = rodar essa lógica pra cada item do carrinho.
- As funções web seguem o padrão `_web` (SECURITY DEFINER filtrando por
  `household_members where auth_user_id = auth.uid()`).

## Arquitetura

```
Telegram (voz/texto)
  -> n8n (agente): intenções de compra + desambiguação + confirmações
       -> RPC service_role: trip_start / trip_add / trip_finalize / trip_cancel
Supabase (shopping_trips + trip_items)  <-  App web (painel "No mercado", polling)
       -> trip_web / trip_finalize_web / trip_remove_item_web (SECURITY DEFINER)
```

## 1. Banco — migration `0012_cart.sql`

**`shopping_trips`** (a sessão):
- `id uuid pk`
- `household_id uuid not null references households`
- `status text not null default 'open'` — `open | finalized | cancelled`
- `started_at timestamptz not null default now()`
- `finalized_at timestamptz`
- Constraint: no máximo **uma trip `open` por household** (índice único parcial
  `where status = 'open'`).

**`trip_items`** (o que foi pego):
- `id uuid pk`
- `trip_id uuid not null references shopping_trips on delete cascade`
- `household_id uuid not null` (redundante, facilita RLS/consulta)
- `product_id uuid references products on delete set null`
- `item_name text not null`
- `quantity numeric not null default 1`
- `unit text not null default 'un'`
- `unit_price numeric not null` — preço informado (sempre perguntado)
- `above_par boolean not null default false` — estava acima do nível quando pego
- `created_at timestamptz not null default now()`

RLS habilitado sem policies permissivas (padrão do projeto: acesso só via
funções SECURITY DEFINER / service_role).

Total do carrinho = `sum(quantity * unit_price)` dos `trip_items` da trip aberta.

## 2. Funções do bot (service_role)

- **`mercado_trip_start(p_chat_id)`** — resolve household, cria trip `open`. Se
  já houver aberta, retorna a existente (idempotente). Retorna `trip_id, status`.
- **`mercado_trip_add(p_chat_id, p_name, p_price, p_qty, p_unit, p_confirm bool default false)`**
  — exige trip aberta (senão retorna `erro: sem_compra_aberta`). Calcula
  `above_par = estoque ≥ par_level`. Se `above_par and not p_confirm`, **não
  insere** e retorna `needs_confirm` (com estoque atual e nível). Caso
  contrário insere o item. Retorna `item, above_par, needs_confirm,
  total_parcial`.
  - Preço: `p_price` é obrigatório na gravação. Se o usuário não disser preço,
    o agente pergunta antes de chamar (a função não inventa preço).
- **`mercado_trip_finalize(p_chat_id)`** — pra cada `trip_item` da trip aberta
  aplica a lógica de compra (estoque + `purchases` + economia + marca
  `shopping_list` pending→bought). Marca trip `finalized`, `finalized_at=now()`.
  Retorna resumo: `itens, total, economia`.
- **`mercado_trip_cancel(p_chat_id)`** — marca trip `cancelled` sem efetivar
  nada. Retorna `ok`.

Todas `revoke ... from public, anon; grant execute ... to service_role`.

## 3. Funções web (SECURITY DEFINER via `auth.uid()`)

- **`mercado_trip_web()`** — retorna a trip aberta do household do usuário +
  itens + total, ou `null` se não houver. O painel chama em polling.
- **`mercado_trip_finalize_web()`** — mesma lógica de `mercado_trip_finalize`,
  resolvendo household por `auth.uid()`.
- **`mercado_trip_remove_item_web(p_id)`** — remove um `trip_item` da trip
  aberta do usuário (corrigir engano pelo painel).

`grant execute ... to authenticated`.

## 4. Agente n8n (comportamento do bot)

Novas intenções e regras no prompt/dispatcher:

- **"tô no mercado" / "começar compra"** → `trip_start`. Confirma: "Carrinho
  aberto. Vá falando o que for pegando." **e manda o link do painel** para
  acompanhar o total ao vivo.
- **Link do app:** o bot inclui a URL do painel web nas respostas-chave (ao
  abrir a compra e ao finalizar). A URL fica em variável de ambiente/credencial
  no n8n (`APP_URL`), não hard-coded no prompt.
  URL de produção: `https://mercado-mensal-app.vercel.app/`
- **Com trip aberta, "peguei/comprei X ..."** → `trip_add`.
  - Se o usuário **não disse o preço** → bot pergunta "Quanto foi o X?" e só
    então chama `trip_add`.
  - Se `needs_confirm` (acima do nível) → bot pergunta "Você já tem X em casa
    (acima do normal). Pego mesmo assim?" → ao confirmar, reenvia com
    `p_confirm=true`.
  - Responde com o total parcial: "Anotado. Carrinho: R$ N,NN."
- **"finalizar" / "fechei a compra"** → `trip_finalize`. Responde resumo:
  itens, total, economia.
- **"cancelar compra"** → `trip_cancel`.
- **Desambiguação (regra do usuário):** sem trip aberta, "comprei X" é ambíguo
  → o bot **pergunta** "Isso é agora no mercado (abro o carrinho) ou já foi
  comprado (registro direto)?" antes de gravar. Regra geral: em qualquer dúvida
  de intenção, perguntar antes de gravar.

## 5. App web — painel "No mercado"

- Componente novo consumido pela tela de Lista. Quando `mercado_trip_web()`
  retorna trip aberta, mostra no topo o **painel do carrinho**: lista dos itens
  pegos (nome, qtd, preço), **total grande**, e botão **"Finalizar compra"**
  (chama `mercado_trip_finalize_web`). Cada item tem um "×" para remover
  (`mercado_trip_remove_item_web`).
- Sem rota nova: o "modo dedicado" se ativa sozinho quando há compra aberta.
- **Atualização ao vivo por polling** (~4s) enquanto a tela está aberta. Sem
  realtime do Supabase (evita canais/policies; polling entrega o "ao vivo" com
  muito menos peça). `ponytail:` polling; migrar pra realtime só se o atraso
  incomodar.
- Store (`store.tsx`): adicionar `trip` ao estado + ações `reloadTrip`,
  `finalizeTrip`, `removeTripItem`.

## Fora de escopo (v1)

- Abrir a compra pelo app web (só pelo Telegram na v1).
- Entrada por voz **no app web** (a voz é no Telegram).
- Edição de preço/quantidade de item já no carrinho pelo painel (só remover).
- WhatsApp (fase 2 do projeto).

Adicionar quando: o usuário pedir.

## Critérios de sucesso

1. "tô no mercado" abre carrinho; itens ditos no Telegram entram com preço
   perguntado; total parcial responde a cada item.
2. Item acima do nível normal dispara confronto com confirmação; itens
   abaixo/sem estoque entram direto.
3. "finalizar" repõe o estoque de todos os itens, grava histórico/economia,
   marca itens da lista como comprados, e fecha a trip.
4. Sem trip aberta, "comprei X" faz o bot perguntar (mercado x já comprado).
5. O painel web mostra a trip aberta e o total, atualizando sozinho, e finaliza
   pelo botão.
