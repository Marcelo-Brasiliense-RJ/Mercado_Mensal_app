-- Mercado_app — fluxo P0: tira do caminho os erros que dependem de o LLM acertar
-- Rode DEPOIS de 0020. Nao altera nenhuma migration anterior: tudo aqui e create or replace.
--
-- Por que existe: em uso real o agente ignorou "estou no mercado" (intencao 'comecar'),
-- e a gravacao seguinte morreu em 'sem_compra_aberta', obrigando correcao manual no app.
-- Conserto: quando o acerto do LLM for opcional, torne-o opcional de verdade. Em vez de
-- ensinar o modelo a chamar 'comecar' antes de 'pegar', fazemos 'pegar' nao precisar disso.

-- ============ A3 + A1: mercado_trip_add abre a compra sozinho e nao interrompe ============
-- Assinatura IDENTICA a de 0012 (o workflow do n8n em producao chama com esses parametros;
-- mudar a assinatura quebra o bot).
--
-- A3: nao existe mais o erro 'sem_compra_aberta' aqui, a compra e aberta na hora.
-- A1: as duas travas que geravam turno extra de conversa dentro do mercado sairam.
--   preco ausente  -> usa o ultimo preco pago pelo produto; so devolve 'sem_preco' se
--                     nunca houve compra dele. O retorno diz de onde veio ('preco_origem').
--   acima do nivel -> grava e AVISA ('aviso' = 'ja_tinha_em_casa'), em vez de recusar.
-- Numa compra de 30 itens isso corta de 60-90 turnos de conversa para 30.
--
-- p_confirm continua na assinatura mas passa a ser IGNORADO: nao ha mais o que confirmar.
-- Fica so para o n8n atual, que ainda o envia, nao quebrar. 'needs_confirm' continua no
-- retorno, sempre false, pela mesma razao: o workflow em producao le essa chave.
create or replace function mercado_trip_add(
  p_chat_id bigint, p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un', p_confirm boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; tid uuid; pid uuid; estoque numeric; nivel numeric; above boolean; total numeric;
        abriu boolean := false; preco numeric; origem text;
begin
  h := mercado_resolve_household(p_chat_id);
  -- Guarda nova: sem casa resolvida, mercado_trip_start estouraria not-null no insert.
  -- Antes o fluxo caia em 'sem_compra_aberta' por acidente; agora o erro e o certo.
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    -- mercado_trip_start (0012) ja e idempotente e o indice uq_trip_open_per_house garante
    -- uma compra aberta por casa: chamar daqui e seguro por construcao. Nao replicar a logica.
    tid := (mercado_trip_start(p_chat_id) ->> 'trip_id')::uuid;
    abriu := true;
  end if;

  p_name := lower(trim(p_name));
  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  above := pid is not null and nivel is not null and nivel > 0
           and estoque is not null and estoque >= nivel;

  -- A1: preco opcional. Mesmo fallback que mercado_add_to_list (0013) ja usa, nao invente outro.
  if p_price is not null then
    preco  := p_price;
    origem := 'informado';
  else
    select unit_price into preco from purchases
      where product_id = pid order by purchased_at desc limit 1;
    origem := 'historico';
    -- Produto que nunca foi comprado nao tem de onde tirar preco: aqui perguntar e inevitavel.
    if preco is null then
      return json_build_object('ok', false, 'erro', 'sem_preco', 'item', p_name,
        'compra_aberta_agora', abriu);
    end if;
  end if;

  insert into trip_items (trip_id, household_id, product_id, item_name, quantity, unit, unit_price, above_par)
    values (tid, h, pid, p_name, coalesce(p_qty,1), coalesce(p_unit,'un'), preco, above);

  select coalesce(sum(quantity * unit_price), 0) into total from trip_items where trip_id = tid;
  return json_build_object('ok', true, 'needs_confirm', false, 'item', p_name,
    'above_par', above, 'total_parcial', total, 'compra_aberta_agora', abriu,
    'preco', preco, 'preco_origem', origem,
    -- aviso substitui a antiga trava needs_confirm: informa sem impedir.
    'aviso', case when above then 'ja_tinha_em_casa' else null end,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0));
end $$;

