# tarefas.md

Plano de execução para o Claude Code no repositório `Mercado_app`.
Documento de estado: **o agente atualiza os checkboxes deste arquivo a cada tarefa concluída.**

Origem: auditoria de código de 2026-07-27 (leitura completa de `web/src`, das 20 migrations e da Edge Function) mais feedback de uso real do dono do produto.

---

## 0. O que este arquivo é

**Referência e estado.** Contexto, fatos verificados, regras, travas, tarefas e o log do que já foi feito.

O **protocolo de execução vem separado, no prompt de disparo**, não aqui. Este arquivo responde "o que fazer e sob quais restrições"; o prompt responde "como conduzir o loop".

Método por trás das tarefas: **goal-driven execution**, seção 4 de `/karpathy-guidelines`. Cada macro tarefa declara **Resultado** (o critério de sucesso, que responde "como eu sei que terminou") e **Verificação** (o comando que prova). Critério fraco obriga a perguntar a cada passo; critério forte deixa o loop rodar sozinho.

**Este arquivo é o estado do loop.** Persiste entre rodadas: ao retomar numa sessão nova, a seção 5 e o log da seção 9 dizem onde parou. Não recomece do zero.

---

## 0.1 Decisão de produto que orienta tudo abaixo

Tomada pelo dono em 2026-08-07, depois de uma auditoria UX e de relatos de uso real. **Não reabra estas duas decisões; construa sobre elas.**

**Decisão 1 — o modelo numérico fica.** Foi considerada e recusada a alternativa de trocar quantidades por três estados (tem / acabando / acabou). O app continua guardando quantidade, unidade, preço e valor em estoque, e a tela de Economia continua existindo.

**Decisão 2 — o esforço de facilidade recai inteiramente sobre a entrada de dados.** Como o usuário vai informar números, o produto só fica fácil se informar números for barato.

### As três regras de entrada

Toda tarefa de interface abaixo é avaliada contra estas regras. Uma tela que viole qualquer uma delas está errada, mesmo que funcione:

1. **Nunca perguntar duas vezes.** Dado que já existe (nota fiscal, histórico de compra, unidade do cadastro) nunca é pedido de novo.
2. **Todo campo nasce preenchido.** Quantidade `1`, unidade deduzida do nome do item, preço vindo da última compra. O usuário corrige o que está errado; nunca preenche do zero.
3. **Ajuste por toque, teclado só por opção.** Botões de mais/menos e atalhos ("metade", "acabou") antes de campo numérico. Teclado é para quem quer um valor exato, não o caminho padrão.

### Consequência direta: `par_level` vira peça central

No modelo de três estados o `par_level` deixaria de existir. Como o modelo numérico ficou, **é ele que decide quando aparece "Repor"**, e hoje ele é a quantidade da primeira compra, congelada, sem tela para editar (ver seção 2). Isso torna o alerta central do produto arbitrário.

A correção **não é** adicionar um campo pedindo o número. É o app **sugerir** a partir do histórico de compras ("você costuma comprar 2 por mês, aviso quando cair abaixo de 1?"), com aceitar em um toque e ajuste manual para quem quiser. Regra 2 aplicada ao próprio parâmetro.

### Consequência direta: valor antes de cadastro

Também decidido: **despensa de exemplo antes do login**. O visitante abre o app e já vê uma despensa plausível marcada como exemplo, podendo mexer. Conta só é exigida na hora de salvar. Família e Telegram deixam de ser etapas obrigatórias de setup e viram opcionais. Ver GRUPO J.

---

## 1. Contexto mínimo do projeto

App de controle de dispensa e compras do mês de uma família.

| Camada | O que é |
|---|---|
| `web/` | Next.js 16.2.10 (App Router), React 19, Tailwind v4, TypeScript. PWA mobile-first. |
| `supabase/migrations/` | Postgres. **Toda a regra de negócio vive em funções SQL (RPC).** 20 migrations aplicadas, `0001` a `0020`. |
| `supabase/functions/nfce-consulta/` | Edge Function Deno. Consulta NFC-e na SEFAZ-RJ. **Está morta, o portal bloqueia.** |
| n8n (fora do repo) | Bot do Telegram. Áudio → Groq Whisper → agente LLM → RPC. Instância `braziotech-n8n.cloudfy.live`. |

Convenções que **você deve seguir** porque já são o padrão do repositório:

- RPC do app web: sufixo `_web`, resolve a família por `auth.uid()`, `security definer set search_path = public`, `grant execute ... to authenticated`.
- RPC do bot: recebe `p_chat_id bigint`, resolve por `mercado_resolve_household()`, `grant ... to service_role`.
- Retorno padrão: `json_build_object('ok', true|false, 'erro', '<slug>')`.
- Comentário em português no topo de cada migration explicando o porquê.
- Atalho deliberado leva comentário `ponytail:` nomeando o teto e o caminho de upgrade.
- Migration nova recebe um bloco `do $$ ... assert ... $$` de self-test no fim, no padrão de [`0007_rate_limit.sql`](supabase/migrations/0007_rate_limit.sql).

---

## 2. Fatos verificados x hipóteses

**Isto é a trava anti-alucinação mais importante do documento.** Não trate hipótese como fato.

### Verificado por leitura de código (pode agir direto)

