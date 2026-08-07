-- Mercado_app — log de eventos de escrita (base do desfazer)
-- Rode DEPOIS de 0021. (Nao existe 0022 ainda: aquele numero esta reservado para
-- 0022_lote.sql, do grupo C, que fica para a proxima rodada.)
--
-- Por que existe: nao havia registro de nenhuma escrita. Sem isso nao ha desfazer,
-- nao ha como medir a taxa real de erro de classificacao do LLM, e o "Historico" do
-- ItemDetailModal e uma maquete de tres linhas montada no cliente.
--
-- Por que nao trigger: um trigger em products nao sabe a INTENCAO nem a ORIGEM da
-- mudanca, que e exatamente o que se quer registrar. A chamada explicita dentro da
-- funcao sabe. Todas as funcoes abaixo sao as mesmas de 0021/0009/0011/0016, com uma
-- linha de log acrescentada. A logica de negocio nao mudou.

-- ============ 1. TABELA ============
create table if not exists mercado_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  item_name    text not null,
  acao         text not null,      -- estoque_ajustado | compra_registrada | adicionado_lista | consumo_baixado | desfeito
  antes        numeric,
  depois       numeric,
  qtd          numeric,
  origem       text not null,      -- bot | web
  payload      jsonb not null default '{}'::jsonb,
  revertido_em timestamptz,        -- preenchido por mercado_desfazer (I2)
  created_at   timestamptz not null default now()
);
create index if not exists idx_events_house_time on mercado_events (household_id, created_at desc);

alter table mercado_events enable row level security;
-- Sem policy, no padrao de 0012: acesso so por funcao security definer.

-- ============ 2. LOG (interno, sem grant para ninguem) ============
create or replace function mercado_log_event(
  p_household uuid, p_product uuid, p_item text, p_acao text,
  p_antes numeric, p_depois numeric, p_qtd numeric, p_origem text,
  p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  insert into mercado_events (household_id, product_id, item_name, acao, antes, depois, qtd, origem, payload)
    values (p_household, p_product, lower(trim(p_item)), p_acao, p_antes, p_depois, p_qtd, p_origem,
            coalesce(p_payload, '{}'::jsonb))
    returning id into eid;
  return eid;
end $$;
-- So e chamada de dentro de outras funcoes SECURITY DEFINER, que rodam como o dono.
revoke execute on function mercado_log_event(uuid, uuid, text, text, numeric, numeric, numeric, text, jsonb)
  from public, anon, authenticated, service_role;

-- ============ 3. ESCRITAS DO BOT (origem 'bot') ============

create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; prev_price numeric; saved numeric; antes numeric; depois numeric;
        lista_ids uuid[];
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

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

  -- guarda quais itens da lista foram marcados como comprados, para o desfazer
  -- conseguir devolve-los a 'pending' em vez de deixar a lista mentindo.
  with upd as (
    update shopping_list set status = 'bought', bought_at = now()
      where household_id = h and product_id = pid and status = 'pending'
      returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into lista_ids from upd;

  select current_stock into depois from products where id = pid;
  perform mercado_log_event(h, pid, p_name, 'compra_registrada', antes, depois, p_qty, 'bot',
    jsonb_build_object('preco', p_price, 'marca', p_brand, 'lista_ids', to_jsonb(lista_ids)));

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', depois,
    'preco_anterior', prev_price, 'economia', saved,
    'acao', 'compra_registrada', 'antes', antes, 'depois', depois);
end $$;

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
    perform mercado_log_event(h, pid, p_name, 'estoque_ajustado', 0, p_qty, p_qty, 'bot');
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

  perform mercado_log_event(h, pid, p_name, 'estoque_ajustado', coalesce(est,0), p_qty, p_qty, 'bot');

  return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty,
    'taxa_mes', (select consumption_rate_month from products where id = pid),
    'taxa_recalibrada', t0 is not null,
    'acao', 'estoque_ajustado', 'antes', coalesce(est, 0), 'depois', p_qty);
end $$;