-- ============ PERMISSOES ============
-- create or replace preserva a ACL, mas repetimos para a migration ser autossuficiente.
revoke execute on function mercado_trip_add(bigint, text, numeric, numeric, text, boolean) from public, anon;
grant  execute on function mercado_trip_add(bigint, text, numeric, numeric, text, boolean) to service_role;

-- ============ A4: retorno explicito da acao, para o bot ecoar ============
-- Por que: em uso real "quero comprar 5 L de leite" foi parar no estoque e "na verdade tenho
-- 3 caixas" foi parar na lista. Nos dois casos a resposta do bot nao deixou claro ONDE gravou,
-- entao o erro so apareceu dias depois, ao abrir o app. O banco nao tem como saber se o LLM
-- classificou certo; o que ele pode fazer e relatar com precisao o que fez.
--
-- Regra desta secao: SO ACRESCENTA campos. Nenhuma chave existente foi removida ou renomeada,
-- porque o workflow do n8n em producao le 'estoque_novo', 'economia', 'ja_tem_em_casa' etc.
-- Campos novos, iguais nas quatro:
--   acao   -> estoque_ajustado | compra_registrada | adicionado_lista | consumo_baixado
--   antes  -> estoque antes da operacao
--   depois -> estoque depois (igual a 'antes' em adicionado_lista: a lista nao mexe no estoque)
--
-- mercado_apply (0004) nao precisa de mudanca: ele faz `return mercado_apply_*(...)`, ou seja,
-- repassa o json inteiro. Conferido contra a definicao viva no banco em 2026-07-27.

-- 'comprei' -> soma ao estoque
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; prev_price numeric; saved numeric; antes numeric; depois numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  -- A4: le o estoque ANTES do update. Antes so o id era lido aqui.
  select id, current_stock into pid, antes from products where household_id = h and name = p_name;
  antes := coalesce(antes, 0);

  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  select current_stock into depois from products where id = pid;
  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', depois,
    'preco_anterior', prev_price, 'economia', saved,
    'acao', 'compra_registrada', 'antes', antes, 'depois', depois);
end $$;

-- 'tenho' -> SOBRESCREVE o estoque. E a operacao que mais dana quando o LLM erra:
-- trocar 'tenho' por 'comprei' num item de estoque 1 e qtd 3 da 3 contra 4, sem aviso.
create or replace function mercado_apply_inventory(
  p_chat_id bigint, p_name text, p_qty numeric, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; est numeric; t0 timestamptz; old_rate numeric;
        dias numeric; comprado numeric; consumido numeric; nova_taxa numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, last_inventory_at, consumption_rate_month
    into pid, est, t0, old_rate from products where household_id = h and name = p_name;

  if pid is null then
    insert into products (household_id, name, unit, current_stock, last_inventory_at)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, now()) returning id into pid;
    return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty, 'taxa_recalibrada', false,
      'acao', 'estoque_ajustado', 'antes', 0, 'depois', p_qty);
  end if;

  if t0 is not null then
    dias := greatest(1, extract(epoch from (now() - t0)) / 86400);
    select coalesce(sum(quantity),0) into comprado from purchases where product_id = pid and purchased_at > t0;
    consumido := greatest(0, est + comprado - p_qty);
    nova_taxa := round(consumido / dias * 30, 3);
    old_rate := case when coalesce(old_rate,0) = 0 then nova_taxa else round(0.5*old_rate + 0.5*nova_taxa, 3) end;
  end if;

  update products set current_stock = p_qty, last_inventory_at = now(),
                      unit = coalesce(p_unit, unit),
                      consumption_rate_month = coalesce(old_rate, consumption_rate_month),
                      updated_at = now() where id = pid;

  return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty,
    'taxa_mes', (select consumption_rate_month from products where id = pid),
    'taxa_recalibrada', t0 is not null,
    'acao', 'estoque_ajustado', 'antes', coalesce(est, 0), 'depois', p_qty);
end $$;

