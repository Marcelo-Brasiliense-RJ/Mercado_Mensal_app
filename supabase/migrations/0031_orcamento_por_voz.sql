-- Mercado_app: definir o orcamento por voz e acompanhar ele dentro do mercado.
-- Rode DEPOIS de 0030.
--
-- Pedido do dono: "chego e falo que o orcamento desse mes e X, e quando estiver no
-- mercado ele vai mostrando o acompanhamento".
--
-- Ate aqui so o app escrevia orcamento (mercado_budget_set_web, da 0021). O bot nao
-- tinha rota nenhuma. E o carrinho mostrava so o total dele mesmo, sem dizer se aquilo
-- cabia no mes.
--
-- Escolha que evita mexer na estrutura do workflow: em vez de uma acao nova no agente,
-- que exigiria saida nova no switch e remontagem das conexoes de producao, o orcamento
-- entra como mais uma INTENCAO do despachante mercado_apply, que ja recebe intencao e
-- preco. O agente manda registrar com intencao orcamento e o valor em preco.

-- ============ ORCAMENTO PELO BOT ============
-- Espelha mercado_budget_set_web (0021), resolvendo a casa por chat_id. Mesmo mes
-- date_trunc que 0008 usa na leitura: divergir aqui faz gravar num mes e ler de outro.
create or replace function mercado_budget_set(p_chat_id bigint, p_total numeric)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; mes date := date_trunc('month', current_date)::date; gasto numeric;
begin
  if p_total is null or p_total <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  insert into budgets (household_id, month, amount) values (h, mes, p_total)
  on conflict (household_id, month) do update set amount = excluded.amount;

  select coalesce(sum(unit_price * quantity), 0) into gasto from purchases
    where household_id = h and date_trunc('month', purchased_at) = date_trunc('month', current_date);

  return json_build_object('ok', true, 'acao', 'orcamento_definido',
    'orcamento', p_total, 'gasto_mes', gasto, 'saldo', p_total - gasto, 'mes', mes,
    'antes', null, 'depois', null);
end $fn$;