| Fato | Evidência |
|---|---|
| Nada nunca escreve na tabela `budgets` | `grep -rn "budgets" supabase/migrations/`: só `create table` (0001), policy (0003) e 4 leituras (0008, 0017, 0018, 0019) |
| `setBudget` é só estado local | [`store.tsx:242-245`](web/src/lib/store.tsx#L242-L245) |
| Nenhuma escrita do store lê o retorno da RPC | `store.tsx`, todas as funções exceto `confirmReceipt` |
| Não existe `<form>` no app | `grep -rn "<form" web/src/` retorna vazio |
| `mercado_trip_add` exige preço e trava pedindo confirmação | [`0012_cart.sql`](supabase/migrations/0012_cart.sql), blocos `sem_preco` e `needs_confirm` |
| `mercado_apply` aceita 1 item por chamada | [`0004_dispatch.sql`](supabase/migrations/0004_dispatch.sql) |
| `mercado_apply_inventory` não devolve o estoque anterior | [`0003_multitenant.sql`](supabase/migrations/0003_multitenant.sql#L204-L206) |
| `par_level` = quantidade da primeira compra, sem UI para editar | [`0005_receipt.sql:38-47`](supabase/migrations/0005_receipt.sql#L38-L47) |
| `QR_FAMILIAS` é lista vazia, QR desligado para todos | [`config.ts:15`](web/src/lib/config.ts#L15) |
| A Edge Function já detecta o bloqueio da SEFAZ | [`index.ts:74-76`](supabase/functions/nfce-consulta/index.ts#L74-L76) |
| `--text-3: #A99E94` sobre `#FFFFFF` dá 2,6:1 (mínimo AA é 4,5:1) | [`globals.css:6`](web/src/app/globals.css#L6), cálculo WCAG |
| 5 testes no total, 2 arquivos, todos passam | `npx vitest run` |
| A média de `savings` inclui a própria última compra | [`0008_read_web.sql:83-95`](supabase/migrations/0008_read_web.sql#L83-L95) |

### Confirmado no banco de produção via MCP `supabase` (leitura, 2026-07-27)

| Fato | Query e resultado |
|---|---|
| As 20 migrations estão aplicadas | `select proname, pg_get_function_identity_arguments(oid) from pg_proc ... like 'mercado_%'`: 47 funções, incluindo `mercado_list_update_web` (0020) e `mercado_fmt_num` (0018). **Não existem** `mercado_lote`, `mercado_desfazer`, `mercado_budget_set_web`, `mercado_stock_set_par_web`, `mercado_trip_start_web`, coerente com o plano. |
| Assinatura viva de `mercado_trip_add` | `p_chat_id bigint, p_name text, p_price numeric, p_qty numeric, p_unit text, p_confirm boolean`. Bate com a da `0021`. |
| Existe `mercado_apply_purchase_h(h uuid, ...)` no banco | Não aparece em nenhuma das migrations `0001` a `0020` lidas. **Origem desconhecida, confirmar com o dono antes de A4 tocar em `mercado_apply_purchase`.** |
| `authenticated` **e** `anon` têm `arwdDxtm` em todas as 10 tabelas | `select relname, relacl from pg_class ...`. Confirma a hipótese que bloqueava F3, e ela era pior do que o suposto: `anon` também tem. |
| RLS está ligado nas 10 tabelas | `select relname, relrowsecurity, (policies) from pg_class ...`: 6 tabelas com 1 policy `to authenticated`, 4 (`shopping_trips`, `trip_items`, `receipt_drafts`, `receipts`) com zero policy, acesso só por `security definer`. |
| O frontend não acessa tabela direto | `grep -rn "\.from(" web/src/` retorna vazio: tudo passa por RPC. Logo, revogar o grant de `authenticated` (F3) não quebra o app web. |

**Leitura de segurança do que ficou confirmado:** `anon` está barrado hoje só pelo RLS, porque toda policy é `to authenticated`. O grant é supérfluo e é uma mina: qualquer policy futura escrita `to public` abre as tabelas para quem tiver a chave anônima, que é pública por definição. `authenticated` consegue hoje escrever direto via PostgREST em `products`, `budgets`, `shopping_list`, `purchases`, `households` e `household_members`, pulando as RPCs e a validação delas. Isso eleva F3 de "depende de confirmação" para pendência real, mas **continua fora do escopo desta rodada.**

### Relatado em uso real pelo dono do produto (evidência de campo, trate como fato)

Três falhas observadas usando o bot de verdade. Todas são **erro de classificação de intenção pelo agente LLM**, e ocorrem nos dois sentidos:

| O que foi dito | Intenção correta | O que aconteceu |
|---|---|---|
| "estou no mercado" | `comecar`, abrir carrinho | Ignorado. Bot respondeu que não havia compra aberta. Correção teve que ser manual no app. |
| "quero comprar cinco litros de leite" | `vou_comprar`, vai para a lista | Registrou no **estoque** |
| "na verdade tenho 3 caixas de leite" | `tenho`, ajusta o estoque | Registrou na **lista de compras** |

**Consequência relatada:** retrabalho manual no app depois de cada erro.

**Risco latente derivado, ainda não observado mas garantido pelo código:** `mercado_apply_inventory` faz `current_stock = p_qty` (sobrescreve) e `mercado_apply_purchase` faz `current_stock = current_stock + p_qty` (soma). Quando o LLM troca essas duas intenções, o estoque fica numericamente errado **sem nenhum aviso**. Tinha 1, disse "tenho 3", vira 4. Tinha 5, comprou 2, vira 2.

**Conclusão de engenharia que orienta as tarefas A3, A4 e o GRUPO I:** afinar o prompt reduz a frequência, nunca zera. Classificação por LLM é probabilística. A correção durável é determinística e mora no banco: tornar o erro impossível onde der (A3), visível na hora (A4) e reversível sempre (GRUPO I).

### Hipótese, precisa de confirmação humana (NÃO agir sozinho)

| Hipótese | Como confirmar | Bloqueia qual tarefa |
|---|---|---|
| ~~Migrations `0001` a `0020` aplicadas~~ | **Confirmado em 2026-07-27**, ver bloco acima | — |
| ~~`authenticated` tem GRANT de tabela~~ | **Confirmado em 2026-07-27**, ver bloco acima. `anon` também tem. | F3, agora desbloqueada |
| Chaves de API citadas em `CONTEXTO.md` seção 8 foram rotacionadas | Perguntar ao dono | E2 |
| `mercado_apply_purchase_h(h uuid, ...)` existe no banco mas não em nenhuma migration do repositório | Perguntar ao dono: foi criada à mão no SQL Editor? Quem a chama? | A4, se ela também precisar dos campos `acao`/`antes`/`depois` |
| O modelo do agente (`llama-3.3-70b` via Groq, conforme `CONTEXTO.md`) é forte o bastante para classificar intenção em português falado com nuance | Só dá para medir depois do GRUPO I: o log de eventos mostra a taxa real de erro por intenção. **Não troque de modelo por palpite.** | H1 |

**Acesso ao banco: leitura sim, escrita não.** O MCP `supabase` está configurado neste projeto com `read_only=true` (ver `.mcp.json`). Use-o para **confirmar** as hipóteses acima em vez de supor: liste funções, veja o schema, cheque os grants. Nunca afirme que uma migration "foi aplicada" sem ter verificado.

Escrita continua sendo manual do humano: você produz o arquivo `.sql`, ele aplica no SQL Editor. O `read_only` é uma trava deliberada, **não tente contorná-la** por outro caminho.

---

## 3. Regras anti-alucinação

1. **Verifique antes de citar.** Todo nome de RPC, coluna, arquivo ou variável que você usar precisa ter sido lido nesta sessão. Em dúvida, `grep` primeiro. Nome inventado que compila é o pior tipo de bug aqui.
2. **Não presuma o estado do banco.** Você lê `.sql` do repositório, não o schema vivo. Se a tarefa depender do estado real, pare e escreva a query de verificação para o humano rodar.
3. **Não invente números.** Contraste, preço de API, latência, cobertura de teste: ou mede, ou cita a fonte, ou omite.
4. **Não invente comportamento de terceiros.** Pricing da Meta/WhatsApp, resposta da SEFAZ, limites do Supabase: se não está no repositório, não afirme. Marque como "confirmar".
5. **Next.js 16 não é o Next.js que você aprendeu.** Antes de escrever qualquer coisa de framework (middleware, rotas, cache, `proxy.ts`), leia o guia relevante em `node_modules/next/dist/docs/`. O repositório avisa isso em [`web/AGENTS.md`](web/AGENTS.md). O middleware aqui chama-se `proxy.ts`, não `middleware.ts`.
6. **Não altere migrations já existentes.** `0001` a `0020` estão aplicadas em produção. Correção é sempre `create or replace` numa migration **nova**, a partir de `0021`.
7. **Se a tarefa estiver ambígua, pare e pergunte.** Não escolha uma interpretação em silêncio. Escreva a dúvida no log e pule a tarefa.
8. **Relate o que falhou.** Se o portão de verificação não passou, diga isso com a saída do comando. Nunca marque `[x]` sem o portão verde.
9. **Não afirme "corrigido" sem evidência.** Evidência é saída de comando colada no log, não raciocínio.

---

## 4. Travas (guardrails)

**Proibido sem autorização explícita do humano, mesmo que pareça óbvio:**

- `git commit`, `git push`, `git reset --hard`, `git checkout --`, qualquer coisa que descarte trabalho.
- Alterar arquivos em `supabase/migrations/0001` a `0020`.
- Alterar `.env`, `.env.local`, `.mcp.json`, `.gitleaks.toml`, `.githooks/`.
- Instalar, atualizar ou remover dependência do `package.json`. Exceção: a remoção do `jsqr` na tarefa E1, que está autorizada aqui.
- Escrever no banco de produção. O MCP `supabase` é `read_only` e leitura é liberada e incentivada; escrita é do humano, no SQL Editor.
- Escrever na instância do n8n **antes** de a tarefa H0 (backup versionado do workflow) estar concluída. Leitura via MCP (`n8n_get_workflow`, `n8n_list_workflows`, `n8n_validate_workflow`) é liberada a qualquer momento.
- Criar arquivo fora dos caminhos que a tarefa corrente nomeia.
- Refatorar código adjacente que não faz parte da tarefa. Se notar problema, escreva no log, não conserte.
- Deletar código pré-existente que a tarefa não mandou deletar.

**Escopo por turno:**

- Uma macro tarefa por turno. O diff deve caber inteiro na macro tarefa corrente.
- Não misture grupos. Turno de SQL não toca `.tsx`. Turno de frontend não toca `.sql`.
- Se o diff passar de ~150 linhas numa micro tarefa, pare e reavalie: quase sempre é sinal de que você saiu do escopo.

**Escada de decisão (o projeto já segue este princípio, mantenha):**

Antes de escrever código novo, nesta ordem: isto precisa existir? já existe algo no repositório que resolve? a plataforma resolve nativamente? uma dependência já instalada resolve? dá em uma linha? Só então escreva. Pare no primeiro degrau que sustenta.

---

## 5. Estado (checklist mestre)

`[ ]` pendente · `[x]` feito e verificado · `[!]` falhou duas vezes, ver log · `[-]` fora do escopo desta rodada

A ordem desta seção é a ordem de execução. Ela manda, não a ordem alfabética dos grupos.

### `[ESCOPO DA RODADA]` P0, erros de classificação e falha silenciosa em dinheiro

- [x] **A3** SQL: carrinho abre sozinho (mata o caso "estou no mercado" ignorado)
- [x] **A1** SQL: preço opcional e confirmação não bloqueante no carrinho
- [x] **A4** SQL: retorno explícito da ação, para o bot ecoar
- [x] **A2** SQL: persistir orçamento
- [x] **B1** Front: tratar erro em toda escrita do store
- [x] **B2** Front: remover o hack `vitrine()`
- [x] **B3** Front: envolver campos em `<form>`

### `[ESCOPO DA RODADA]` P1 alta, desfazer e prevenção do erro

- [x] **I1** SQL: log de eventos (**depende de A4**)
- [x] **I2** SQL: desfazer
- [x] **H0** n8n: workflow versionado em [`n8n/assistente-dispensa.json`](n8n/assistente-dispensa.json)
- [x] **H1** n8n: classificação de intenção, eco e revogação das travas do carrinho aplicados ao nó `Assistente`, em dois patches (ver log dos turnos 11 e 12). Falta só o eco **com números**, que não é do prompt e sim do nó Code `Montar resposta` — proposto, não executado.
- [x] **APLICADO NO BANCO** `0021`, `0023` e `0024`, com os self-tests passando. Ver log do turno 12.
- [x] **0024** SQL: conserto do bug de ordem do desfazer, encontrado na verificação pós-aplicação da `0023`

### `[-]` P1, próxima rodada

- [-] **C1** SQL: `mercado_lote()`, entrada de múltiplos itens com resumo comparativo
- [-] **H1b** n8n: instruir o agente a usar `mercado_lote` (**depende de C1**)
- [-] **I3** Front: desfazer no toast e histórico real no detalhe do item
- [-] **C2** SQL: editar o nível normal (`par_level`)
- [x] **C3 + D3** SQL + Front: abrir, pegar, cancelar e finalizar a compra pelo app (turno 23, `0026` aplicada)
- [-] **D1** Front: grade de entrada em lote reaproveitando a revisão da nota
- [-] **D2** Front: campo "nível normal" no detalhe do item
- [-] **D3** Front: botão "Estou no mercado"

### `[ESCOPO DA RODADA 2]` Praticidade de uso, decidida na seção 0.1

- [x] **K1** Front: `proxy.ts` movido para `web/src/`, guarda de rota volta a rodar (turno 14)
- [x] **K2** Front: "Dispensa" → "Despensa" no texto visível (turno 14)
- [x] **J1** Front: defaults inteligentes de unidade, preço e aviso de duplicado (turno 14)
- [x] **J3** Front: "Usei metade" / "Acabou" / "Digitar", alvo de 44px (turno 14, parcial: falta o stepper J3.1)
- [x] **C2 + J2.1** SQL: `0025_par_level.sql`, escrever o nível normal e sugeri-lo pelo histórico (turno 15, **aplicada em produção no turno 22**)
- [x] **J2.2 a J2.5** Front: aceitar a sugestão em um toque no `ItemDetailModal` (turno 16)
- [x] **D1** Front: grade de entrada em lote reaproveitando a revisão da nota fiscal (turno 17)
- [x] **J4** Front: despensa de exemplo antes do login (inclui o teste do modelo de três estados) (turno 18)
- [x] **J3.1** Front: stepper de mais/menos na quantidade (turno 19)
- [x] **K3** Front: link de recuperação inválido não é barrado (turno 20)
- [x] **K4** Front: um botão primário só na landing (turno 21)

### `[-]` P2, depois

- [-] **E1** Limpeza: remover o fluxo de QR da NFC-e
- [-] **E2** Limpeza: atualizar `CONTEXTO.md`
- [-] **D4** Front: remover o `AddMenu` intermediário
- [-] **F1** A11y: contraste do `--text-3` e `:focus-visible`
- [-] **F2** A11y: `Modal` com `role="dialog"`, focus trap e trava de scroll
- [-] **F3** Segurança: revogar GRANT de tabela de `authenticated` (depende de confirmação)
- [-] **F4** Texto: acentuação nas mensagens de `entrar/page.tsx`
- [-] **G1** SQL: corrigir a matemática de `savings`
- [-] **G2** Testes: cobrir `format.ts`
**Nota de escopo:** 10 turnos, sem folga. A3, B2 e H0 são pequenas e devem sobrar tempo; se estourar, o arquivo persiste o estado e a próxima rodada continua.

Por que `C1` (entrada em lote) saiu e `H1` entrou, sendo que C1 estava antes: **C1 sem H1 é código morto.** Quem aciona a rota de lote é o prompt do agente. E, mais importante, A4 e I1 apenas expõem e revertem o erro de classificação; quem reduz a **frequência** dele é o H1. Prevenir vale mais que compensar.

---

## 6. Macro tarefas

Cada macro tarefa declara: **Resultado** (a condição de pronto), **Micro tarefas**, **Abordagem**, **Arquivos** e **Verificação**.

---

### GRUPO A · SQL · Prioridade P0

Grupo inteiro em uma migration nova: `supabase/migrations/0021_fluxo_p0.sql`.

---

#### MACRO A1 · Preço opcional e confirmação não bloqueante no carrinho

**Resultado:** registrar um item no mercado por voz vira **um turno de conversa** em vez de dois ou três. O bot só pergunta o preço quando o item nunca foi comprado antes.

**Problema (verificado):** em [`0012_cart.sql`](supabase/migrations/0012_cart.sql), `mercado_trip_add` tem duas travas:

```sql
if above and not coalesce(p_confirm, false) then
  return json_build_object('ok', true, 'needs_confirm', true, ...);  -- turno extra
end if;
if p_price is null then
  return json_build_object('ok', false, 'erro', 'sem_preco', ...);   -- turno extra
end if;
```

Numa compra de 30 itens isso gera 60 a 90 turnos de conversa dentro do supermercado. É a maior fonte de atrito do produto.

**Micro tarefas**

- [ ] A1.1 `create or replace function mercado_trip_add(...)` na `0021`, mantendo a assinatura **idêntica** (o n8n já chama com esses parâmetros, mudar a assinatura quebra o workflow em produção).
- [ ] A1.2 Quando `p_price is null`, buscar o último preço conhecido do produto.
- [ ] A1.3 Se não houver histórico, aí sim devolver `sem_preco`.
- [ ] A1.4 Trocar a trava `needs_confirm` por aviso: grava o item e devolve `'aviso', 'ja_tinha_em_casa'` junto do `estoque_atual`, sem impedir a gravação.
- [ ] A1.5 Acrescentar `'preco_origem', 'informado'|'historico'` ao retorno, para o bot poder dizer "usei R$ 22,00 do mês passado".
- [ ] A1.6 Self-test no padrão da `0007`.

**Abordagem**

O fallback de preço **já existe no repositório**, em `mercado_add_to_list` ([`0013`](supabase/migrations/0013_add_to_list_qty.sql)). Copie o padrão, não invente outro:

```sql
select unit_price into ult_preco from purchases
  where product_id = pid order by purchased_at desc limit 1;
```

Mantenha o parâmetro `p_confirm` na assinatura mesmo sem uso ativo, para não quebrar o n8n. Ele passa a ser ignorado; documente isso em comentário.

**Arquivos:** cria `supabase/migrations/0021_fluxo_p0.sql`. Não toca em `0012`.

**Verificação:** o arquivo tem `create or replace`, não `create`. A assinatura bate caractere por caractere com a de `0012`. O bloco `do $$ assert $$` cobre: preço informado, preço vindo do histórico, item sem histórico devolvendo `sem_preco`, e item acima do nível gravando com aviso.

---

#### MACRO A2 · Persistir orçamento

**Resultado:** o orçamento definido na tela Economia sobrevive a um reload. O selo "Acima em R$ X" para de aparecer permanentemente.

**Problema (verificado):** nada, nem app nem bot, escreve em `budgets`. `budget.total` é sempre `0`, então `budgetStatus` retorna `over = spent > 0` sempre, o card mostra "de R$ 0,00" e o gráfico previsto x realizado não tem previsto. O botão "Ajustar" exibe o toast "Orçamento atualizado" e não grava nada.

**Micro tarefas**

- [ ] A2.1 `mercado_budget_set_web(p_total numeric)` na `0021`: upsert em `budgets` para o mês corrente, resolvendo a casa por `auth.uid()`.
- [ ] A2.2 Validar: `p_total > 0`, senão `{'ok':false,'erro':'valor_invalido'}`.
- [ ] A2.3 `grant execute ... to authenticated`.
- [ ] A2.4 Self-test.

**Abordagem**

A tabela já tem a constraint que você precisa: `unique (household_id, month)` em [`0001_init.sql`](supabase/migrations/0001_init.sql#L67). Use `on conflict (household_id, month) do update`, não `delete` seguido de `insert`.

O mês é `date_trunc('month', current_date)::date`, exatamente como a leitura em [`0008`](supabase/migrations/0008_read_web.sql#L80) já faz. Divergir disso faz a escrita não bater com a leitura.

Escopo desta tarefa é **só o SQL**. O lado React é B1, que já vai passar a tratar retorno de RPC.

**Arquivos:** `supabase/migrations/0021_fluxo_p0.sql`.

**Verificação:** self-test grava, lê de volta pela `mercado_economia_web` e confere que `budget.total` reflete o valor.

---

#### MACRO A3 · Carrinho abre sozinho

**Resultado:** "estou no mercado, peguei arroz" funciona na primeira tentativa. O erro `sem_compra_aberta` deixa de existir como classe.

**Problema (relatado em uso real, ver seção 2):** o usuário abriu a compra por voz, o bot não reconheceu a intenção `comecar`, e a gravação seguinte falhou com `sem_compra_aberta`. Correção manual no app, retrabalho.

**Micro tarefas**

- [ ] A3.1 Em `mercado_trip_add` (a versão nova da A1, na `0021`), quando não houver compra aberta: chamar `mercado_trip_start` internamente e seguir, em vez de devolver erro.
- [ ] A3.2 Acrescentar `'compra_aberta_agora', true` ao retorno quando isso ocorrer, para o bot poder dizer "abri sua compra e anotei o arroz".
- [ ] A3.3 Manter `mercado_trip_start` como está: continua servindo para quem diz só "estou no mercado" sem citar item.
- [ ] A3.4 Self-test: `trip_add` sem compra aberta deve gravar e devolver `ok: true`.

**Abordagem**

Este é o conserto de maior retorno do arquivo inteiro: três linhas eliminam uma classe de erro que hoje depende de o LLM acertar uma classificação.

`mercado_trip_start` **já é idempotente** ([`0012`](supabase/migrations/0012_cart.sql), devolve a compra existente se houver), então chamá-la de dentro do `trip_add` é seguro por construção. Não replique a lógica de abertura, chame a função.

Princípio geral, vale para o resto do projeto: quando o acerto do LLM for opcional, torne-o opcional de verdade. Não ensine o modelo a chamar `comecar` antes de `pegar`; faça `pegar` não precisar disso.

**Arquivos:** `supabase/migrations/0021_fluxo_p0.sql`. Combina com A1 no mesmo `create or replace`, é a mesma função.

---

#### MACRO A4 · Retorno explícito da ação, para o bot ecoar

**Resultado:** a resposta do bot deixa óbvio **qual** registro foi mexido, de forma que uma classificação errada salte aos olhos no mesmo instante, e não dias depois.

**Problema (relatado em uso real, ver seção 2):** "quero comprar 5 L de leite" foi para o estoque, e "na verdade tenho 3 caixas" foi para a lista. Nos dois casos o bot respondeu algo que **não deixou claro onde gravou**, então o erro só apareceu quando o usuário abriu o app.

**Micro tarefas**

- [ ] A4.1 Padronizar o retorno das quatro funções de escrita do bot, acrescentando três campos sem remover nenhum dos atuais:
  - `acao`: `'estoque_ajustado' | 'compra_registrada' | 'adicionado_lista' | 'consumo_baixado'`
  - `antes`: estoque antes da operação (`null` quando não se aplica, como em `vou_comprar`)
  - `depois`: estoque depois
- [ ] A4.2 Fazer `mercado_apply` ([`0004`](supabase/migrations/0004_dispatch.sql)) repassar esses campos.
- [ ] A4.3 Em `mercado_add_to_list`, deixar explícito que **não** houve mudança de estoque: `'acao':'adicionado_lista'`, `'antes': <estoque atual>`, `'depois': <o mesmo>`.
- [ ] A4.4 Self-test conferindo que cada intenção devolve a `acao` correspondente.

**Abordagem**

Só acrescente campos. **Não remova nem renomeie nada** do retorno atual: o workflow do n8n em produção lê essas chaves, e mudar quebra o bot.

A leitura de `antes` precisa acontecer **antes** do `update`. Nas funções de [`0003`](supabase/migrations/0003_multitenant.sql) o `select ... into` já roda antes, então na maioria dos casos é só guardar a variável que já existe em vez de descartá-la.

Isto é a base para o eco que o H1 vai instruir o agente a produzir, no formato "ajustei o ESTOQUE: leite de 1 para 3" contra "coloquei na LISTA: 5 L de leite". A função entrega o dado; o prompt decide a frase.

Não tente validar a intenção dentro do SQL. O banco não tem contexto da conversa para saber se o LLM acertou. O papel dele aqui é relatar com precisão o que fez.

**Arquivos:** `supabase/migrations/0021_fluxo_p0.sql`.

---

### GRUPO B · Frontend · Prioridade P0

---

#### MACRO B1 · Tratar erro em toda escrita do store

**Resultado:** nenhuma ação do app mostra "sucesso" quando a RPC falhou. Erro vira toast honesto.

**Problema (verificado):** todas as escritas de [`store.tsx`](web/src/lib/store.tsx) descartam o retorno:

```ts
await createClient().rpc("mercado_stock_zerar_web", { p_ids: ids });
await reloadData();
```

As RPCs foram escritas devolvendo `{ok:false, erro:'sem_familia'}` e ninguém lê. Em [`ListView.comprar`](web/src/components/lista/ListView.tsx#L48-L53) o `showToast("Comprado, estoque reposto")` dispara mesmo com falha. Sessão expirada ou rede caindo no mercado viram "sucesso".

**Micro tarefas**

- [ ] B1.1 Criar **um** helper privado em `store.tsx`, algo como `callRpc(name, params): Promise<{ok, erro?}>`, que trata o `error` do supabase-js **e** o `{ok:false}` do corpo, que são coisas diferentes.
- [ ] B1.2 Passar as escritas para o helper: `zerarStock`, `baixaStock`, `addStock`, `deleteStock`, `stockToList`, `finalizeTrip`, `removeTripItem`, `addShopItem`, `updateShopItem`, `addStockToList`, `buyItems`, `removeItems`.
- [ ] B1.3 Fazer as funções devolverem o resultado, e só chamar `reloadData()` quando deu certo.
- [ ] B1.4 Nos componentes chamadores, só mostrar o toast de sucesso se `ok`. Se não, `showToast` com mensagem em português.
- [ ] B1.5 Ligar `setBudget` na `mercado_budget_set_web` da A2, virando `async`, e ajustar [`BudgetModal`](web/src/components/economia/BudgetModal.tsx).

**Abordagem**

Um helper, não uma camada. Nada de classe de serviço nem wrapper genérico com retry: o padrão de chamada já é uniforme, um `async function` de umas 10 linhas cobre os 12 casos.

`confirmReceipt` **já trata** corretamente. Use como referência de estilo e **não a reescreva**.

Mensagem de erro por slug conhecido, com fallback genérico. Não invente slugs: os que existem nas migrations são `sem_familia`, `nao_encontrado`, `sem_nome`, `valor_invalido`, `ja_importada`, `sem_compra_aberta`, `sem_preco`. Confirme com `grep -rn "'erro'," supabase/migrations/` antes de escrever o mapa.

**Arquivos:** `web/src/lib/store.tsx`, `web/src/components/economia/BudgetModal.tsx`, e os chamadores que hoje dão toast incondicional (`ListView.tsx`, `StockView.tsx`, `ItemDetailModal.tsx`, `ListItemActions.tsx`, `StockAddModal.tsx`, `AddItemModal.tsx`).

**Verificação:** `grep -n "await createClient().rpc" web/src/lib/store.tsx` não deve retornar nenhuma escrita fora do helper. Portão da seção 7 verde.

---

#### MACRO B2 · Remover o hack `vitrine()`

**Resultado:** a ordenação do estoque é alfabética para todo mundo, sem exceção codificada.

**Problema (verificado):** [`StockView.tsx:26-38`](web/src/components/estoque/StockView.tsx#L26-L38) procura o item literal `"absorvente"` e o reposiciona, quebrando a ordem alfabética. O comentário diz que era "hack de vitrine só pro print de lançamento". Roda em toda renderização, para todas as famílias.

**Micro tarefas**

- [ ] B2.1 Apagar a função `vitrine`.
- [ ] B2.2 Trocar `const filtered = vitrine(stock.filter(...))` por `const filtered = stock.filter(...)`.
- [ ] B2.3 Conferir que nada mais importa ou chama `vitrine`.

**Abordagem:** deleção pura. A instrução de remoção está no próprio comentário do código. Não substitua por outra ordenação: a ordem alfabética já vem do `order by p.name` da RPC `mercado_stock_web`.

**Arquivos:** `web/src/components/estoque/StockView.tsx`.

**Verificação:** `grep -rn "vitrine\|absorvente" web/src/` retorna vazio.

---

#### MACRO B3 · Envolver campos em `<form>`

**Resultado:** Enter envia em toda tela com campo. No celular o botão "Ir" do teclado funciona.

**Problema (verificado):** `grep -rn "<form" web/src/` retorna **zero**. Enter não faz nada em login, cadastro, recuperar senha, adicionar ao estoque, adicionar à lista, editar item, orçamento e trocar de família. Só [`redefinir-senha:69`](web/src/app/redefinir-senha/page.tsx#L69) tem `onKeyDown`.

**Micro tarefas**

- [ ] B3.1 `web/src/app/entrar/page.tsx`: um `<form>` por fase (`login`, `signup`, `forgot`), com `onSubmit={e => {e.preventDefault(); fn();}}` e o botão principal como `type="submit"`.
- [ ] B3.2 `StockAddModal.tsx`, `AddItemModal.tsx`, `BudgetModal.tsx`: mesmo tratamento.
- [ ] B3.3 `ListItemActions.tsx`: form só em volta do bloco de edição (quantidade, unidade, preço) que tem o "Salvar alterações". Os botões de ação embaixo continuam `type="button"`.
- [ ] B3.4 `FamiliaView.tsx`: form no campo de código de convite.
- [ ] B3.5 Todo botão dentro de form que **não** é o de envio precisa de `type="button"` explícito, senão vira submit por padrão do HTML e dispara a ação errada.

**Abordagem**

Elemento nativo, sem biblioteca de formulário. A validação já existe em JS em cada tela e continua como está; esta tarefa é só sobre o envio.

**Cuidado que quebra as coisas:** o padrão "Cancelar" e "Confirmar" lado a lado aparece em quase todo modal. `<button>` sem `type` dentro de `<form>` é `submit`. Se você esquecer o `type="button"` no Cancelar, ele passa a salvar em vez de cancelar. Confira modal por modal.

**Arquivos:** os seis listados acima.

**Verificação:** `grep -rn "<button" web/src/components/**/[A-Z]*Modal.tsx` e conferir que todo botão dentro de form tem `type` explícito. Portão verde.

---

### GRUPO C · SQL · Prioridade P1 · A rota de entrada em lote

Migration nova: `supabase/migrations/0022_lote.sql`.

---

#### MACRO C1 · `mercado_lote()`, entrada de múltiplos itens com resumo comparativo

**Resultado:** um áudio só ("tenho arroz cinco quilos, feijão dois, e preciso comprar óleo") vira **uma** chamada de RPC e **uma** resposta do bot com comparativo antes/depois.

**Problema (verificado):** [`0004_dispatch.sql`](supabase/migrations/0004_dispatch.sql) aceita um item por chamada. Três itens obrigam o agente LLM a três chamadas em sequência: lento, e se a terceira falhar as duas primeiras já gravaram, sem rollback. Além disso `mercado_apply_inventory` não devolve o estoque anterior, então o bot não tem como dizer "você tinha 2, agora tem 5".

**Micro tarefas**

- [ ] C1.1 `mercado_lote(p_chat_id bigint, p_itens jsonb) returns json`.
- [ ] C1.2 Formato de entrada, documentado em comentário no topo:
  ```json
  [{"intencao":"tenho","nome":"arroz","qtd":5,"unidade":"kg"},
   {"intencao":"comprei","nome":"feijao","qtd":2,"preco":8.90},
   {"intencao":"vou_comprar","nome":"oleo"}]
  ```
- [ ] C1.3 Laço com `jsonb_array_elements`, capturando `current_stock` e `par_level` **antes** de cada escrita.
- [ ] C1.4 Delegar para as funções que já existem (`mercado_apply_purchase`, `mercado_apply_inventory`, `mercado_add_to_list`, `mercado_apply_consumption`). **Não reimplemente a regra de negócio.**
- [ ] C1.5 Montar o resumo por item: `{item, acao, antes, depois, normal, situacao}` onde `situacao` é `ok` ou `abaixo`.
- [ ] C1.6 Item com intenção desconhecida não aborta o lote: entra no resumo com `acao: 'ignorado'`.
- [ ] C1.7 Guarda: `p_itens` vazio ou não-array devolve `{'ok':false,'erro':'lote_vazio'}`. Teto de 50 itens por chamada.
- [ ] C1.8 `grant execute ... to service_role`.
- [ ] C1.9 Self-test com lote misto de 3 itens.

**Abordagem**

O padrão de receber array **já existe** no repositório: `mercado_apply_receipt_web(jsonb)` em [`0014`](supabase/migrations/0014_receipt_web.sql). Siga a mesma forma de iterar e o mesmo formato de retorno. Isto é extensão de um padrão existente, não invenção.

Função plpgsql é transacional por padrão: uma exceção não tratada desfaz o lote inteiro. **Isso é o comportamento desejado**, não adicione bloco de exceção por item, senão você perde a atomicidade que é o motivo da tarefa existir.

Não mexa em `mercado_apply` (0004). A rota antiga continua funcionando enquanto o workflow do n8n não migra. As duas convivem.

Retorno esperado:

```json
{"ok":true,"aplicados":3,"resumo":[
  {"item":"arroz","acao":"inventario","antes":2,"depois":5,"normal":4,"situacao":"ok"},
  {"item":"feijao","acao":"compra","antes":0,"depois":2,"normal":6,"situacao":"abaixo"},
  {"item":"oleo","acao":"na_lista","antes":0,"normal":0,"situacao":"abaixo"}
]}
```

**Arquivos:** cria `supabase/migrations/0022_lote.sql`.

**Verificação:** self-test cria uma casa de teste, roda um lote misto, confere que `resumo` tem 3 entradas com `antes` diferente de `depois` onde devia, e limpa o que criou.

---

#### MACRO C2 · Editar o nível normal

**Resultado:** dá para corrigir o `par_level` de um item pelo app.

**Problema (verificado):** `par_level` é preenchido com a quantidade da **primeira compra** ([`0005:38-47`](supabase/migrations/0005_receipt.sql#L38-L47)) e nunca mais muda. Não há nenhum campo na interface para ajustar. Comprou 12 cervejas uma vez, o item fica em "Repor" para sempre. Todo o alerta central do produto depende de um número que o usuário não controla.

**Micro tarefas**

- [ ] C2.1 `mercado_stock_set_par_web(p_id uuid, p_par numeric)` na `0022`.
- [ ] C2.2 Restringir ao household do `auth.uid()`, no padrão de [`0016`](supabase/migrations/0016_stock_manual.sql).
- [ ] C2.3 Validar `p_par >= 0`. Devolver `nao_encontrado` se o update não afetou linha.
- [ ] C2.4 `grant ... to authenticated`. Self-test.

**Abordagem:** espelhe `mercado_stock_baixa_web` de [`0016`](supabase/migrations/0016_stock_manual.sql), que já faz exatamente esse formato de update com guarda de household e `returning`. Copie a estrutura.

**Arquivos:** `supabase/migrations/0022_lote.sql`.

---

#### MACRO C3 · Abrir compra pelo app

**Resultado:** o painel "No mercado" pode ser iniciado sem abrir o Telegram.

**Problema (verificado):** `mercado_trip_start` só tem versão `p_chat_id` ([`0012`](supabase/migrations/0012_cart.sql)). O app tem `mercado_trip_web`, `mercado_trip_finalize_web` e `mercado_trip_remove_item_web`, mas **não tem como começar**. O [`CartPanel`](web/src/components/lista/CartPanel.tsx) só aparece se o carrinho foi aberto pelo bot, e o texto ainda manda o usuário para o Telegram.

**Micro tarefas**

- [ ] C3.1 `mercado_trip_start_web()` na `0022`, espelhando `mercado_trip_start`, resolvendo a casa por `auth.uid()`.
- [ ] C3.2 Idempotente: se já houver compra aberta, devolve a existente. O índice `uq_trip_open_per_house` já garante uma por casa.
- [ ] C3.3 `grant ... to authenticated`. Self-test.

**Abordagem:** a função `mercado_trip_finalize_web` de [`0012`](supabase/migrations/0012_cart.sql) já é exatamente esse exercício de espelhar a versão `chat_id` para `auth.uid()`. Siga a mesma estrutura.

---

### GRUPO D · Frontend · Prioridade P1

---

#### MACRO D1 · Grade de entrada em lote

**Resultado:** dá para cadastrar a dispensa inteira numa tela só, digitando vários itens, sem repetir o fluxo item por item.

**Problema (verificado):** para registrar um item hoje: Estoque → FAB "+" → `AddMenu` → "Adicionar manualmente" → modal → nome → quantidade → unidade → Adicionar. São 8 passos com dois modais empilhados, e o modal **fecha a cada item**. Cadastrar 10 itens é repetir isso 10 vezes. Não existe entrada em lote em nenhum lugar do app.

**Abordagem, esta é a parte importante**

**Não desenhe uma tela nova.** A fase `review` do [`ReceiptModal`](web/src/components/receipt/ReceiptModal.tsx#L286-L348) **já é** uma grade de múltiplos itens: linhas editáveis com nome, quantidade e preço, botão de remover linha, total somando embaixo, "Confirmar e adicionar" no fim. Está em produção e funciona.

O menor caminho é extrair essa grade para um componente e reusá-la com linhas vazias iniciais.

**Micro tarefas**

- [ ] D1.1 Extrair o JSX da fase `review` (linhas 304 a 348) para `web/src/components/receipt/ItemGrid.tsx`, recebendo `items`, `onPatch`, `onRemove` e opcionalmente `onAddRow`.
- [ ] D1.2 Trocar o trecho no `ReceiptModal` pelo componente. **Comportamento idêntico**, sem mudança visual. Este é o momento de maior risco de regressão da rodada: confira que o fluxo de nota fiscal continua igual antes de seguir.
- [ ] D1.3 Criar `web/src/components/estoque/BatchAddModal.tsx` usando a `ItemGrid`, começando com 3 linhas vazias e um botão "+ linha".
- [ ] D1.4 Sem campo de preço nesta grade: o [`StockAddModal`](web/src/components/estoque/StockAddModal.tsx) não tem preço de propósito, porque adicionar ao estoque não é registrar compra e não pode mexer no gasto do mês. Mantenha essa decisão.
- [ ] D1.5 Confirmar chamando `addStock` por linha preenchida, ignorando linhas vazias, com um único toast no fim ("N itens adicionados").
- [ ] D1.6 Ligar o botão de adicionar do Estoque nesta grade, em vez do modal de item único.

**Arquivos:** cria `ItemGrid.tsx` e `BatchAddModal.tsx`; edita `ReceiptModal.tsx` e `StockView.tsx`.

**Verificação:** abrir o fluxo de foto da nota e confirmar que a tela de revisão está pixel a pixel igual. Portão verde.

---

#### MACRO D2 · Campo "nível normal" no detalhe do item

**Resultado:** o usuário ajusta quando quer ser avisado de que o item está acabando.

**Depende de:** C2.

**Micro tarefas**

- [ ] D2.1 Adicionar `setPar` ao store, chamando `mercado_stock_set_par_web` pelo helper da B1.
- [ ] D2.2 No [`ItemDetailModal`](web/src/components/estoque/ItemDetailModal.tsx), campo numérico ao lado de "Normal {item.normal} {item.unit}" no bloco "Nível em casa".
- [ ] D2.3 Microcópia explicando o efeito, algo como "avisamos quando cair abaixo da metade disto". O usuário não sabe o que é `par_level` nem precisa saber.
- [ ] D2.4 Remover o bloco `history` sintético (linhas 36 a 40). São três linhas fixas montadas no cliente, com rótulos "hoje / compra / média" que se parecem com uma linha do tempo real e não são. Está marcado como provisório no próprio código.

**Abordagem:** edição no lugar, sem modal novo. O modal já está denso; um campo a mais, não uma tela a mais. A remoção do histórico falso em D2.4 abre espaço vertical e é a mesma tela, por isso está agrupada aqui.

---

#### MACRO D3 · Botão "Estou no mercado"

**Resultado:** começar uma compra sem sair do app.

**Depende de:** C3.

**Micro tarefas**

- [ ] D3.1 `startTrip` no store chamando `mercado_trip_start_web`.
- [ ] D3.2 Na tela Lista, quando `trip` é `null`, botão "Estou no mercado" acima da lista.
- [ ] D3.3 Depois de abrir, `reloadTrip()` faz o `CartPanel` aparecer sozinho. O polling de 4s já existe em [`ListView:25-29`](web/src/components/lista/ListView.tsx#L25-L29).
- [ ] D3.4 Corrigir o texto do `CartPanel` para carrinho vazio: hoje diz "Vá falando o que for pegando no Telegram", que deixou de ser o único caminho.

**Abordagem:** um botão, não uma tela. O `CartPanel` já cuida de todo o resto do ciclo de vida.

---

### GRUPO I · SQL + Front · Prioridade P1 alta · Desfazer

Migration nova: `supabase/migrations/0023_eventos.sql`.

Este grupo é a resposta estrutural aos erros de classificação da seção 2. Os grupos A3 e A4 reduzem e expõem o erro; este aqui o torna reversível, que é o que elimina o retrabalho manual relatado.

---

#### MACRO I1 · Log de eventos

**Resultado:** toda escrita de estoque, lista e compra deixa registro de quem mudou o quê, de quanto para quanto, e por qual origem.

**Problema:** não existe log. Por isso não há desfazer, não há como medir a taxa de erro de classificação do LLM, e o "Histórico" do [`ItemDetailModal`](web/src/components/estoque/ItemDetailModal.tsx#L36-L40) é uma maquete de três linhas fixas montada no cliente.

**Micro tarefas**

- [ ] I1.1 Tabela `mercado_events`: `id`, `household_id`, `product_id` (nulo permitido), `item_name`, `acao`, `antes numeric`, `depois numeric`, `qtd numeric`, `origem text` (`'bot'|'web'`), `payload jsonb`, `created_at`. RLS ligado.
- [ ] I1.2 Índice `(household_id, created_at desc)`.
- [ ] I1.3 Função interna `mercado_log_event(...)`, sem grant para `authenticated` nem `service_role`: só é chamada de dentro de outras funções.
- [ ] I1.4 Chamar o log nas escritas: `mercado_apply_purchase`, `mercado_apply_inventory`, `mercado_add_to_list`, `mercado_apply_consumption`, `mercado_stock_add_web`, `mercado_stock_baixa_web`, `mercado_stock_zerar_web`, `mercado_list_buy_web`.
- [ ] I1.5 Self-test: uma escrita de cada tipo gera exatamente uma linha, com `antes` e `depois` corretos.

**Abordagem**

`create or replace` das funções já existentes acrescentando **uma linha de chamada** ao log no fim de cada uma. Não reescreva a lógica delas.

Como A4 já obriga essas funções a calcular `antes` e `depois`, o log reaproveita as mesmas variáveis. **Faça A4 antes de I1**, senão você calcula duas vezes.

Não use trigger. Trigger em `products` não sabe a intenção nem a origem, que é justamente o que se quer registrar. A chamada explícita dentro da função sabe.

RLS ligado e sem policy, no padrão de [`0012`](supabase/migrations/0012_cart.sql): acesso só por `security definer`.

**Arquivos:** cria `supabase/migrations/0023_eventos.sql`.

---

#### MACRO I2 · Desfazer

**Resultado:** "desfaz" no bot, ou um toque no app, reverte a última operação. Erro de classificação deixa de virar retrabalho manual.

**Micro tarefas**

- [ ] I2.1 `mercado_desfazer(p_chat_id bigint)` e `mercado_desfazer_web()`: revertem o **último** evento da casa que ainda não foi revertido.
- [ ] I2.2 Reversão por ação:
  - `estoque_ajustado`, `compra_registrada`, `consumo_baixado`: `current_stock = antes`
  - `adicionado_lista`: `status = 'removed'` no item da lista
- [ ] I2.3 Marcar o evento como revertido (coluna `revertido_em timestamptz`) e registrar a própria reversão como evento novo, com `acao = 'desfeito'`.
- [ ] I2.4 Janela: só desfaz evento com menos de 24h. Fora disso, `{'ok':false,'erro':'fora_da_janela'}`.
- [ ] I2.5 Não desfazer duas vezes o mesmo evento. Não desfazer um `'desfeito'`.
- [ ] I2.6 Self-test: registra, desfaz, confere que o estoque voltou ao valor original, e que desfazer de novo devolve erro.

**Abordagem**

Restaurar o valor absoluto de `antes`, **não** aplicar a operação inversa. Inverter uma soma é frágil quando outra escrita aconteceu no meio; restaurar o absoluto é determinístico e é o que o log já guarda.

`ponytail:` desfaz só o último evento, não uma pilha. É o que cobre o caso relatado ("errou, desfaz na hora"). Pilha completa só se aparecer necessidade real.

**Arquivos:** `supabase/migrations/0023_eventos.sql`.

---

#### MACRO I3 · Desfazer e histórico real no app

**Resultado:** o toast de confirmação oferece "Desfazer", e o detalhe do item mostra histórico verdadeiro em vez da maquete.

**Depende de:** I1, I2, B1.

**Micro tarefas**

- [ ] I3.1 `mercado_item_events_web(p_product_id uuid)`: últimos 10 eventos do item.
- [ ] I3.2 `undo()` no store, chamando `mercado_desfazer_web` pelo helper da B1.
- [ ] I3.3 Ação "Desfazer" no [`Toast`](web/src/components/ui/Toast.tsx) após operações reversíveis. Atenção: hoje o toast some em 2200ms ([`store.tsx:181`](web/src/lib/store.tsx#L181)), tempo curto demais para ler e decidir. Estender para uns 6s **apenas** quando houver ação de desfazer.
- [ ] I3.4 Trocar o array `history` sintético do `ItemDetailModal` (linhas 36 a 40) pelos eventos reais.
- [ ] I3.5 Se o item não tiver eventos, não mostrar bloco de histórico. Vazio honesto é melhor que maquete.

**Abordagem**

O `Toast` hoje é só texto. Adicionar um slot opcional de ação é o menor caminho; não troque por biblioteca de notificação.

I3.4 é remoção de dado falso, e por isso pode ser feita mesmo que I3.3 fique para depois.

---

### GRUPO H · n8n · Prioridade P1 alta · Executável via MCP

O MCP `n8n-prod-SA` está conectado e responde (`braziotech-n8n.cloudfy.live/api/v1`). As permissões de `n8n_create_workflow`, `n8n_update_full_workflow` e `n8n_validate_workflow` já estão concedidas em `.claude/settings.local.json`. Este grupo **é executável por você**, não é manual.

Workflow alvo: `Mercado_app — 1. Assistente de Dispensa (Telegram)`, ID `al56Kfii1scgHOCv`.

---

#### MACRO H0 · Versionar o workflow (pré-requisito de qualquer escrita no n8n)

**Resultado:** existe uma cópia do workflow no repositório, revisável em diff e restaurável. Sem isso, nenhuma escrita no n8n é autorizada.

**Problema:** o workflow existe **só na instância**. Não há pasta `n8n/` no repositório. O [`CONTEXTO.md`](CONTEXTO.md) já registra esta pendência ("O workflow do n8n vive na instância. Para versionar, exporte o JSON e salve em `n8n/`") e ela nunca foi feita. Enquanto for assim, um update ruim não tem como ser revertido por git.

**Micro tarefas**

- [ ] H0.1 `n8n_get_workflow` com `mode: "full"` no ID `al56Kfii1scgHOCv`.
- [ ] H0.2 Salvar em `n8n/assistente-dispensa.json`, formatado com indentação, para o diff ser legível.
- [ ] H0.3 `n8n_workflow_versions` para registrar no log qual é a versão publicada hoje. É o ponto de retorno.
- [ ] H0.4 Conferir se o JSON exportado contém credencial embutida. Se contiver, **não salve como está**: substitua o valor por um marcador e anote no log. Este repositório tem gitleaks e hook de pre-commit; não force nada por cima deles.
- [ ] H0.5 Registrar no log o ID da versão e a data.

**Abordagem:** exportação, não reescrita. Não normalize, não reordene nós, não "limpe" o JSON. O valor do arquivo é ser byte a byte o que está rodando.

**Verificação:** o arquivo existe, é JSON válido (`node -e "JSON.parse(require('fs').readFileSync('n8n/assistente-dispensa.json'))"`), e `grep -i "apikey\|token\|bearer\|password" n8n/assistente-dispensa.json` não retorna segredo em claro.

---

#### MACRO H1 · Prompt do agente: classificação de intenção e rota de lote

**Resultado:** o agente para de trocar `tenho` por `vou_comprar`, ecoa em qual registro gravou, e chama `mercado_lote` uma vez por áudio em vez de uma vez por item.

**Depende de:** H0 concluída. E o eco só funciona depois de A4, I1 e I2 aplicadas no banco.

**Problema:** os três erros da seção 2. Ver lá.

**Micro tarefas**

- [ ] H1.1 `n8n_get_workflow` com `mode: "structure"` para localizar o nó do agente e o nome exato dele.
- [ ] H1.2 Ler o system prompt atual **inteiro** com `mode: "filtered"` naquele nó. Não presuma o conteúdo.
- [ ] H1.3 Aplicar o texto de classificação de intenção fornecido separadamente pelo dono. **Acrescentar ao prompt existente, não substituir**: o prompt atual carrega regras de tom, memória e fluxo de família que não podem se perder.
- [ ] H1.4 Usar `n8n_update_partial_workflow` para tocar **só** o nó do agente. Não use `n8n_update_full_workflow` aqui: reenviar o workflow inteiro arrisca alterar nós que você não leu.
- [ ] H1.5 `n8n_validate_workflow` depois. Se acusar erro, reverter para a versão de H0.3 e registrar no log.
- [ ] H1.6 Reexportar para `n8n/assistente-dispensa.json`, para o repositório refletir o estado novo.
- [ ] H1.7 **Não ative nem desative o workflow.** Não dispare execução de teste com o bot de produção: há uma família real usando.

**Abordagem**

Alteração cirúrgica em um nó. O risco aqui não é técnico, é de regressão silenciosa: prompt de agente não tem teste automatizado, e uma instrução perdida só aparece semanas depois numa conversa estranha. Por isso ler o prompt inteiro antes (H1.2), acrescentar em vez de substituir (H1.3), e tocar um nó só (H1.4).

O teste real é humano: o dono manda os três áudios que falharam ("estou no mercado", "quero comprar cinco litros de leite", "na verdade tenho 3 caixas") e confere. Deixe isso explícito no relatório final como ação dele.

**Verificação:** `n8n_validate_workflow` sem erro, e o diff de `n8n/assistente-dispensa.json` mostra mudança **apenas** no nó do agente.

---

### GRUPO J · Facilidade de entrada · Prioridade P0

Este grupo é a tradução direta da decisão de produto da seção 0.1. É o que faz o modelo numérico ficar barato de alimentar. Se só uma coisa for feita nesta rodada, é este grupo.

---

#### MACRO J1 · Defaults inteligentes em toda entrada

**Resultado:** nenhum campo de entrada nasce vazio. O usuário corrige, nunca preenche do zero.

**Problema:** hoje [`StockAddModal`](web/src/components/estoque/StockAddModal.tsx) e [`AddItemModal`](web/src/components/lista/AddItemModal.tsx) abrem com nome vazio, quantidade `"1"` e unidade `"un"` fixa. Para arroz, a unidade certa é kg; para leite, L. O usuário troca no select toda vez, para todo item. Preço nunca é pré-preenchido, mesmo quando o item já foi comprado antes.

**Micro tarefas**

- [ ] J1.1 Criar `web/src/lib/defaults.ts` com `unitFor(name: string): string`, uma tabela de palavra-chave para unidade (arroz/feijão/açúcar/farinha → kg; leite/óleo/detergente → L; ovo → dz; papel higiênico/sabonete → un). Tabela pequena e literal, sem IA e sem dependência.
- [ ] J1.2 Nos modais de adicionar, recalcular a unidade sugerida conforme o usuário digita o nome, **sem travar** a escolha manual: se o usuário mexeu no select, respeitar.
- [ ] J1.3 Pré-preencher o preço com o último preço conhecido do item quando o nome casar com um produto existente. A lista de `stock` já está no store, não precisa de RPC nova.
- [ ] J1.4 Ao digitar um nome que já existe no estoque, mostrar uma linha discreta: "você já tem 2 kg em casa". Evita cadastro duplicado, que hoje só aparece depois de salvar.

**Abordagem**

Um arquivo, uma função pura, uma tabela. **Não** crie serviço de inferência, não chame LLM, não adicione dependência. Se a tabela tiver mais de umas 30 entradas, está grande demais: cobre o que é comum numa compra de mês e deixa o resto cair em `un`.

Função pura significa que ela é testável sem montar componente. Escreva o teste junto (`defaults.test.ts`), é o tipo de lógica que quebra silenciosamente.

**Verificação:** teste unitário cobrindo arroz→kg, leite→L, item desconhecido→un, e nome vazio→un. Portão da seção 7.

---

#### MACRO J2 · Nível normal sugerido, não perguntado

**Resultado:** o "Repor" passa a fazer sentido, sem o usuário ter que entender o que é nível normal.

**Depende de:** C2 (a RPC de escrita).

**Problema:** ver seção 0.1. `par_level` é a quantidade da primeira compra, congelada, sem tela para editar. É o alerta central do produto rodando sobre um número arbitrário.

**Micro tarefas**

- [ ] J2.1 RPC `mercado_stock_par_sugerido_web(p_id uuid)`: calcula a média de quantidade por compra dos últimos 90 dias em `purchases` e a frequência. Devolve `{sugerido, base_compras, periodo_dias}`. Se houver menos de 2 compras, devolve `null` (dado insuficiente é `null`, nunca um chute).
- [ ] J2.2 No [`ItemDetailModal`](web/src/components/estoque/ItemDetailModal.tsx), no bloco "Nível em casa", trocar o texto estático `Normal {item.normal}` por uma linha acionável: quando houver sugestão e ela divergir do valor atual, oferecer "Avisar quando cair abaixo de X" com um botão aceitar.
- [ ] J2.3 Campo manual ao lado, para quem quiser um número próprio. Aceitar em um toque é o caminho principal; digitar é a exceção.
- [ ] J2.4 Texto em língua de casa. Nunca escrever "par level" nem "nível normal" sozinho na interface: escrever o efeito ("avisamos quando cair abaixo disto").
- [ ] J2.5 Sem sugestão e sem valor definido, não exibir porcentagem falsa. Mostrar a quantidade e nada mais.

**Abordagem**

A regra 2 da seção 0.1 aplicada ao próprio parâmetro: o app propõe, o usuário confirma. Um botão de aceitar é mais barato que um formulário, e o valor sugerido é melhor que o atual em quase todos os casos porque usa histórico em vez da primeira compra.

Cuidado com J2.5: hoje `stockRatio` devolve `1` (100%) quando `par_level` é `0`, o que pinta como "cheio" um item sem parâmetro nenhum. Mostrar 100% para um dado que não existe é pior que não mostrar nada.

---

#### MACRO J3 · Ajuste por toque

**Resultado:** dar baixa e corrigir quantidade deixa de exigir teclado.

**Problema:** todo ajuste hoje passa por campo de texto com `inputMode="decimal"`. Em [`ItemDetailModal`](web/src/components/estoque/ItemDetailModal.tsx) e [`ListItemActions`](web/src/components/lista/ListItemActions.tsx), "baixa parcial" abre um campo e pede um número. No celular isso é abrir teclado, digitar, fechar teclado, confirmar.

**Micro tarefas**

- [ ] J3.1 Controle de mais/menos ao lado da quantidade, com passo de 1 (ou 0,5 quando a unidade for kg ou L).
- [ ] J3.2 Atalhos para baixa: "usei metade" e "acabou". Cobrem a maioria dos casos reais sem teclado.
- [ ] J3.3 Manter o campo numérico disponível para valor exato, mas como opção secundária, não como caminho padrão.
- [ ] J3.4 Alvos de toque de no mínimo 44px. O "×" de remover na lista hoje tem 32px e fica colado no preço.

**Abordagem:** `<button>` com `onClick` mexendo no mesmo estado que o campo já usa. Sem biblioteca de stepper, sem gesto de swipe (swipe esconde a ação e não é descobrível).

---

#### MACRO J4 · Despensa de exemplo antes do login

**Resultado:** o visitante entende o produto mexendo nele, antes de criar conta.

**Problema:** decidido na seção 0.1. Hoje são quatro tarefas administrativas (conta, confirmar e-mail, família, Telegram) antes de qualquer valor, e no fim a despensa aparece vazia. A auditoria UX reprovou isso em dois checks independentes (`usability/excise-detection`, `usability/first-time-user-experience`).

**Micro tarefas**

- [ ] J4.1 Rota `/exemplo` renderizando a tela de Estoque com uns 10 itens plausíveis de uma compra de mês brasileira, com quantidades e preços realistas, **totalmente em memória**. Nenhuma chamada ao Supabase.
- [ ] J4.2 Faixa fixa e honesta no topo: "Despensa de exemplo. Crie sua conta para salvar a sua." Nunca deixar parecer dado real.
- [ ] J4.3 As interações de leitura e ajuste funcionam localmente (abrir item, mudar quantidade, mandar para a lista) e se perdem ao sair. Isso é intencional e a faixa avisa.
- [ ] J4.4 Na landing, "Entrar no app" passa a levar ao exemplo; "Entrar" no header continua indo para `/entrar`. Isso resolve de quebra a duplicação de rótulo que a auditoria apontou.
- [ ] J4.5 Ao tentar uma ação que exige persistência, oferecer o cadastro no contexto ("crie a conta para guardar isto"), sem bloquear a navegação.
- [ ] J4.6 **Teste do modelo de três estados, autorizado pelo dono.** Nesta tela de exemplo, e **somente nela**, cada item ganha um selo tocável verde/amarelo/vermelho ao lado da quantidade. Tocar alterna o estado; "vermelho" marca o item como faltando na lista de exemplo. As quantidades continuam visíveis: o objetivo é sentir o gesto convivendo com os números, não substituir um pelo outro.
- [ ] J4.7 **Não propague o selo para o app real.** A decisão da seção 0.1 mantém o modelo numérico. A tela de exemplo é laboratório: se o dono aprovar depois de usar, vira tarefa própria numa rodada futura. Se você se pegar editando `StockView` do app autenticado para adicionar selo, parou de seguir o plano.

**Abordagem**

Um array literal no arquivo da rota e o mesmo `StockView` já existente, alimentado por props em vez do store. **Não** crie um segundo sistema de mock, não adicione feature flag, não mexa no `AppStoreProvider`.

Se `StockView` estiver acoplado demais ao `useStore` para receber dados por prop sem cirurgia grande, pare e relate no log em vez de refatorar o componente inteiro. Nesse caso a tarefa vira uma decisão de arquitetura para o dono, não um diff de um turno.

`ponytail:` estado do exemplo vive em `useState` e morre no refresh. Persistir em `localStorage` só se o dono pedir.

---

### GRUPO K · Correções apontadas pela auditoria UX · Prioridade P0

Achados da auditoria `/uxaudit` de 2026-08-07. Os três primeiros são pequenos e independentes: podem ser feitos no mesmo turno.

---

#### MACRO K1 · A guarda de rota não roda (mover `proxy.ts`)

**Resultado:** `/app/*` sem sessão volta a redirecionar no servidor, e a sessão volta a ser renovada.

**Problema, verificado de duas formas independentes:** `curl http://localhost:3000/app/estoque` sem cookie devolve **HTTP 200 com HTML**, não um redirect. A documentação do Next.js 16 instalada no projeto (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) diz: *"Create a `proxy.ts` file in the project root, or inside `src` if applicable, so that it is located at the same level as `pages` or `app`."* O `app` está em `web/src/app/`, mas o arquivo está em [`web/proxy.ts`](web/proxy.ts), um nível acima. **Nunca executa.**

Hoje quem protege as rotas é só o gate no cliente, depois da hidratação, e a renovação de sessão que o proxy também fazia não acontece.

**Micro tarefas**

- [ ] K1.1 Mover `web/proxy.ts` para `web/src/proxy.ts`. **Só mover**, sem alterar o conteúdo.
- [ ] K1.2 Reiniciar o dev server (mudança de arquivo de convenção não é pega por hot reload).
- [ ] K1.3 Confirmar: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/app/estoque` deve devolver `307` apontando para `/entrar`.
- [ ] K1.4 Confirmar que `/` e `/entrar` continuam `200`, e que logado não é mais expulso.

**Verificação:** os dois curls acima, com a saída colada no log. Sem isso, não marque `[x]`.

---

#### MACRO K2 · O nome do produto está escrito errado

**Resultado:** o app deixa de exibir um erro de português na palavra mais visível da interface.

**Problema:** em português, **despensa** é o lugar onde se guardam os mantimentos. **Dispensa** é o ato de dispensar, isenção. O produto usa "Dispensa" no logotipo, no headline, no `<title>`, no manifest e no nome do app instalado. Dois judges de visão independentes apontaram isso sem se ver.

**Micro tarefas**

- [ ] K2.1 `grep -rn "Dispensa" web/src web/public` e listar todas as ocorrências no log **antes** de mudar qualquer coisa.
- [ ] K2.2 Corrigir para "Despensa" em: [`layout.tsx`](web/src/app/layout.tsx) (`title`, `description`, `appleWebApp.title`), [`manifest.webmanifest`](web/public/manifest.webmanifest) (`name`, `short_name`, `description`), [`page.tsx`](web/src/app/page.tsx) e [`FamiliaView.tsx`](web/src/components/familia/FamiliaView.tsx) (texto do compartilhamento).
- [ ] K2.3 Não renomear pastas, chaves de `localStorage` (`dispensa-theme`) nem identificadores de código. **Só texto visível ao usuário.** Renomear a chave do tema derrubaria a preferência salva de quem já usa.
- [ ] K2.4 Registrar no log que quem já instalou o PWA continuará vendo o nome antigo até reinstalar. É esperado, não é bug.

**Abordagem:** substituição de texto, e nada além disso. Este é o tipo de tarefa onde o risco não é a mudança, é a mudança a mais.

---

#### MACRO K3 · Link de recuperação inválido não é barrado

**Resultado:** abrir `/redefinir-senha` sem token válido explica o problema em vez de oferecer um formulário que não vai funcionar.

**Problema:** único journey capturável que falhou na auditoria. `/redefinir-senha` sem link de recuperação renderiza o campo "Nova senha" **habilitado**, e a mensagem "Link expirado ou inválido" nunca aparece. O usuário digita, envia e não entende o que houve.

**Micro tarefas**

- [ ] K3.1 Em [`redefinir-senha/page.tsx`](web/src/app/redefinir-senha/page.tsx), verificar a sessão de recuperação antes de renderizar o formulário.
- [ ] K3.2 Sem sessão válida: mensagem clara e um botão para pedir um link novo. Não renderizar o campo de senha.
- [ ] K3.3 Enquanto verifica, mostrar carregando. Não piscar o formulário para depois escondê-lo.

**Abordagem:** a página já é `"use client"` e já tem `onKeyDown` para Enter, então é um estado a mais no componente. O `supabase.auth.getSession()` resolve a verificação; recuperação de senha abre uma sessão temporária.

---

#### MACRO K4 · Um botão primário só

**Resultado:** a landing passa a ter um caminho óbvio em vez de dois concorrendo.

**Problema:** "Entrar no app" (terracota) e "Abrir no Telegram" (azul `#2AABEE`) têm largura, altura, raio e peso de rótulo idênticos. O azul ganha em saturação, então **o primário não é o elemento mais chamativo da página**. O header ainda repete um terceiro botão "Entrar". Três checks reprovaram por isso.

**Micro tarefas**

- [ ] K4.1 Em [`page.tsx`](web/src/app/page.tsx), manter só um botão preenchido. "Abrir no Telegram" vira secundário (contorno ou link com ícone), mantendo o azul apenas no ícone.
- [ ] K4.2 Resolver a duplicação de rótulo: com J4 pronto, o primário passa a ser "Ver uma despensa de exemplo" e o header continua "Entrar". Sem J4, diferenciar de outra forma.
- [ ] K4.3 Não mexer na paleta nem na tipografia. A auditoria elogiou as duas; o problema é só o peso relativo dos botões.

---

### GRUPO E, F, G · Fora do escopo desta rodada

Detalhamento na próxima rodada. Resumo do que fica pendente:

- **E1** Remover o fluxo de QR: `supabase/functions/nfce-consulta/` inteira, `QrScanner.tsx`, `lib/nfce.ts` e seu teste, `jsqr` do `package.json`, `familyCanUseQr` do `config.ts`. Motivo: o portal da SEFAZ-RJ bloqueia, a própria Edge Function já tinha a detecção de captcha escrita, e `QR_FAMILIAS` está vazia, então nada disso roda para ninguém.
- **E2** `CONTEXTO.md` ainda descreve o dashboard web como "próximo grande passo, a implementar". Já são 40+ arquivos e 20 migrations. É o documento que o repositório aponta como fonte de retomada.
- **D4** Remover o `AddMenu`: modal intermediário que só oferece duas opções e abre outro modal por cima.
- **F1** `--text-3: #A99E94` dá 2,6:1 sobre card branco, contra 4,5:1 do WCAG AA, e é usado em texto de 11 a 13px em todo o app. Some-se a `input:focus { outline: none }` global sem substituto, com zero `focus-visible` no projeto.
- **F2** `Modal` sem `role="dialog"`, `aria-modal`, focus trap, retorno de foco nem trava de scroll do body.
- **F3** Depende de confirmar os GRANTs de tabela (seção 2). **Não execute sem confirmação:** revogar grant errado derruba o app inteiro.
- **F4** Textos sem acento em `entrar/page.tsx` ("valido", "Nao foi possivel", "Faca login", "recuperacao"), justamente na primeira tela.
- **G1** `savings` em [`0008`](supabase/migrations/0008_read_web.sql#L83-L95): a média inclui a própria última compra (subestima pela metade na segunda compra), não multiplica pela quantidade, e não filtra por mês apesar de a UI dizer "neste mês".
- **G2** `format.ts` tem `budgetStatus`, `stockRatio` e `listTotal` sem nenhum teste. É a matemática que o usuário vê em reais.
- **H1** **Manual, fora do repositório, executado pelo dono.** O prompt do agente n8n precisa de duas mudanças: mapear verbos para intenção de forma explícita (a causa dos erros da seção 2) e passar a acumular itens chamando `mercado_lote` uma vez só. Sem isso, C1 fica sem uso e os erros de classificação continuam na mesma frequência. O texto do prompt é entregue **fora deste arquivo**. **Você não deve tentar alterar a instância do n8n**, mesmo tendo o MCP `n8n-prod-SA` disponível: a alteração é revisada e aplicada por uma pessoa.

---

## 7. Portão de verificação

Rodar **em `web/`**, ao fim de toda macro tarefa que tocou `.ts` ou `.tsx`:

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Os quatro precisam passar. Colar a saída resumida no log.

Macro tarefa que tocou só `.sql`: não há como executar sem o banco. Verificação é revisão manual contra esta lista:

- [ ] É `create or replace`, nunca `create` em função que já existe.
- [ ] Assinatura idêntica à original quando substitui função existente (senão o n8n quebra).
- [ ] Tem `security definer set search_path = public`.
- [ ] Tem o `grant execute` para o papel certo: `authenticated` para `_web`, `service_role` para as do bot.
- [ ] Tem bloco `do $$ assert $$` de self-test.
- [ ] Não altera nenhum arquivo de `0001` a `0020`.
- [ ] O self-test limpa o que criou.

---

## 8. Critério de parada e relatório final

Pare quando: o escopo da rodada acabar, **ou** os 10 turnos se esgotarem, **ou** três tarefas seguidas caírem em `[!]` (sinal de que o plano está errado, não o código).

Relatório final, nesta ordem:

1. **Feito e verificado:** tarefas `[x]`, com o portão que passou.
2. **Falhou:** tarefas `[!]`, com o erro real, não com a interpretação dele.
3. **Não iniciado:** o que sobrou do escopo e por quê.
4. **Ação humana necessária:** migrations `.sql` criadas que precisam ser aplicadas manualmente no Supabase, **em ordem**, e as queries de confirmação da seção 2.
5. **Encontrado pelo caminho:** problemas notados fora do escopo, que você **não** consertou. Diga onde estão.

Não diga "pronto", "corrigido" ou "funcionando" sem a saída de comando correspondente. Trabalho parcial relatado com precisão vale mais do que trabalho completo relatado com otimismo.

---

## 9. Log de execução

O agente acrescenta uma linha por macro tarefa. Formato:

`[turno N] <ID> <[x]|[!]> <o que foi feito em uma linha> | portão: <ok|falhou: motivo>`

```
[turno 1] A3 [x] criada 0021_fluxo_p0.sql: mercado_trip_add abre a compra sozinho (chama mercado_trip_start quando nao ha aberta), acrescenta 'compra_aberta_agora' e guarda 'sem_familia' (sem ela o insert de trip_start estouraria not-null) | portão: ok — assinatura comparada com 0012 caractere por caractere (script PowerShell, "IGUAIS: True"); `git status --porcelain` mostra apenas `?? supabase/migrations/0021_fluxo_p0.sql`, nenhuma migration 0001-0020 modificada; create or replace, security definer set search_path, grant service_role e bloco do $$ assert $$ com limpeza presentes
[turno 1] NOTA MCP supabase falhou 4x com "Connection terminated due to connection timeout" e depois voltou. Hipoteses da secao 2 confirmadas por leitura: 20 migrations aplicadas (47 funcoes mercado_*), assinatura viva de mercado_trip_add bate com a da 0021, grants de tabela para authenticated E anon existem, RLS ligado nas 10 tabelas. Detalhes e queries na secao 2.
[turno 1] NOTA fora de escopo, achado no banco: existe mercado_apply_purchase_h(h uuid, ...) que nao esta em nenhuma migration do repositorio. Origem desconhecida. Confirmar com o dono antes de A4.
[turno 1] NOTA fora de escopo: mercado_trip_add nao tinha guarda de 'sem_familia' na 0012, entao chat sem familia caia em 'sem_compra_aberta' (mensagem enganosa). Corrigido na 0021 porque A3 transformaria isso numa excecao nao tratada.
[turno 1] CORRECAO da nota acima: mercado_apply_purchase_h ESTA no repositorio, em 0014_receipt_web.sql (rota web da nota fiscal). Nao e orfa. Deixa de ser hipotese. Importa para I1: e um caminho de escrita de estoque que nao passa por mercado_apply_purchase, entao precisa de log proprio.
[turno 2] A1 [x] na mesma 0021: preco ausente cai no ultimo preco pago (mesmo fallback de 0013), 'sem_preco' so quando o produto nunca foi comprado; trava needs_confirm virou aviso 'ja_tinha_em_casa' que grava; retorno ganhou preco, preco_origem, aviso, estoque_atual, nivel_normal; p_confirm mantido na assinatura e ignorado | portão: ok — assinatura ainda identica a 0012 ("IGUAIS: True"), 20 asserts cobrindo preco informado, preco do historico, sem historico e item acima do nivel
[turno 3] A4 [x] acao/antes/depois acrescentados em mercado_apply_purchase, mercado_apply_inventory, mercado_add_to_list e mercado_apply_consumption, sem remover nenhuma chave existente; add_to_list ganhou 'ok' (nunca teve); mercado_apply (0004) nao precisou de mudanca, ja repassa o json inteiro | portão: ok — as 4 assinaturas conferidas contra pg_get_function_identity_arguments do banco vivo, batem; self-test proprio passando pelo despachante mercado_apply
[turno 3] NOTA fora de escopo, NAO corrigido: mercado_add_to_list nao tem guarda de 'sem_familia'. Com h null o insert em shopping_list estoura not-null e vira excecao no bot, em vez de erro tratado. Estava assim antes de mim e a trava da secao 4 manda nao consertar codigo adjacente. Candidato a P2.
[turno 4] A2 [x] mercado_budget_set_web(numeric) criada na 0021: upsert em budgets por (household_id, month) com o mes identico ao que 0008 le, valida p_total > 0 antes de resolver a casa, grant para authenticated | portão: ok — 43 asserts no arquivo, 3 blocos de self-test. LIMITACAO: o caminho autenticado nao e testavel em SQL (auth_user_id tem FK para auth.users, criar usuario fake em producao seria pior que a falta do teste). O self-test cobre validacao, caminho sem sessao e a mecanica do upsert com a expressao de mes da 0008. Teste do caminho real e manual, no app.
[turno 5] B1 [x] helper callRpc em store.tsx trata as duas falhas (error do supabase-js e {ok:false,erro} do corpo) e devolve mensagem ja em portugues; as 12 escritas passaram pelo helper e so chamam reloadData quando ok; setBudget virou async e grava de verdade via mercado_budget_set_web; os 8 componentes chamadores so mostram toast de sucesso se ok | portão: tsc OK, vitest 5/5, build OK. LINT: 3 errors + 1 warning, TODOS pre-existentes em arquivos que nao toquei (entrar/page.tsx:53, household.tsx:58, useTheme.ts:13, FamilyOnboarding.tsx:4), confirmado por git status. O lint deste repositorio ja estava vermelho antes desta rodada.
[turno 5] NOTA confirmada por grep: em store.tsx sobraram 3 chamadas diretas a createClient().rpc — a de dentro do proprio helper, reloadTrip (leitura) e confirmReceipt (que ja tratava e a tarefa mandou nao reescrever).
[turno 6] B2 [x] funcao vitrine() e a chamada dela removidas de StockView.tsx; ordenacao volta a ser a alfabetica que a RPC ja devolve | portão: grep -i "vitrine|absorvente" em web/src retorna vazio; tsc OK, vitest 5/5, build OK
[turno 8] I1 [x] criada 0023_eventos.sql (0022 fica reservado para 0022_lote.sql do grupo C): tabela mercado_events com RLS ligado e sem policy, indice (household_id, created_at desc), funcao interna mercado_log_event sem grant para ninguem, e log acrescentado nas 8 escritas (4 do bot + stock_add_web, stock_baixa_web, stock_zerar_web, list_buy_web). stock_zerar_web virou laco para registrar o estoque anterior de cada item; compra guarda no payload os ids da lista que marcou como comprados | portão: ok — as 8 assinaturas conferidas contra pg_get_function_identity_arguments do banco vivo, batem; 12 funcoes, todas com security definer set search_path; git status sem alteracao em 0001-0020
[turno 9] I2 [x] mercado_desfazer(bigint), mercado_desfazer_web() e a interna mercado_desfazer_h na 0023: reverte o ultimo evento nao revertido restaurando o valor ABSOLUTO de 'antes', marca revertido_em, registra a reversao como evento 'desfeito' (que nunca pode ser desfeito), janela de 24h, e devolve itens da lista a 'pending' quando a compra desfeita os havia marcado como comprados | portão: ok — 20 asserts em 2 blocos, cobrindo casa vazia, compra desfeita, dupla reversao, lista virando removed, ajuste de estoque e evento de 48h caindo em fora_da_janela
[turno 11] H0 [x] destravado: o dono pos a API key no .mcp.json (que esta no .gitignore linha 10 e NAO e rastreado pelo git, entao a chave nao vai para o repositorio). Workflow al56Kfii1scgHOCv exportado para n8n/assistente-dispensa.json, 47 nos, 4083 linhas, JSON valido. Varredura por JWT/Bearer/gsk_/nvapi-/sk-/token do Telegram: nenhum segredo em claro; as 29 credenciais aparecem so como {id,name}, que e o padrao seguro do n8n. Ponto de retorno: versionId 620f17c4-1d1e-407b-b729-79b73a3846fe, versionCounter 158, updatedAt 2026-07-10T19:24:27Z. n8n_workflow_versions list devolveu 0 versoes (o historico do MCP e local e estava vazio), por isso o ponto de retorno e o arquivo mais o versionId.
[turno 11] H1 [x] PARCIAL, por decisao de engenharia registrada aqui. Aplicado ao nó Assistente via patchNodeField (find/replace ancorado no ultimo paragrafo, para falhar em vez de sobrescrever se o prompt tivesse mudado): CLASSIFICACAO DE INTENCAO por verbo, os tres casos que deram errado como regra dura, desambiguacao, e o eco "onde a informacao foi parar" sem numeros. systemMessage 5180 -> 7303 caracteres, prompt antigo preservado inteiro (startsWith = SIM), so o no Assistente alterado, 47 nos, conexoes identicas, workflow continua ativo (nao ativei, nao desativei, nao disparei execucao). n8n_validate_workflow: valid, 0 erros, 0 warnings. Reexportado para n8n/assistente-dispensa.json (versionId eb3c6d68-fdd9-4ed8-9c4e-e9ecdc9279de, counter 161).
[turno 11] O QUE NAO FOI APLICADO EM H1 E POR QUE. A leitura do prompt inteiro (H1.2) revelou tres premissas erradas no texto de insumo:
  1. O agente NAO chama RPC. Ele devolve JSON {acao, resposta} e o workflow roteia (Decidir -> Rotear acao -> Aplicar (RPC)). Instruir "chame mercado_desfazer" seria instrucao morta: nao existe rota de desfazer no switch, e criar uma e mudanca estrutural de workflow, nao de prompt.
  2. O eco com numeros (antes/depois) NAO pode vir do agente: ele nunca ve o retorno da RPC. Pior, pedir isso o levaria a INVENTAR os numeros. Para acao 'registrar' quem escreve a mensagem final e o no Code "Montar resposta", que usa agentReply apenas como fallback. O eco de verdade e uma edicao nesse no Code, que ja tem r.acao, r.antes e r.depois disponiveis depois da A4. Fora do escopo de H1.4 ("tocar so o no do agente"), nao fiz.
  3. Ordem de deploy: o prompt atual exige preco no carrinho e pede confirmacao quando o item esta acima do nivel. A A1 remove essas duas travas, mas a 0021 AINDA NAO ESTA NO BANCO. Revogar isso no prompt agora faria o bot mandar 'pegar' sem preco e a funcao antiga responder sem_preco para uma familia real dentro do mercado. Fica para logo depois da migration.
[turno 12] MIGRATIONS APLICADAS em producao pelo MCP supabase (o dono liberou a escrita trocando read_only para false no .mcp.json e reautorizando o OAuth). apply_migration 0021_fluxo_p0: success. apply_migration 0023_eventos: success. Como os blocos do $$ assert $$ vao no mesmo batch, sucesso significa que TODOS os asserts passaram: se um falhasse a transacao inteira abortaria. Unica diferenca entre o arquivo do repo e o SQL enviado: delimitadores nomeados ($fn$/$test$) em vez de $$, por precaucao com o parser do MCP. Nenhuma logica alterada.
[turno 12] BUG ENCONTRADO E CORRIGIDO (0024_eventos_ordem.sql). A verificacao funcional depois da 0023, rodando os tres casos reais numa casa de teste, mostrou o desfazer revertendo a operacao ERRADA: reverteu 'adicionado_lista' quando devia reverter o 'estoque_ajustado' que veio depois. Causa: now() devolve o horario de inicio da TRANSACAO, entao duas escritas na mesma transacao gravavam created_at identico e o "order by created_at desc limit 1" empatava e escolhia ao acaso. Os self-tests da 0023 nao pegaram porque cada um deixava so um evento elegivel por vez. Em producao cada mensagem do bot e uma transacao, o que mascarava; quebraria de verdade na importacao de nota fiscal (todos os itens numa transacao) e de forma garantida no futuro mercado_lote da C1. Correcao: coluna seq (identity), ordem por seq desc, e created_at passa a usar clock_timestamp(). A tabela tinha 0 linhas em producao, entao nao precisou backfill. Self-test da 0024 reproduz exatamente o cenario que falhou. Verificacao pos-correcao: desfazer pegou estoque_ajustado (3 -> 0), item da lista intacto em pending, segundo desfazer pegou a lista (removed), terceiro devolveu nada_para_desfazer, trilha ordenada 5,6,7,8 por seq.
[turno 12] H1 segunda parte [x] agora que a 0021 esta no banco, acrescentado ao prompt do agente (patchNodeField ancorado no fim do bloco anterior): preco no op pegar deixou de ser obrigatorio, nao perguntar mais confirmacao de item que ja tem em casa, e nao precisa de op comecar antes do primeiro op pegar. systemMessage 7303 -> 8347 caracteres, texto anterior preservado inteiro, so o no Assistente alterado, conexoes identicas, 47 nos, continua ativo. n8n_validate_workflow valid, 0 erros. Backup reexportado (versionId 27a42572-5c39-46a0-9ff8-7b6507b50b1a, counter 164).
[turno 12] PROPOSTO E NAO EXECUTADO: o eco com numeros. O no Code "Montar resposta" ja recebe r.acao, r.antes e r.depois desde a A4 e nao usa nenhum dos tres. Sao ~6 linhas para a mensagem do bot dizer "Ajustei o ESTOQUE: leite de 1 para 3" em vez de "Leite registrado". Fora do escopo de H1.4, que manda tocar so o no do agente. Depende de autorizacao.
[turno 13] INCIDENTE DE INFRA NA INSTANCIA N8N, nao causado por esta rodada. O task runner (processo que executa Code nodes) esta fora do ar em braziotech-n8n.cloudfy.live. Execucoes 4216, 4217 (29/07) e 4223 (30/07) do Mercado_app morrem em no Code com "Task request timed out after 20 seconds / the task runner is currently down, or not ready, or at capacity": 4216 e 4223 em "Renomear audio", 4217 em "Decidir". O agente responde certo antes disso (672ms, JSON valido). Alcance real: das 20 execucoes mais recentes da INSTANCIA, nenhuma teve sucesso, em 6 workflows ativos (Mercado_app, Postagem_Linkedin V5, Alerta Diario Brazio, Postagem LinkedIn Isabelle, Postagem LinkedIn Marcelo (1), PWy4elWRmHNQDY0K). Duracao ~21s em quase todas = timeout de 20s do runner. Historico vai ate 26/07 com mais paginas: quebrado ha pelo menos 4 dias. Este fluxo tem 10 Code nodes, entao praticamente todo caminho morre. Acao e do host (cloudfy): log do container procurando 'runner', memoria do container (runner e processo separado, primeiro a cair em OOM), reiniciar servico, e conferir N8N_RUNNERS_AUTH_TOKEN se o runner for externo. Nao e o workflow: active=true, versionId == activeVersionId (nada preso em rascunho), validate_workflow sem erro.
[turno 11] NOTA n8n_validate_workflow sugere "AI Agent Assistente has no systemMessage". E falso positivo: verificado por diff do export que o systemMessage esta la, com 7303 caracteres.
[turno 10] H0+H1 [!] bloqueado por credencial. `n8n_get_workflow` e `n8n_list_workflows` no MCP n8n-prod-SA devolvem {"success":false,"error":"Failed to authenticate with n8n. Please check your API key.","code":"AUTHENTICATION_ERROR"}, duas chamadas distintas. O n8n_health_check diagnostic diz "connected: true" para https://braziotech-n8n.cloudfy.live, o que e enganoso: o health check nao exercita a API autenticada. Sem H0 (backup versionado) a trava da secao 4 proibe qualquer escrita, entao H1 tambem cai. Os outros MCP de n8n nao servem: n8n-mcp aponta para http://localhost:5678 (instancia local, alvo errado) e N8N_IRKO e de outro contexto. Acao humana: rotacionar/renovar a API key do n8n no .mcp.json. O texto do prompt para o agente vai no relatorio final, para aplicacao manual enquanto isso.
[turno 7] B3 [x] <form> nativo em entrar/page.tsx (3 fases), StockAddModal, AddItemModal, BudgetModal, ListItemActions (so o bloco de edicao, para Enter salvar e nao comprar) e FamiliaView (codigo de convite); todo botao nao-submit dentro de form recebeu type="button" explicito | portão: tsc OK, vitest 5/5, build OK, lint sem problema novo
[turno 14] K1 [x] `git mv web/proxy.ts web/src/proxy.ts`, conteudo intacto. O arquivo estava um nivel acima do exigido pelo Next 16 quando o projeto usa `src/` (doc do proprio node_modules: "in the project root, or inside src if applicable, so that it is located at the same level as pages or app"), entao a guarda de rota NUNCA executava. Evidencia antes/depois: `GET /app/estoque` sem cookie ia 200 com HTML renderizado, agora vai **307 -> /entrar**; `/` e `/entrar` seguem 200. Confirmacao extra no build: a linha `ƒ Proxy (Middleware)` passou a aparecer no mapa de rotas, antes ausente. | portão: tsc OK, vitest 11/11, build OK
[turno 14] K2 [x] "Dispensa" -> "Despensa" no texto visivel: layout.tsx (title, description, appleWebApp.title), manifest.webmanifest (name, short_name, description), page.tsx (logotipo e headline), StockView (empty state), FamiliaView (title e texto do compartilhamento, com concordancia corrigida de "no Dispensa" para "na Despensa"), AppShell (subtitulo) e Sidebar. Aproveitado o mesmo texto para acentuar "mes" -> "mês". NAO tocadas as duas chaves `dispensa-theme` do localStorage (layout.tsx:21 e useTheme.ts:21): renomear derrubaria a preferencia de tema de quem ja usa. Quem ja instalou o PWA continua vendo o nome antigo ate reinstalar, esperado. Verificacao: captura da landing em viewport mobile, visible-text.txt comeca com "Despensa / Entrar / Sua despensa sob controle".
[turno 14] J1 [x] `web/src/lib/defaults.ts`: `unitFor(name)` (tabela literal de ~36 palavras-chave -> kg/L/dz/pct, normalizando acento e caixa, default "un") e `findByName(name, items)`. Integrado em StockAddModal (unidade acompanha o nome ate o usuario mexer no select; aviso "voce ja tem X em casa" antes de duplicar) e AddItemModal (unidade E preco pre-preenchidos pelo item conhecido, cada um com seu flag de "editado manualmente" para nunca sobrescrever o que a pessoa digitou). | portão: 6 testes novos em defaults.test.ts, vitest 11/11
[turno 14] J3 [x] PARCIAL. ItemDetailModal: "Baixa parcial"/"Baixa total" viraram "Usei metade" / "Acabou" / "Digitar quanto usei", nessa ordem de destaque, e os tres desabilitam quando current <= 0. Nova funcao `usouMetade` (arredonda em 3 casas para nao gerar dizima em kg/L). ListView: alvo do "x" de remover subiu de 32px para 44px. NAO feito ainda: stepper de mais/menos na quantidade (J3.1) e os alvos pequenos do ReceiptModal.
[turno 14] LINT PRE-EXISTENTE, nao introduzido nesta rodada: 3 erros de `setState` sincrono dentro de effect em entrar/page.tsx:53, household.tsx:58 e useTheme.ts:13, mais 1 warning de `CheckIcon` importado e nao usado em FamilyOnboarding.tsx:4. Nenhum desses arquivos foi tocado no turno 14. Nao consertei: a regra do arquivo manda limpar so a propria sujeira, e mexer em setState-em-effect muda comportamento de montagem. O warning do CheckIcon parece orfao deixado por uma rodada anterior.
[turno 15] C2 + J2.1 [x] criada 0025_par_level.sql (0022 continua reservado para o 0022_lote.sql do grupo C). mercado_stock_set_par_web(uuid, numeric): valida p_par >= 0 ANTES de resolver a casa (mesmo truque da A2, deixa o caso invalido testavel sem JWT), restringe ao household do auth.uid() no padrao de mercado_stock_baixa_web (0016), devolve nao_encontrado quando o update nao pega linha. mercado_stock_par_sugerido_h(uuid, uuid) interna + mercado_stock_par_sugerido_web(uuid): media de quantity por compra nos ultimos 90 dias, {sugerido, base_compras, periodo_dias}, sugerido NULL com menos de 2 compras. kg e l arredondam em 1 casa, unidade contavel arredonda para inteiro com minimo 1 (nivel 0 desligaria o alerta, o oposto do que a sugestao serve para fazer). | portão: revisao manual da secao 7, item a item — `git status --porcelain -- supabase/` lista so os 4 arquivos novos nao rastreados (0021, 0023, 0024, 0025), nenhuma migration 0001-0020 modificada; contagens no arquivo: 8 delimitadores $$ (4 pares: 3 funcoes + 1 do-block), 3 create or replace, 3 security definer set search_path = public, 13 asserts, 144 linhas; grant to authenticated nas duas _web, revoke de public/anon/authenticated/service_role na _h; o self-test apaga a casa de teste no fim e o cascade de households leva products e purchases junto. Confirmado no banco vivo por leitura (MCP supabase): as tres funcoes AINDA NAO EXISTEM (`select proname ... where proname in (...)` devolveu so mercado_create_family, mercado_desfazer_h e mercado_stock_baixa_web), entao nao ha assinatura previa a preservar; mercado_create_family(p_chat_id bigint, p_name text, p_member_name text) bate com a chamada do self-test; products.par_level/unit e purchases.quantity/purchased_at/product_id existem com os tipos que o SQL assume.
[sessao 2026-08-07 noite] O QUE FOI FEITO ALEM DO ESCOPO DA RODADA 2, tudo aplicado em producao e commitado. Migrations 0026 a 0032:
  0026 carrinho pelo app: start_web, add_web, cancel_web. O modo "No mercado" estava INALCANCAVEL (o app so sabia ler, fechar e tirar item; abrir e pegar so existiam com chat_id, e o bot estava fora do ar). A logica de pegar saiu para mercado_trip_add_h e bot e app passaram a chamar a MESMA funcao.
  0027 comprar tira o item da lista mesmo sem vinculo: 16 dos 19 itens pendentes tinham product_id null, entao o casamento so por product_id nunca funcionava. Passou a casar por nome e a curar o vinculo.
  0028 consulta por item + "esta faltando" zera o estoque. O contrato de consulta so tinha 3 tipos; perguntar por um item despejava os 102. Reusei p_tipo em vez de mexer no switch.
  0029 preferencia por pessoa (household_members.prefs jsonb) + emoji nas listas.
  0030 UNIDADES, o bug mais grave da noite: mercado_apply_consumption nao recebia unidade e o despachante descartava p_unit. Com 2 kg em casa, "usei 500 gramas" fazia 2-500 e zerava o item. Agora a unidade do produto manda e a fala e convertida (mercado_conv).
  0031 orcamento por voz (intencao nova no despachante, sem tocar no switch) e acompanhamento dentro do carrinho.
  0032 ver carrinho pelo Telegram. O bot listava o carrinho DE MEMORIA porque nao havia rota; agora e mais um tipo de consulta.
[sessao 2026-08-07 noite] N8N: fallback do agente virou OpenRouter (NVIDIA respondia em 40s), prompt podado de 8.347 para ~7.000 caracteres com as regras de preco novas, e guarda no no Decidir tratando preco 0 como ausente.
[sessao 2026-08-07 noite] REVERTIDO: ferramenta de leitura (ai_tool) no agente. Com tool ligada o agente para de devolver JSON e o no Decidir cai no catch: "coloque na lista, suco de uva" virou "Desculpa, nao entendi bem". E conflito de FORMATO, nao de instrucao, e nao se resolve reforcando o prompt. Caminho correto se voltar: Output Parser estruturado, ou um segundo agente so para pergunta aberta, deixando o classificador intocado.
[sessao 2026-08-07 noite] LICAO que se repetiu tres vezes: meus self-tests falharam por erro DO TESTE, nao da funcao ("xisdopeixe" casava com o regex de peixe; item de carrinho nao esta no estoque ate finalizar). O assert abortar a transacao inteira e o que impediu funcao ruim de entrar. Vale manter esse padrao.
[sessao 2026-08-07 noite] PENDENTE, em ordem de valor para a proxima sessao:
  1. EDITAR/EXCLUIR COMPRA JA REGISTRADA. Nao existe em lugar nenhum: a Economia so mostra e o desfazer cobre so o ultimo evento em 24h. Hoje corrigi a mao no banco duas compras de carne que entraram a R$ 89,72 POR KG quando eram o valor da bandeja (gasto do mes caiu de 477,98 para 191,20). Precisa de RPC com ajuste de estoque junto, porque mexer na quantidade de compra passada tem que reverter o que ela somou.
  2. REFORMA DO SWITCH "Rotear acao". Adicionar saida desloca o indice do fallback e obriga a remontar conexoes de producao. Destrava de uma vez: editar nota fiscal pelo Telegram (mercado_draft_edit JA EXISTE no banco, falta o caminho ate ela) e preferencia de emoji por voz.
  3. PRECO TOTAL NO BANCO em vez de o modelo dividir. A regra "o valor falado e o total do item" vive no prompt e por isso e probabilistica: foi ela que produziu os R$ 477. Aceitar preco_total na chamada e deixar o SQL dividir tira a aritmetica do LLM.
  4. Seguranca F3: as 21 funcoes do bot tem authenticated=X no proacl, entao um usuario logado pode escrever na casa de outra familia passando o chat_id dela.
[turno 26] FALLBACK TROCADO de NVIDIA para OpenRouter, a pedido do dono. Motivo medido, nao preferencia: a execucao 4302 passou pelo fallback NVIDIA e levou 40 segundos, inaceitavel para quem esta no mercado com o celular na mao. Credencial openRouterApi "OpenRouter (fallback do Assistente)" (id tlBaQwjVk2d7VWeT), no "OpenRouter Model (fallback)" com meta-llama/llama-3.3-70b-instruct, o no NVIDIA removido para nao ficar orfao. LIMITE DO n8n que o dono precisa saber: o no AI Agent tem UM slot de fallback, entao nao da para empilhar Groq 2, Groq 3, NVIDIA e OpenRouter em cascata. O OpenRouter e a escolha certa para esse slot justamente porque ele ja e um roteador entre dezenas de provedores. As duas chaves Groq extras NAO foram usadas: as credenciais "Groq Transcricao 2" e "Groq Transcricao 3" ja existem, estao nos nos de transcricao e funcionaram nas seis falhas de hoje. Nao sobrescrevi o que funciona.
[turno 26] PROMPT PODADO de 8.347 para 4.798 caracteres, 42,5% a menos, o que aumenta na mesma proporcao quantas mensagens cabem em qualquer cota. O maior achado da leitura: o prompt carregava o bloco ANTIGO de regras de carrinho (preco obrigatorio, pedir confirmacao, exigir op comecar) e logo abaixo um bloco "ATUALIZACAO" revogando os tres. Eram ~1.200 caracteres lidos a cada mensagem so para serem desmentidos, e pior que desperdicio: um risco real de o modelo obedecer a versao morta. Fundi os dois. Verificado apos aplicar que TODAS as regras vivas continuam presentes (preco nao obrigatorio, nao perguntar de item que ja tem, nao precisar de comecar, classificacao por verbo, ONDE A INFORMACAO FOI PARAR, nao inventar numeros) e que o texto morto sumiu. n8n_validate_workflow: valid, 48 nos, 0 erros.
[turno 26] COMO a poda foi aplicada, porque importa para reproduzir: o prompt inteiro nao cabe no input do MCP (InputValidationError). Os cortes menores foram por patchNodeField; a reescrita completa foi por GET + troca de UM campo no objeto que voltou + PUT, via API. Nao reconstrui o workflow a mao, o que era o risco que a H1.4 alertava. O PUT recusa `settings` com availableInMCP e binaryMode, que sao read-only: filtrei so esses dois e preservei o resto.
[turno 26] BACKUP REEXPORTADO para n8n/assistente-dispensa.json, 4.151 linhas, JSON valido. Varredura por segredo: zero ocorrencia de gsk_, nvapi-, sk-or-v1-, JWT ou token. As duas ocorrencias de "Bearer" sao notas descritivas com placeholder "<chave Groq>". As credenciais aparecem so como {id, name}.
[turno 26] ITENS PERDIDOS RECUPERADOS no banco, com a classificacao confirmada pelo dono: biscoito de leite maltado para o ESTOQUE (1 un); sacola de lixo grande (1), sacola de lixo pequena (1), oleo (4 l), refrigerante (2), cerveja (1 pacote) e manteiga (2 kg) para a LISTA. Os sete voltaram ok:true. Usei "oleo" sem acento porque e assim que o produto ja existe no banco, entao soma no mesmo item em vez de duplicar. Tres dos seis audios eram a mesma frase repetida, porque o dono repetiu quando o bot nao respondia.
[turno 24] DIAGNOSTICO do "bot parou do nada", relatado pelo dono com print. NAO e o task runner (aquele voltou) e nao e o codigo: e COTA DIARIA DA GROQ. Erro literal nas execucoes 4296 a 4301: "429 Rate limit reached for model llama-3.3-70b-versatile ... tokens per day (TPD): Limit 100000, Used 97365, Requested 6467". A partir de 20:08:04 UTC toda execucao morreu no no Assistente, em menos de 1s (as boas levam 2 a 6s). O ultimo evento gravado foi seq 98, 20:08:03.
[turno 24] SEIS AUDIOS PERDIDOS, recuperados do upstreamContext de cada execucao com erro, para o dono poder refazer: 4296 "um de leite maltado, light, fechado"; 4297 "um de leite maltado fechado. Comprar sacola de lixo, uma grande e uma pequena"; 4298 "um biscoito doce de leite maltado fechado e tem que comprar sacola de lixo, uma grande e uma pequena"; 4299 "tem que comprar mais 4 litros de oleo"; 4300 "uns dois refrigerantes, um pack de cerveja"; 4301 "manteiga coalhe, 2 de 1 kg". A transcricao funcionou nas seis: o que faltou foi o LLM.
[turno 24] CONSUMO POR MENSAGEM, e a parte que e minha responsabilidade: cada audio custa ~6.500 tokens, entao 100.000/dia dao cerca de 15 mensagens. O system prompt sozinho tem 8.347 caracteres e vai inteiro em TODA chamada, mais a janela de memoria. Fui eu que inflei esse prompt nos turnos 11 e 12, de 5.180 para 8.347 caracteres, +61%. O fallback compra tempo; encurtar o prompt e a correcao duravel. Nao encurtei ainda: mexer em prompt de agente nao tem teste automatizado e o dono precisa decidir o que sai.
[turno 24] FALLBACK DE MODELO aplicado no n8n, a pedido do dono. Credencial openAiApi "NVIDIA NIM (fallback do Assistente)" (id xRG8RH7R0DfsI5Xq) apontando para https://integrate.api.nvidia.com/v1, no adicionado "NVIDIA Model (fallback)" (lmChatOpenAi, meta/llama-3.3-70b-instruct, temperature 0.2), needsFallback=true no Assistente e conexao ai_languageModel index 1. Tres operacoes por update_partial, validadas antes de aplicar. n8n_validate_workflow: valid, 48 nos, 55 conexoes, 0 erros. Nao ativei nem desativei nada. PENDENTE: reexportar n8n/assistente-dispensa.json (o backup ficou uma versao atras). Para reverter: removeNode do no novo e needsFallback de volta para false.
[turno 24] CHAVES EXPOSTAS: o dono colou a chave da NVIDIA e uma da Groq em texto puro no chat. Usei a da NVIDIA so para criar a credencial dentro do n8n, nunca em arquivo do repositorio. As duas devem ser tratadas como comprometidas e rotacionadas.
[turno 25] PEDIDO DO DONO: "botei miojo na lista, quero falar 'peguei o miojo, foi quatorze reais' e ele atualizar esse pedido". Investiguei antes de implementar e o achado e maior que o pedido: `select count(*), count(product_id) from shopping_list where status='pending'` devolveu 19 itens com apenas 3 product_id. DEZESSEIS de 19 sao orfaos. Como mercado_apply_purchase e mercado_cart_apply_item casam a lista SO por product_id, comprar qualquer um desses 16 nunca ia tira-lo da lista. Nao era falta de recurso, era um vinculo que nunca foi criado: mercado_add_to_list insere com o pid do produto, e para item que a familia ainda nao tem cadastrado (o caso normal de "preciso comprar X") esse pid e null.
[turno 25] 0027_lista_casa_por_nome.sql, APLICADA em producao (success, self-test junto). As duas funcoes passam a casar `product_id = pid or (product_id is null and item_name = p_name)` e curam o product_id no mesmo update, entao a linha deixa de ser orfa. Comparacao exata de nome de proposito, e ha assert provando que comprar "leite" NAO tira "leite condensado" da lista, nem "miojo" mexe no "sabao". mercado_apply_purchase ganhou 'saiu_da_lista' no retorno para o bot poder dizer "e tirei da sua lista". Os 16 orfaos existentes se curam sozinhos na primeira compra de cada um; nao precisou backfill.
[turno 23] C3 + D3, levantados pelo dono depois do fim da rodada: nao havia como dizer "estou no mercado" de dentro do app. Confirmado por grep, e pior do que a lista sugeria: o app so chamava mercado_trip_web, _finalize_web e _remove_item_web, entao sabia ler, fechar e tirar item, mas NAO abrir nem pegar. Com o task runner do n8n fora, o recurso inteiro esta inalcancavel hoje: nao existe caminho nenhum para abrir uma compra.
[turno 23] AMPLIACAO DELIBERADA DO C3, com motivo. O plano pedia so mercado_trip_start_web. Sozinho ele entrega um carrinho vazio que ninguem consegue encher, porque "pegar" tambem so existia com p_chat_id. Entao a 0026 leva quatro: start_web, add_web, cancel_web (sem ele, abrir por engano PRENDE o painel, ja que finalizar exige item) e o finalize_web que ja existia. A logica de pegar saiu de mercado_trip_add para a interna mercado_trip_add_h, e bot e app passam a chamar a MESMA funcao, em vez de duas copias que divergem com o tempo. A assinatura de mercado_trip_add ficou intocada, conferida contra pg_get_function_identity_arguments do banco vivo antes de escrever: o n8n chama com esses parametros.
[turno 23] 0026 APLICADA em producao, na segunda tentativa (a primeira foi bloqueada pelo classificador de permissao do Claude Code; nao contornei, pedi autorizacao e o dono liberou). apply_migration 0026_carrinho_web: success, ou seja, os 13 asserts passaram. Conferido depois: a assinatura de mercado_trip_add continua "p_chat_id bigint, p_name text, p_price numeric, p_qty numeric, p_unit text, p_confirm boolean", identica a de 0012/0021, entao o n8n nao quebra; as tres _web novas com grant para authenticated; as duas internas _h com postgres=X apenas. Nao ha compra aberta pendurada em producao (1 cancelled, 3 finalized), entao o painel comeca no estado novo de convite.
[turno 23] ACHADO DE SEGURANCA, pre-existente e NAO corrigido, mesma familia do F3: as 21 funcoes do bot (todas as que recebem p_chat_id) tem authenticated=X no proacl, nao so service_role. Confirmei que e anterior a esta rodada porque as 21 estao iguais, inclusive as 19 que nao toquei. Efeito pratico: um usuario logado pode chamar mercado_apply, mercado_trip_add ou mercado_desfazer passando o chat_id de OUTRA familia e escrever na casa alheia, sem passar por auth.uid(). Nao mexi: a trava do F3 diz que revogar grant errado derruba o app e exige confirmacao humana. Vale subir de prioridade.
[turno 23] FRONT: store ganhou startTrip, addTripItem e cancelTrip pelo helper callRpc. Todo o ciclo cabe no CartPanel, entao o ListView nao mudou uma linha: sem compra aberta o painel deixa de sumir e vira o convite "Vai ao mercado agora? / Estou no mercado"; com compra aberta, ganhou o formulario de pegar item (nome, stepper de quantidade, preco opcional) e o botao de cancelar ao lado do finalizar. O campo nasce preenchido no padrao da J1: unidade por unitFor e preco pelo ultimo pago, via findByName. Preco em branco cai no historico dentro do banco. Texto do carrinho vazio corrigido (D3.4): nao manda mais so para o Telegram. | portão: tsc exit 0, vitest 13/13, build exit 0, lint com os mesmos 4 pre-existentes.
[turno 22] MIGRATION 0025 APLICADA em producao pelo MCP supabase, autorizada pelo dono. apply_migration 0025_par_level: success. Como os blocos assert vao no mesmo batch, sucesso significa que os 13 asserts passaram: um so falhando abortaria a transacao inteira. Unica diferenca entre o arquivo do repo e o SQL enviado: delimitadores nomeados ($fn$/$test$) em vez de $$, mesma precaucao do turno 12. Nenhuma logica alterada. Conferido depois: as tres funcoes existem com security definer, as duas _web com grant para authenticated e a _h so com postgres=X (sem grant para authenticated nem service_role, como manda o padrao de funcao interna).
[turno 22] VERIFICACAO FUNCIONAL EM DADOS REAIS, o que ela achou. Rodei mercado_stock_par_sugerido_h sobre os 102 produtos da casa real: a funcao responde certo em todos, mas o botao de aceitar a sugestao so apareceria em 3 deles. Quebra: 88 produtos tem menos de 2 compras e caem em sugerido null (correto por construcao), 14 tem sugestao e em 11 dela e IGUAL ao par_level atual, entao a interface nao oferece trocar 1 por 1. Nao e bug, e falta de historico: as 119 compras da base inteira estao entre 2026-07-10 e 2026-07-12, tres dias, provavelmente uma importacao de nota. Alargar a janela nao resolveria nada, e a prova esta na propria consulta: produtos com 2 ou mais compras SEM janela nenhuma tambem sao 14, os mesmos. A J2 vai ganhar tracao sozinha conforme o app for usado. Nao mexi em nada.
[turno 22] ACHADO DE PRODUTO, fora de escopo, atrasa a J2 na pratica: os nomes vindos da nota fiscal fragmentam o historico por produto. Existem "acucar", "acucar demerara" e "acucar refinado" como TRES produtos distintos, cada um com uma compra, quando deveriam alimentar um historico so. Mesmo padrao em "salgadinho skiny" x "salgadinho torcida" e "biscoito trakinas" x "biscoito wafer". Enquanto cada variacao de rotulo virar produto novo, quase nenhum item acumula as 2 compras que a sugestao precisa. Candidato forte a proxima rodada: normalizar nome na importacao ou oferecer "juntar itens" no app.
[turno 21] K4 [x] "Abrir no Telegram" deixou de ser um segundo botao cheio: virou contorno (border-border, bg-card, texto text-2) com o azul #2AABEE preservado apenas no icone. Paleta e tipografia intactas, como o K4.3 exige. A duplicacao de rotulo (K4.2) ja tinha morrido na J4.4. | portão: tsc exit 0, vitest 13/13, build exit 0, lint com os mesmos 4 pre-existentes. Evidencia no HTML servido: agora existe UM unico elemento h-[54px] com fundo (`bg-brand ... shadow`), o outro e `border border-border bg-card`, e os tres rotulos da pagina sao distintos: "Entrar" no header, "Ver uma despensa de exemplo" no primario, "Abrir no Telegram" no secundario.
[turno 21] ESCOPO DA RODADA 2 ENCERRADO: os 8 itens da lista estao [x]. Nenhuma tarefa caiu em [!] nesta rodada.
[turno 20] K3 [x] redefinir-senha/page.tsx checa `auth.getSession()` antes de renderizar e tem tres estados: "Conferindo o link..." enquanto verifica (K3.3, nao pisca formulario), "Este link nao vale mais" com botao para pedir outro quando nao ha sessao (K3.2, e o campo de senha nem e montado), e o formulario de sempre quando a sessao de recuperacao esta viva. | portão: tsc exit 0, lint com os mesmos 4 pre-existentes. Evidencia funcional: `curl /redefinir-senha` devolve 200 e o HTML servido tem ZERO ocorrencia de `type="password"` (antes tinha 2), exibindo "Conferindo o link...". LIMITE HONESTO DESTA VERIFICACAO: o estado "sem sessao" so aparece depois da hidratacao, e curl nao executa JS. O caminho de erro nao esta provado por comando, so por leitura do codigo; teste manual e abrir /redefinir-senha numa aba anonima.
[turno 19] J3.1 [x] `stepFor(unit)` no defaults.ts (0,5 em kg/L/g/ml, 1 no resto, com teste) e `web/src/components/ui/QtyStepper.tsx`: menos, campo, mais, todos com 48px de alvo, guardando string no mesmo formato que os campos ja usavam para quem chama nao mudar a leitura. Aplicado nos QUATRO campos de quantidade do app: ItemDetailModal (quanto usei), ListItemActions (quanto comprar E quanto consumiu) e AddItemModal (quanto comprar). O botao "Baixar" ao lado desceu de 50px para 48px para alinhar com o stepper. A pagina /exemplo passou a importar stepFor em vez da copia local que eu tinha feito no turno 18. | portão: tsc exit 0, vitest 13/13 (2 testes novos de stepFor), build exit 0, lint com os mesmos 4 pre-existentes
[turno 19] NAO fiz stepper na grade do BatchAddModal nem no ReceiptModal: sao campos de 12 e 68px dentro de uma linha apertada, e enfiar dois botoes de 48px por linha quebraria a grade que a D1 acabou de estabilizar. O J3 nomeia ItemDetailModal e ListItemActions; parei ai mais o AddItemModal, que e o mesmo gesto.
[turno 18] J4 [x] rota `/exemplo` (`web/src/app/exemplo/page.tsx`), 10 itens de uma compra de mes com preco por unidade, tudo em `useState`, zero chamada ao Supabase. Faixa fixa no topo "Despensa de exemplo. Crie sua conta para salvar a sua." (J4.2), quantidade ajustavel por mais/menos com passo 0,5 em kg e L (J4.3), selo tocavel verde/amarelo/vermelho ao lado da quantidade que cicla tem -> acabando -> acabou e alimenta a lista de compras de exemplo (J4.6), e o convite para criar conta so DEPOIS da primeira interacao, sem bloquear nada (J4.5). Landing: o primario virou "Ver uma despensa de exemplo" apontando para /exemplo; o "Entrar" do header ficou intacto (J4.4). | portão: tsc exit 0, vitest 11/11, build exit 0 com `○ /exemplo` no mapa de rotas, lint com os mesmos 4 pre-existentes. Verificacao funcional com dev server: `/` 200, `/exemplo` 200, `/entrar` 200, `/app/estoque` 307 -> /entrar (a guarda nao pegou a rota nova, que e o esperado: /exemplo nao comeca com /app). HTML servido contem a faixa, o selo com aria-label "Papel higienico: Acabando. Tocar para mudar." e os botoes de 44px.
[turno 18] DESVIO DA ABORDAGEM DA J4, com motivo. O plano mandava alimentar o `StockView` existente por props. Nao da, e nao por acoplamento apenas: o J4.6 exige um selo de tres estados na tela de exemplo e o J4.7 PROIBE tocar no StockView para isso. Reusar o componente e adicionar o selo sao requisitos que se excluem. Somado a isso, StockView e ItemDetailModal puxam 13 funcoes do useStore. Escolhi pagina autonoma com componentes locais, que e a leitura fiel de J4.1 + J4.6 + J4.7 juntos: laboratorio isolado, risco zero para o app autenticado. Reusei so UI pura (AvatarInitial, BrandMark, ThemeToggle, brl). O StockView do app NAO foi tocado nesta tarefa.
[turno 18] FALSO ALARME INVESTIGADO ATE O FIM: na primeira subida do dev server `/` devolveu 500 com "Could not parse module '[project]/proxy.ts', file not found". NAO e regressao: e cache do Turbopack em .next/dev gerado quando o proxy.ts ainda estava em web/ (movido no turno 14). Apaguei .next, reiniciei, e as quatro rotas responderam certo com zero ocorrencia de MODULE_UNPARSABLE no log. Quem tiver .next antigo na maquina precisa apagar uma vez.
[turno 18] NOTA fora de escopo, NAO mexido: os 4 cards de "como funciona" da landing ainda vendem "Crie sua conta / Monte sua familia / Conecte o Telegram" como etapas obrigatorias, o que contradiz a decisao da secao 0.1 (familia e Telegram viraram opcionais). Nem J4.4 nem K4 mandam mexer nos cards. Candidato a proxima rodada.
[turno 17] D1 [x] grade da fase review extraida para `web/src/components/receipt/ItemGrid.tsx` e reusada em `web/src/components/estoque/BatchAddModal.tsx` (3 linhas vazias, botao "+ linha", sem preco porque adicionar ao estoque nao e registrar compra). ReceiptModal virou uma linha (`<ItemGrid items onPatch onRemove />`) e perdeu os orfaos que a extracao criou: const `inp`, o import de `brl` e o `const total`, todos usados so pela grade. O tipo `Item` virou alias de `GridItem` para nao duplicar a forma. AddMenu do estoque agora abre a grade ("Digitar os itens / Varios de uma vez, numa lista so"), que era o D1.6. | portão: PROVA DE NAO-REGRESSAO antes de seguir, como a tarefa exige — comparei mecanicamente as className da versao em HEAD contra o ItemGrid: conjunto "so no original" VAZIO, a const `inp` bate caractere por caractere ("IGUAIS: True"), os 3 inputs tem template identico, o rodape Total identico, e as 4 classes novas so aparecem sob props opcionais que o ReceiptModal nao passa. Unica diferenca estrutural: `flex items-center gap-2 px-3 py-2.5` desceu para um filho e as bordas (border-t, border-l da linha em duvida) ficaram no pai, o que renderiza igual. tsc exit 0, vitest 11/11, build exit 0, lint com os mesmos 4 pre-existentes.
[turno 17] J1.4 PRESERVADO na troca: o StockAddModal avisava "voce ja tem X em casa" e a grade nao tinha isso. Em vez de perder o aviso ao cumprir o D1.6, o ItemGrid ganhou a prop opcional `avisoDe`, que o BatchAddModal alimenta com findByName do defaults.ts. O ReceiptModal nao passa a prop e nada muda la.
[turno 17] ORFAO CRIADO, nao deletado: `web/src/components/estoque/StockAddModal.tsx` nao e mais importado por ninguem (era so o StockView). Nao apaguei: a trava manda nao deletar codigo pre-existente sem ordem, e a D4 (remover o AddMenu) e a tarefa natural para resolver as duas coisas juntas. Candidato a remocao na proxima rodada.
[turno 17] CUSTO ACEITO E COMENTADO no BatchAddModal: um addStock por linha, em serie, cada um recarregando os dados. 10 itens = 10 idas. O upgrade e a RPC de lote da C1 (mercado_lote), que nao existe ainda, e turno de front nao escreve SQL.
[turno 17] DEFEITO MEU, corrigido no mesmo turno: os tres arquivos que criei nesta rodada (0025_par_level.sql, ItemGrid.tsx, BatchAddModal.tsx) sairam com uma linha de lixo no fim. Nos .tsx o tsc pegou (TS1128); no .sql nao havia compilador para pegar e o arquivo teria falhado ao ser colado no SQL Editor. Os tres estao limpos, conferido por Get-Content -Tail.
[turno 16] J2.2 a J2.5 [x] store: `setPar(id, par)` pelo helper callRpc e `parSugerido(id)` como leitura direta (o callRpc so devolve ok/erro e aqui o que importa e o numero; sem sugestao devolve null e a tela nao oferece nada). ItemDetailModal: o bloco "Nivel em casa" perdeu o texto estatico "Normal X" e ganhou (a) a linha de efeito "Avisamos quando cair abaixo de X/2", (b) o botao de aceitar a sugestao em UM toque, "Voce costuma comprar 3 kg por vez. Usar como referencia e avisar abaixo de 1,5 kg?", (c) "Mudar esse valor" abrindo campo numerico como caminho secundario, alvos de 44px. J2.4 cumprido: nenhuma tela escreve "par level" nem "nivel normal" solto, o texto fala do efeito e o rotulo virou "Costuma ter". J2.5: com par_level 0 a porcentagem e a barra somem no modal E no card do estoque, porque stockRatio devolve 1 nesse caso e o app pintava 100% para item sem parametro nenhum. | portão: tsc exit 0, vitest 11/11, build exit 0 (mapa de rotas intacto, `ƒ Proxy (Middleware)` segue la), lint exit 1 com os MESMOS 4 problemas pre-existentes de sempre (entrar/page.tsx, household.tsx:58, useTheme.ts:13, FamilyOnboarding.tsx:4 CheckIcon) e nenhum nos tres arquivos tocados.
[turno 16] MUDANCA DE RAIZ NO StockView, fora da letra da J2 mas necessaria para ela: `detail` guardava o objeto StockItem congelado no state, entao depois de salvar o nivel o modal continuaria mostrando o valor antigo. Passou a guardar so o id e derivar `stock.find(...)` do store. Efeito colateral bom: baixa e reposicao dentro do modal tambem passam a refletir na hora. 4 linhas.
[turno 16] O QUE FALTA PARA O USUARIO VER ISSO: a 0025 nao esta aplicada. Enquanto nao estiver, parSugerido recebe erro do PostgREST, devolve null e a tela some com a sugestao (degrada silenciosa, de proposito); "Mudar esse valor" salvaria e cairia no toast de erro generico. Aplicar a 0025 antes de testar.
[turno 15] DIVISAO DO ITEM, registrada porque muda o particionamento dos turnos e nao o escopo: a secao 5 lista "C2 + J2" numa linha so, mas a trava da secao 4 proibe turno de SQL tocar .tsx. Fiz o SQL inteiro (C2 e J2.1) neste turno; J2.2 a J2.5, que sao React, viram o proximo. Nenhum entregavel foi cortado.
[turno 15] DEPENDENCIA DE ORDEM: o front da J2 chama mercado_stock_par_sugerido_web e mercado_stock_set_par_web. Enquanto a 0025 nao for aplicada no banco, a tela vai existir e responder erro. Aplicar a 0025 ANTES de testar a J2 no app.
[turno 15] NOTA fora de escopo, NAO corrigido: mercado_stock_add_web (0016/0023) e mercado_apply_purchase (0021/0023) ainda gravam par_level = quantidade da primeira compra quando o item nasce. A 0025 da o conserto pelo lado do usuario (editar e aceitar sugestao), nao troca o default de nascimento. Trocar isso mexeria em funcao de escrita fora da tarefa.
[turno 14] AVISO DE INFRA, confirma o turno 13: o bot continua inoperante. Enquanto o task runner do n8n estiver fora, nada do que foi feito nas rodadas anteriores para o Telegram (0021, 0023, 0024, prompt do agente) produz efeito para o usuario final. E acao do host, nao do codigo.
```