-- 'vou_comprar' -> lista de compras. NAO toca no estoque: 'antes' e 'depois' sao iguais
-- de proposito, e e isso que deixa o erro de classificacao obvio no eco do bot.
-- ponytail: acrescentado 'ok' ao retorno, que esta funcao nunca teve (as outras tres tem).
-- E acrescimo, nao renomeacao: quem le as chaves antigas continua lendo.
create or replace function mercado_add_to_list(
  p_chat_id bigint, p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; estoque numeric; nivel numeric; ult_preco numeric; ja_tem boolean; qtd numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  select unit_price into ult_preco from purchases
    where product_id = pid order by purchased_at desc limit 1;

  ja_tem := pid is not null and estoque is not null and nivel is not null
            and nivel > 0 and estoque >= nivel;

  -- quantidade a comprar: se nao informada (<=0), calcula o que falta pro nivel normal
  if coalesce(p_qty, 0) > 0 then
    qtd := p_qty;
  elsif nivel is not null and nivel > 0 then
    qtd := greatest(1, ceil(nivel - coalesce(estoque, 0)));
  else
    qtd := 1;
  end if;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price)
    values (h, pid, p_name, qtd, coalesce(p_unit,'un'), ult_preco);

  return json_build_object('ok', true, 'item', p_name, 'ja_tem_em_casa', ja_tem,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0),
    'preco_estimado', ult_preco, 'quantidade', qtd,
    'acao', 'adicionado_lista', 'antes', coalesce(estoque,0), 'depois', coalesce(estoque,0));
end $$;

-- 'consumi' -> baixa do estoque
create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; antes numeric; depois numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));
  -- A4: le o estoque ANTES do update. Antes so o id era lido aqui.
  select id, current_stock into pid, antes from products where household_id = h and name = p_name;
  if pid is null then return json_build_object('ok', false, 'erro', 'produto_nao_encontrado', 'item', p_name); end if;
  update products set current_stock = greatest(0, current_stock - coalesce(p_qty, current_stock)), updated_at = now()
    where id = pid;
  select current_stock into depois from products where id = pid;
  return json_build_object('ok', true, 'item', p_name, 'estoque_novo', depois,
    'acao', 'consumo_baixado', 'antes', coalesce(antes,0), 'depois', depois);
end $$;

revoke execute on function
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text),
  mercado_apply_inventory(bigint, text, numeric, text),
  mercado_add_to_list(bigint, text, numeric, text),
  mercado_apply_consumption(bigint, text, numeric)
  from public, anon;
grant execute on function
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text),
  mercado_apply_inventory(bigint, text, numeric, text),
  mercado_add_to_list(bigint, text, numeric, text),
  mercado_apply_consumption(bigint, text, numeric)
  to service_role;

-- ============ A2: persistir o orcamento ============
-- Por que: nada, nem app nem bot, jamais escreveu em budgets. budget.total era sempre 0,
-- entao o card da tela Economia dizia "de R$ 0,00" e o selo "Acima em R$ X" ficava aceso
-- para sempre. O botao "Ajustar" mostrava o toast de sucesso e nao gravava nada.
--
-- O mes e date_trunc('month', current_date)::date, EXATAMENTE como a leitura de 0008 faz.
-- Divergir disso faz a escrita nao bater com a leitura, que e o jeito mais silencioso
-- de esta funcao "funcionar" e o usuario continuar vendo zero.
create or replace function mercado_budget_set_web(p_total numeric)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; mes date := date_trunc('month', current_date)::date;
begin
  -- Validacao antes de resolver a casa, de proposito: deixa o caso invalido testavel
  -- sem JWT (auth.uid() e null fora de uma requisicao autenticada).
  if p_total is null or p_total <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  -- A constraint unique (household_id, month) de 0001 ja garante uma linha por mes:
  -- upsert, nunca delete + insert.
  insert into budgets (household_id, month, amount) values (h, mes, p_total)
  on conflict (household_id, month) do update set amount = excluded.amount;

  return json_build_object('ok', true, 'total', p_total, 'mes', mes);
end $$;

revoke execute on function mercado_budget_set_web(numeric) from public, anon;
grant  execute on function mercado_budget_set_web(numeric) to authenticated;