create or replace function mercado_add_to_list(
  p_chat_id bigint, p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; estoque numeric; nivel numeric; ult_preco numeric; ja_tem boolean;
        qtd numeric; lid uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  select unit_price into ult_preco from purchases
    where product_id = pid order by purchased_at desc limit 1;

  ja_tem := pid is not null and estoque is not null and nivel is not null
            and nivel > 0 and estoque >= nivel;

  if coalesce(p_qty, 0) > 0 then
    qtd := p_qty;
  elsif nivel is not null and nivel > 0 then
    qtd := greatest(1, ceil(nivel - coalesce(estoque, 0)));
  else
    qtd := 1;
  end if;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price)
    values (h, pid, p_name, qtd, coalesce(p_unit,'un'), ult_preco)
    returning id into lid;

  -- antes = depois: a lista nao mexe no estoque, e o log precisa registrar isso.
  perform mercado_log_event(h, pid, p_name, 'adicionado_lista',
    coalesce(estoque,0), coalesce(estoque,0), qtd, 'bot', jsonb_build_object('list_id', lid));

  return json_build_object('ok', true, 'item', p_name, 'ja_tem_em_casa', ja_tem,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0),
    'preco_estimado', ult_preco, 'quantidade', qtd,
    'acao', 'adicionado_lista', 'antes', coalesce(estoque,0), 'depois', coalesce(estoque,0));
end $$;

create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; antes numeric; depois numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));
  select id, current_stock into pid, antes from products where household_id = h and name = p_name;
  if pid is null then return json_build_object('ok', false, 'erro', 'produto_nao_encontrado', 'item', p_name); end if;
  update products set current_stock = greatest(0, current_stock - coalesce(p_qty, current_stock)), updated_at = now()
    where id = pid;
  select current_stock into depois from products where id = pid;

  perform mercado_log_event(h, pid, p_name, 'consumo_baixado', coalesce(antes,0), depois,
    coalesce(p_qty, coalesce(antes,0)), 'bot');

  return json_build_object('ok', true, 'item', p_name, 'estoque_novo', depois,
    'acao', 'consumo_baixado', 'antes', coalesce(antes,0), 'depois', depois);
end $$;

-- ============ 4. ESCRITAS DO APP (origem 'web') ============