-- ============ DESPACHANTE ACEITA A INTENCAO ============
-- Assinatura intocada. O valor vem em p_price, que e o campo de dinheiro que o agente
-- ja preenche.
create or replace function mercado_apply(
  p_chat_id bigint, p_intencao text, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
begin
  case lower(coalesce(p_intencao,''))
    when 'comprei'      then return mercado_apply_purchase(p_chat_id, p_name, p_brand, p_price, p_qty, p_unit);
    when 'tenho'        then return mercado_apply_inventory(p_chat_id, p_name, p_qty, p_unit);
    when 'vou_comprar'  then return mercado_add_to_list(p_chat_id, p_name, p_qty, p_unit);
    when 'consumi'      then return mercado_apply_consumption(p_chat_id, p_name, p_qty, p_unit);
    -- o valor pode vir em preco (natural) ou em quantidade (se o agente trocar)
    when 'orcamento'    then return mercado_budget_set(p_chat_id, greatest(coalesce(p_price,0), coalesce(p_qty,0)));
    else return json_build_object('ok', false, 'erro', 'intencao_desconhecida', 'item', p_name);
  end case;
end $fn$;

-- ============ CARRINHO PASSA A DEVOLVER O ACOMPANHAMENTO ============
-- Corpo de 0026, com tres campos novos no retorno. O gasto do mes NAO inclui o
-- carrinho, que so vira compra ao finalizar; por isso o saldo previsto desconta os
-- dois, que e justamente a pergunta de quem esta no corredor do mercado.
create or replace function mercado_trip_add_h(
  h uuid, p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare tid uuid; pid uuid; estoque numeric; nivel numeric; above boolean; total numeric;
        abriu boolean := false; preco numeric; origem text; orc numeric; gasto numeric;
begin
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  p_name := lower(trim(coalesce(p_name, '')));
  if p_name = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;

  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    tid := mercado_trip_start_h(h);
    abriu := true;
  end if;

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  above := pid is not null and nivel is not null and nivel > 0
           and estoque is not null and estoque >= nivel;

  if p_price is not null then
    preco  := p_price;
    origem := 'informado';
  else
    select unit_price into preco from purchases
      where product_id = pid order by purchased_at desc limit 1;
    origem := 'historico';
    if preco is null then
      return json_build_object('ok', false, 'erro', 'sem_preco', 'item', p_name,
        'compra_aberta_agora', abriu);
    end if;
  end if;

  insert into trip_items (trip_id, household_id, product_id, item_name, quantity, unit, unit_price, above_par)
    values (tid, h, pid, p_name, coalesce(p_qty,1), coalesce(p_unit,'un'), preco, above);

  select coalesce(sum(quantity * unit_price), 0) into total from trip_items where trip_id = tid;

  select amount into orc from budgets
    where household_id = h and month = date_trunc('month', current_date)::date limit 1;
  select coalesce(sum(unit_price * quantity), 0) into gasto from purchases
    where household_id = h and date_trunc('month', purchased_at) = date_trunc('month', current_date);

  return json_build_object('ok', true, 'needs_confirm', false, 'item', p_name,
    'above_par', above, 'total_parcial', total, 'compra_aberta_agora', abriu,
    'preco', preco, 'preco_origem', origem,
    'aviso', case when above then 'ja_tinha_em_casa' else null end,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0),
    -- acompanhamento do mes, para o bot mostrar no corredor do mercado
    'orcamento', orc, 'gasto_mes', gasto,
    'saldo_previsto', case when orc is null then null else orc - gasto - total end);
end $fn$;

revoke execute on function mercado_budget_set(bigint, numeric) from public, anon;
grant  execute on function mercado_budget_set(bigint, numeric) to service_role;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999111; h uuid; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0031', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- "o orcamento desse mes e 800"
  r := mercado_apply(cid, 'orcamento', 'orcamento', null::text, 800, 1, 'un');
  assert (r->>'ok')::boolean,                        'deveria gravar o orcamento';
  assert (r->>'orcamento')::numeric = 800,           format('orcamento deveria ser 800, veio %s', r->>'orcamento');
  assert (r->>'saldo')::numeric = 800,               'sem gasto no mes, o saldo e o orcamento inteiro';

  -- a leitura de 0008 tem que enxergar o que foi gravado (mesmo mes)
  assert (mercado_consulta_texto(cid, 'economia')->>'text') like '%800,00%',
    'a tela de economia deveria mostrar o orcamento gravado';

  -- redefinir sobrescreve, nao duplica
  perform mercado_apply(cid, 'orcamento', 'orcamento', null::text, 950, 1, 'un');
  assert (select count(*) from budgets where household_id = h) = 1, 'um orcamento por mes, sem duplicar';

  -- valor invalido nao grava
  r := mercado_apply(cid, 'orcamento', 'orcamento', null::text, 0, 0, 'un');
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'zero nao e orcamento';

  -- no mercado: o carrinho passa a informar quanto sobra
  r := mercado_trip_add_h(h, 'arroz', 30.00, 2, 'kg');
  assert (r->>'total_parcial')::numeric = 60,        'carrinho com 2 x 30';
  assert (r->>'orcamento')::numeric = 950,           'o carrinho deveria conhecer o orcamento';
  assert (r->>'saldo_previsto')::numeric = 890,      format('950 menos 0 de gasto menos 60 do carrinho = 890, veio %s', r->>'saldo_previsto');

  -- sem orcamento definido, o campo vem nulo em vez de zero (nao mente)
  delete from budgets where household_id = h;
  r := mercado_trip_add_h(h, 'feijao', 10.00, 1, 'kg');
  assert r->>'saldo_previsto' is null, 'sem orcamento nao existe saldo previsto';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0031 (orcamento por voz + acompanhamento no carrinho) OK';
end $test$;