-- ============ SELF-TEST (padrao 0007; cria casa de teste e apaga no fim) ============
do $$
declare cid bigint := 999999021; r json; tid uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0021', 'Tester');

  -- A3: sem nenhuma compra aberta, gravar deve funcionar e a compra nasce aqui.
  r := mercado_trip_add(cid, 'arroz', 5.00, 2, 'un');
  assert (r->>'ok')::boolean,                     'trip_add sem compra aberta deveria gravar';
  assert (r->>'compra_aberta_agora')::boolean,    'deveria sinalizar que abriu a compra';
  assert (r->>'total_parcial')::numeric = 10.00,  'total parcial deveria ser 2 x 5.00';

  select id into tid from shopping_trips s
    where s.household_id = (select household_id from household_members where telegram_chat_id = cid)
      and s.status = 'open';
  assert tid is not null,                                          'deveria existir uma compra aberta';
  assert (select count(*) from trip_items where trip_id = tid) = 1,'deveria haver 1 item no carrinho';

  -- Segunda chamada reaproveita a compra aberta, nao abre outra.
  r := mercado_trip_add(cid, 'feijao', 8.90, 1, 'un');
  assert (r->>'ok')::boolean,                         'segundo item deveria gravar';
  assert not (r->>'compra_aberta_agora')::boolean,    'nao deveria abrir uma segunda compra';
  assert (select count(*) from shopping_trips
          where household_id = (select household_id from household_members where telegram_chat_id = cid)
            and status = 'open') = 1, 'deveria haver exatamente uma compra aberta';

  -- A1: preco vindo do historico. A compra abaixo cria o produto com par_level = 1
  -- (0005) e estoque 1, entao o mesmo item tambem cobre o caso "acima do nivel".
  perform mercado_apply_purchase(cid, 'cafe', null::text, 22.00, 1, 'un');
  r := mercado_trip_add(cid, 'cafe', null, 2, 'un');
  assert (r->>'ok')::boolean,                        'sem preco mas com historico deveria gravar';
  assert (r->>'preco')::numeric = 22.00,             'deveria reusar o ultimo preco pago';
  assert r->>'preco_origem' = 'historico',           'preco_origem deveria ser historico';
  assert (r->>'above_par')::boolean,                 'cafe estava no nivel normal, above_par deveria ser true';
  assert r->>'aviso' = 'ja_tinha_em_casa',           'deveria avisar que ja tinha em casa';
  assert not (r->>'needs_confirm')::boolean,         'needs_confirm nunca mais deveria travar';
  assert (select count(*) from trip_items ti join shopping_trips s on s.id = ti.trip_id
          where s.household_id = (select household_id from household_members where telegram_chat_id = cid)
            and ti.item_name = 'cafe') = 1, 'cafe deveria ter sido gravado, nao recusado';

  -- Preco informado vence o historico.
  r := mercado_trip_add(cid, 'cafe', 19.90, 1, 'un');
  assert (r->>'preco')::numeric = 19.90,   'preco informado deveria prevalecer';
  assert r->>'preco_origem' = 'informado', 'preco_origem deveria ser informado';

  -- A1: sem preco e sem historico, ai sim perguntar e inevitavel.
  r := mercado_trip_add(cid, 'sal', null, 1, 'un');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_preco', 'item novo sem preco deveria dar sem_preco';
  assert (select count(*) from trip_items ti join shopping_trips s on s.id = ti.trip_id
          where s.household_id = (select household_id from household_members where telegram_chat_id = cid)
            and ti.item_name = 'sal') = 0, 'sal nao deveria ter sido gravado';

  -- Chat sem familia continua devolvendo erro tratado, nao excecao.
  r := mercado_trip_add(999999022, 'arroz', 5.00, 1, 'un');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'chat sem familia deveria dar sem_familia';

  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0021 A3 (carrinho abre sozinho) + A1 (preco opcional, sem trava) OK';
end $$;