create or replace function mercado_stock_add_web(
  p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; pid uuid; antes numeric; depois numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  p_name := lower(trim(coalesce(p_name, '')));
  if p_name = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  p_qty := coalesce(p_qty, 1);

  select id, current_stock into pid, antes from products where household_id = hid and name = p_name;
  antes := coalesce(antes, 0);

  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (hid, p_name, coalesce(p_unit, 'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select current_stock into depois from products where id = pid;
  perform mercado_log_event(hid, pid, p_name, 'estoque_ajustado', antes, depois, p_qty, 'web');

  return json_build_object('ok', true, 'id', pid, 'estoque_novo', depois);
end $$;

create or replace function mercado_stock_baixa_web(p_id uuid, p_qty numeric)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; novo numeric; antes numeric; nome text;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  -- le o estado anterior antes do update, para o log e o desfazer
  select current_stock, name into antes, nome from products where id = p_id and household_id = hid;

  update products set current_stock = greatest(0, current_stock - greatest(0, coalesce(p_qty, 0))),
                      updated_at = now()
    where id = p_id and household_id = hid
    returning current_stock into novo;
  if novo is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  perform mercado_log_event(hid, p_id, nome, 'consumo_baixado', antes, novo,
    greatest(0, coalesce(p_qty, 0)), 'web');

  return json_build_object('ok', true, 'estoque_novo', novo);
end $$;

create or replace function mercado_stock_zerar_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it record; n int := 0;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  -- virou laco para registrar um evento por item, com o estoque anterior de cada um.
  -- O update em lote nao tinha como saber de quanto cada item veio.
  for it in select id, name, current_stock from products
            where id = any(p_ids) and household_id = hid loop
    update products set current_stock = 0, updated_at = now() where id = it.id;
    perform mercado_log_event(hid, it.id, it.name, 'consumo_baixado', it.current_stock, 0,
      it.current_stock, 'web');
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'afetados', n);
end $$;

create or replace function mercado_list_buy_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it record; pid uuid; n int := 0; antes numeric; depois numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  for it in select * from shopping_list
            where id = any(p_ids) and household_id = hid and status = 'pending' loop
    if it.product_id is not null then
      select current_stock into antes from products where id = it.product_id;
      update products set current_stock = current_stock + it.desired_quantity, updated_at = now()
        where id = it.product_id;
      pid := it.product_id;
    else
      antes := 0;
      insert into products (household_id, name, unit, current_stock, par_level)
        values (hid, lower(trim(it.item_name)), coalesce(it.unit,'un'), it.desired_quantity, it.desired_quantity)
      on conflict (household_id, name) do update
        set current_stock = products.current_stock + excluded.current_stock, updated_at = now()
      returning id into pid;
      update shopping_list set product_id = pid where id = it.id;
    end if;
    update shopping_list set status = 'bought', bought_at = now() where id = it.id;

    select current_stock into depois from products where id = pid;
    perform mercado_log_event(hid, pid, it.item_name, 'compra_registrada', coalesce(antes,0), depois,
      it.desired_quantity, 'web', jsonb_build_object('lista_ids', to_jsonb(array[it.id])));
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'comprados', n);
end $$;

-- ============ 5. PERMISSOES (iguais as de antes; create or replace preserva, repetimos) ============
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

revoke execute on function
  mercado_stock_add_web(text, numeric, text),
  mercado_stock_baixa_web(uuid, numeric),
  mercado_stock_zerar_web(uuid[]),
  mercado_list_buy_web(uuid[])
  from public, anon;
grant execute on function
  mercado_stock_add_web(text, numeric, text),
  mercado_stock_baixa_web(uuid, numeric),
  mercado_stock_zerar_web(uuid[]),
  mercado_list_buy_web(uuid[])
  to authenticated;

-- ============ 6. DESFAZER ============
-- Restaura o valor ABSOLUTO de 'antes'. Nao aplica a operacao inversa: inverter uma
-- soma e fragil se outra escrita aconteceu no meio, e o log ja guarda o absoluto.
--
-- ponytail: desfaz so o ultimo evento, nao uma pilha. Cobre o caso relatado
-- ("errou, desfaz na hora"). Pilha completa so se aparecer necessidade real.
create or replace function mercado_desfazer_h(h uuid, p_origem text)
returns json language plpgsql security definer set search_path = public as $$
declare ev record; lids uuid[];
begin
  select * into ev from mercado_events
    where household_id = h and revertido_em is null and acao <> 'desfeito'
    order by created_at desc limit 1;
  if not found then
    return json_build_object('ok', false, 'erro', 'nada_para_desfazer');
  end if;
  if ev.created_at < now() - interval '24 hours' then
    return json_build_object('ok', false, 'erro', 'fora_da_janela');
  end if;

  if ev.acao = 'adicionado_lista' then
    update shopping_list set status = 'removed'
      where id = (ev.payload->>'list_id')::uuid and household_id = h;
  else
    if ev.product_id is not null then
      update products set current_stock = ev.antes, updated_at = now()
        where id = ev.product_id and household_id = h;
    end if;
    -- itens que aquela operacao marcou como comprados voltam a pendente, senao a
    -- lista continuaria dizendo "comprado" para uma compra que foi desfeita.
    if jsonb_exists(ev.payload, 'lista_ids') then
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into lids
        from jsonb_array_elements_text(ev.payload->'lista_ids') x;
      update shopping_list set status = 'pending', bought_at = null
        where id = any(lids) and household_id = h;
    end if;
  end if;

  update mercado_events set revertido_em = now() where id = ev.id;
  -- a propria reversao vira evento, e ela nunca pode ser desfeita (acao <> 'desfeito' acima)
  perform mercado_log_event(h, ev.product_id, ev.item_name, 'desfeito', ev.depois, ev.antes,
    ev.qtd, p_origem, jsonb_build_object('evento_id', ev.id, 'acao_desfeita', ev.acao));

  return json_build_object('ok', true, 'desfeito', ev.acao, 'item', ev.item_name,
    'antes', ev.depois, 'depois', ev.antes);
end $$;
revoke execute on function mercado_desfazer_h(uuid, text) from public, anon, authenticated, service_role;

create or replace function mercado_desfazer(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_desfazer_h(h, 'bot');
end $$;

create or replace function mercado_desfazer_web()
returns json language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_desfazer_h(h, 'web');
end $$;

revoke execute on function mercado_desfazer(bigint), mercado_desfazer_web() from public, anon;
grant  execute on function mercado_desfazer(bigint)  to service_role;
grant  execute on function mercado_desfazer_web()    to authenticated;

-- ============ 7. SELF-TEST ============
-- Cobre as quatro escritas do bot (as do app dependem de auth.uid(), ver nota da A2
-- na 0021: nao da para fabricar sessao web aqui sem sujar o auth do projeto).
do $$
declare cid bigint := 999999031; h uuid; n int; ev record;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0023', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  perform mercado_apply(cid, 'comprei', 'arroz', null::text, 10.00, 2, 'kg');   -- 0 -> 2
  perform mercado_apply(cid, 'tenho',   'arroz', null::text, 0,     5, 'kg');   -- 2 -> 5
  perform mercado_apply(cid, 'vou_comprar', 'arroz', null::text, 0, 3, 'kg');   -- estoque intacto
  perform mercado_apply(cid, 'consumi', 'arroz', null::text, 0,     2, 'kg');   -- 5 -> 3

  select count(*) into n from mercado_events where household_id = h;
  assert n = 4, format('esperava 4 eventos, veio %s', n);

  select * into ev from mercado_events where household_id = h and acao = 'compra_registrada';
  assert ev.antes = 0 and ev.depois = 2, 'compra: 0 -> 2';
  assert ev.origem = 'bot',              'origem deveria ser bot';

  select * into ev from mercado_events where household_id = h and acao = 'estoque_ajustado';
  assert ev.antes = 2 and ev.depois = 5, 'ajuste: 2 -> 5';

  select * into ev from mercado_events where household_id = h and acao = 'adicionado_lista';
  assert ev.antes = ev.depois,           'lista nao pode mexer no estoque';
  -- jsonb_exists e nao o operador ?, que alguns clientes tratam como placeholder de bind
  assert jsonb_exists(ev.payload, 'list_id'), 'evento de lista precisa do list_id para o desfazer';

  select * into ev from mercado_events where household_id = h and acao = 'consumo_baixado';
  assert ev.antes = 5 and ev.depois = 3, 'consumo: 5 -> 3';
  assert ev.product_id is not null,      'evento deveria apontar para o produto';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  -- households on delete cascade limpa mercado_events da casa de teste
  raise notice 'SELF-TEST 0023 I1 (log de eventos) OK';
end $$;

-- Self-test I2: desfazer devolve o estoque ao valor exato de antes, some da lista
-- quando a acao foi de lista, e nao pode acontecer duas vezes.
do $$
declare cid bigint := 999999032; h uuid; r json; est numeric; st text; lid uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0023 I2', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- nada gravado ainda
  r := mercado_desfazer(cid);
  assert not (r->>'ok')::boolean and r->>'erro' = 'nada_para_desfazer', 'casa vazia nao tem o que desfazer';

  -- compra 0 -> 2, desfaz, tem que voltar a 0
  perform mercado_apply(cid, 'comprei', 'arroz', null::text, 10.00, 2, 'kg');
  r := mercado_desfazer(cid);
  assert (r->>'ok')::boolean,                'deveria desfazer a compra';
  assert r->>'desfeito' = 'compra_registrada', 'deveria dizer o que desfez';
  select current_stock into est from products where household_id = h and name = 'arroz';
  assert est = 0, format('estoque deveria ter voltado a 0, veio %s', est);

  -- nao desfaz duas vezes, e nao desfaz o proprio 'desfeito'
  r := mercado_desfazer(cid);
  assert not (r->>'ok')::boolean and r->>'erro' = 'nada_para_desfazer', 'nao pode desfazer duas vezes';
  assert (select count(*) from mercado_events where household_id = h and acao = 'desfeito') = 1,
    'a reversao deveria ter gerado exatamente um evento desfeito';
  assert (select count(*) from mercado_events where household_id = h and revertido_em is not null) = 1,
    'o evento revertido deveria estar marcado';

  -- lista: desfazer marca o item como removido
  perform mercado_apply(cid, 'vou_comprar', 'feijao', null::text, 0, 3, 'kg');
  r := mercado_desfazer(cid);
  assert r->>'desfeito' = 'adicionado_lista', 'deveria desfazer a inclusao na lista';
  select status into st from shopping_list where household_id = h and item_name = 'feijao';
  assert st = 'removed', format('item da lista deveria estar removed, veio %s', st);

  -- ajuste de estoque: 'tenho 9' e depois desfaz volta ao que era
  perform mercado_apply(cid, 'tenho', 'arroz', null::text, 0, 9, 'kg');
  select current_stock into est from products where household_id = h and name = 'arroz';
  assert est = 9, 'ajuste deveria ter posto 9';
  perform mercado_desfazer(cid);
  select current_stock into est from products where household_id = h and name = 'arroz';
  assert est = 0, format('desfazer o ajuste deveria voltar a 0, veio %s', est);

  -- janela de 24h: evento antigo nao pode mais ser desfeito
  update mercado_events set revertido_em = now() where household_id = h and revertido_em is null;
  insert into mercado_events (household_id, item_name, acao, antes, depois, qtd, origem, created_at)
    values (h, 'acucar', 'estoque_ajustado', 1, 5, 5, 'bot', now() - interval '48 hours');
  r := mercado_desfazer(cid);
  assert not (r->>'ok')::boolean and r->>'erro' = 'fora_da_janela', 'evento de 48h nao deveria ser reversivel';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0023 I2 (desfazer) OK';
end $$;