-- Self-test A4: cada intencao devolve a sua acao, com antes e depois corretos.
-- Passa pelo despachante mercado_apply de proposito, para provar que ele repassa os campos.
do $$
declare cid bigint := 999999023; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0021 A4', 'Tester');

  -- comprei: produto novo, 0 -> 2
  r := mercado_apply(cid, 'comprei', 'arroz', null::text, 10.00, 2, 'kg');
  assert r->>'acao' = 'compra_registrada', 'comprei deveria devolver compra_registrada';
  assert (r->>'antes')::numeric  = 0, 'antes de comprar produto novo deveria ser 0';
  assert (r->>'depois')::numeric = 2, 'depois de comprar 2 deveria ser 2';
  assert (r->>'estoque_novo')::numeric = 2, 'estoque_novo (chave antiga) deveria continuar vindo';

  -- tenho: SOBRESCREVE, 2 -> 5. E o par que mais dana quando o LLM troca com 'comprei'.
  r := mercado_apply(cid, 'tenho', 'arroz', null::text, 0, 5, 'kg');
  assert r->>'acao' = 'estoque_ajustado', 'tenho deveria devolver estoque_ajustado';
  assert (r->>'antes')::numeric  = 2, 'antes do ajuste deveria ser 2';
  assert (r->>'depois')::numeric = 5, 'depois do ajuste deveria ser 5';

  -- vou_comprar: lista. O estoque NAO pode mudar, e o retorno tem que dizer isso.
  r := mercado_apply(cid, 'vou_comprar', 'arroz', null::text, 0, 3, 'kg');
  assert r->>'acao' = 'adicionado_lista', 'vou_comprar deveria devolver adicionado_lista';
  assert (r->>'antes')::numeric = (r->>'depois')::numeric, 'lista nao pode mexer no estoque';
  assert (r->>'antes')::numeric = 5, 'estoque deveria continuar 5';
  assert (select current_stock from products p join household_members m on m.household_id = p.household_id
          where m.telegram_chat_id = cid and p.name = 'arroz') = 5, 'estoque real nao pode ter mudado';

  -- consumi: 5 -> 3
  r := mercado_apply(cid, 'consumi', 'arroz', null::text, 0, 2, 'kg');
  assert r->>'acao' = 'consumo_baixado', 'consumi deveria devolver consumo_baixado';
  assert (r->>'antes')::numeric  = 5, 'antes da baixa deveria ser 5';
  assert (r->>'depois')::numeric = 3, 'depois de consumir 2 deveria ser 3';

  -- produto novo por 'tenho' (caminho do return antecipado) tambem devolve os campos
  r := mercado_apply(cid, 'tenho', 'acucar', null::text, 0, 4, 'kg');
  assert r->>'acao' = 'estoque_ajustado',  'tenho de item novo deveria devolver estoque_ajustado';
  assert (r->>'antes')::numeric  = 0, 'item que nao existia deveria ter antes = 0';
  assert (r->>'depois')::numeric = 4, 'item novo deveria ficar com 4';

  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0021 A4 (acao/antes/depois nas quatro intencoes) OK';
end $$;

-- Self-test A2. Limitacao honesta: mercado_budget_set_web resolve a casa por auth.uid(),
-- e household_members.auth_user_id tem FK para auth.users, entao nao da para fabricar um
-- usuario web de teste aqui sem sujar o auth do projeto. O que este bloco prova:
--   1. a validacao de entrada;
--   2. o caminho sem sessao;
--   3. que a linha escrita e encontrada pela MESMA expressao de mes que 0008 usa na leitura,
--      que e onde um erro passaria despercebido (grava em um mes, le de outro).
-- O caminho autenticado e teste manual: definir o orcamento no app e recarregar a pagina.
do $$
declare cid bigint := 999999024; h uuid; r json;
begin
  r := mercado_budget_set_web(0);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'zero deveria ser valor_invalido';
  r := mercado_budget_set_web(-10);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'negativo deveria ser valor_invalido';
  r := mercado_budget_set_web(null);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'null deveria ser valor_invalido';
  r := mercado_budget_set_web(1200);
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem sessao deveria ser sem_familia';

  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0021 A2', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- mesma escrita que a funcao faz, com a casa resolvida a mao
  insert into budgets (household_id, month, amount)
    values (h, date_trunc('month', current_date)::date, 1200)
  on conflict (household_id, month) do update set amount = excluded.amount;
  insert into budgets (household_id, month, amount)
    values (h, date_trunc('month', current_date)::date, 850)
  on conflict (household_id, month) do update set amount = excluded.amount;

  assert (select count(*) from budgets where household_id = h) = 1,
    'upsert deveria manter uma linha por mes, nao duplicar';
  -- expressao identica a de 0008_read_web.sql linha 80-81
  assert (select amount from budgets b where b.household_id = h
          and b.month = date_trunc('month', current_date)::date) = 850,
    'a leitura da tela Economia deveria enxergar o ultimo valor gravado';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0021 A2 (orcamento persiste e a leitura acha) OK';
end $$;
