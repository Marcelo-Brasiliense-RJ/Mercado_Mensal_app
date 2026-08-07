-- Mercado_app: "usei 500 gramas" para de zerar 2 kg de arroz.
-- Rode DEPOIS de 0029.
--
-- BUG, confirmado por leitura das assinaturas em producao:
--   mercado_apply_consumption(p_chat_id, p_name, p_qty) nao recebe unidade nenhuma.
--   O despachante mercado_apply TEM p_unit em maos e simplesmente nao repassa.
--   Resultado: com 2 kg de arroz em casa, "usei 500 gramas" faz greatest(0, 2 - 500)
--   e trava em ZERO. O estoque inteiro do item some, sem aviso.
--
-- O mesmo descuido, em outra forma, nas escritas que somam: mercado_apply_purchase e
-- mercado_cart_apply_item faziam current_stock + p_qty ignorando que a unidade falada
-- podia ser outra, e ainda trocavam a unidade do produto (2 kg + 500 g virava "502 g").
--
-- CORRECAO: a unidade do PRODUTO manda. O que a pessoa fala e convertido para ela.
-- Unidade incompativel (un contra kg) nao inventa conversao: passa o numero como veio,
-- que e o comportamento de hoje e o unico honesto sem saber o peso da embalagem.

-- ============ CONVERSAO ============
-- ponytail: so massa e volume, que e onde a fala varia de verdade ("meio quilo",
-- "500 gramas", "dois litros"). Nao tenta un -> kg: isso depende do produto e viraria
-- chute. Se um dia precisar, o caminho e peso por embalagem no cadastro.
create or replace function mercado_conv(p_qty numeric, p_de text, p_para text)
returns numeric language sql immutable set search_path = public as $fn$
  select case
    when p_qty is null or p_de is null or p_para is null      then p_qty
    when lower(trim(p_de)) = lower(trim(p_para))              then p_qty
    when lower(trim(p_de)) = 'g'  and lower(trim(p_para)) = 'kg'            then round(p_qty / 1000.0, 3)
    when lower(trim(p_de)) = 'kg' and lower(trim(p_para)) = 'g'             then p_qty * 1000
    when lower(trim(p_de)) = 'ml' and lower(trim(p_para)) in ('l','lt')     then round(p_qty / 1000.0, 3)
    when lower(trim(p_de)) in ('l','lt') and lower(trim(p_para)) = 'ml'     then p_qty * 1000
    else p_qty
  end
$fn$;

-- ============ CONSUMO COM UNIDADE ============
-- Assinatura nova, de 4 argumentos. A de 3 continua existindo logo abaixo como atalho,
-- para nao quebrar nenhum chamador que eu nao tenha visto. O 4o parametro NAO tem
-- default de proposito: com default, a chamada de 3 argumentos casaria com as duas
-- funcoes e o Postgres recusaria por ambiguidade.
create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric, p_unit text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; pid uuid; antes numeric; depois numeric; un text; baixa numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, unit into pid, antes, un
    from products where household_id = h and name = p_name;
  if pid is null then
    return json_build_object('ok', false, 'erro', 'produto_nao_encontrado', 'item', p_name);
  end if;

  -- Sem quantidade dita, "acabou": baixa tudo. Com quantidade, converte para a
  -- unidade do produto antes de subtrair.
  baixa := coalesce(mercado_conv(p_qty, p_unit, un), antes);

  update products set current_stock = greatest(0, current_stock - baixa), updated_at = now()
    where id = pid;
  select current_stock into depois from products where id = pid;

  perform mercado_log_event(h, pid, p_name, 'consumo_baixado', coalesce(antes,0), depois,
    baixa, 'bot', jsonb_build_object('unidade_falada', p_unit, 'unidade_produto', un));

  return json_build_object('ok', true, 'item', p_name, 'estoque_novo', depois,
    'unidade', un, 'baixou', baixa,
    'acao', 'consumo_baixado', 'antes', coalesce(antes,0), 'depois', depois);
end $fn$;

-- Atalho da assinatura antiga: sem unidade, nada muda em relacao ao que ja acontecia.
create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric default null)
returns json language plpgsql security definer set search_path = public as $fn$
begin
  return mercado_apply_consumption(p_chat_id, p_name, p_qty, null::text);
end $fn$;

-- ============ DESPACHANTE PASSA A UNIDADE ============
-- Mesma assinatura de 0004, caractere por caractere. A unica mudanca e a linha do
-- 'consumi', que agora repassa p_unit em vez de descartar.
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
    else return json_build_object('ok', false, 'erro', 'intencao_desconhecida', 'item', p_name);
  end case;
end $fn$;

-- ============ COMPRA: SOMA CONVERTIDA, UNIDADE DO PRODUTO PRESERVADA ============
-- Corpo de 0027 (casamento da lista por nome), com a conversao e sem trocar a unidade
-- de um produto que ja existe.
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; pid uuid; prev_price numeric; saved numeric; antes numeric; depois numeric;
        lista_ids uuid[]; un text; qtd numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, unit into pid, antes, un from products where household_id = h and name = p_name;
  antes := coalesce(antes, 0);
  qtd := coalesce(mercado_conv(p_qty, p_unit, un), p_qty);

  if pid is null then
    -- Produto novo: aqui sim a unidade falada vira a do cadastro.
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
    un := coalesce(p_unit,'un');
    qtd := p_qty;
  else
    update products set current_stock = current_stock + qtd,
                        par_level = case when par_level = 0 then qtd else par_level end,
                        updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, qtd, un);
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * qtd, 2) else 0 end;

  with upd as (
    update shopping_list set status = 'bought', bought_at = now(),
                             product_id = coalesce(product_id, pid)
      where household_id = h and status = 'pending'
        and (product_id = pid or (product_id is null and item_name = p_name))
      returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into lista_ids from upd;

  select current_stock into depois from products where id = pid;
  perform mercado_log_event(h, pid, p_name, 'compra_registrada', antes, depois, qtd, 'bot',
    jsonb_build_object('preco', p_price, 'marca', p_brand, 'lista_ids', to_jsonb(lista_ids)));

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', depois, 'unidade', un,
    'preco_anterior', prev_price, 'economia', saved,
    'acao', 'compra_registrada', 'antes', antes, 'depois', depois,
    'saiu_da_lista', coalesce(array_length(lista_ids, 1), 0));
end $fn$;

-- ============ INVENTARIO: MESMA REGRA ============
-- Corpo de 0023, com conversao. "tenho 500 g" num produto cadastrado em kg passa a
-- gravar 0,5 kg em vez de 500 kg.
create or replace function mercado_apply_inventory(
  p_chat_id bigint, p_name text, p_qty numeric, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; pid uuid; est numeric; t0 timestamptz; old_rate numeric;
        dias numeric; comprado numeric; consumido numeric; nova_taxa numeric;
        un text; qtd numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, last_inventory_at, consumption_rate_month, unit
    into pid, est, t0, old_rate, un from products where household_id = h and name = p_name;

  if pid is null then
    insert into products (household_id, name, unit, current_stock, last_inventory_at)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, now()) returning id into pid;
    perform mercado_log_event(h, pid, p_name, 'estoque_ajustado', 0, p_qty, p_qty, 'bot');
    return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty, 'taxa_recalibrada', false,
      'acao', 'estoque_ajustado', 'antes', 0, 'depois', p_qty);
  end if;

  qtd := coalesce(mercado_conv(p_qty, p_unit, un), p_qty);

  if t0 is not null then
    dias := greatest(1, extract(epoch from (now() - t0)) / 86400);
    select coalesce(sum(quantity),0) into comprado from purchases where product_id = pid and purchased_at > t0;
    consumido := greatest(0, est + comprado - qtd);
    nova_taxa := round(consumido / dias * 30, 3);
    old_rate := case when coalesce(old_rate,0) = 0 then nova_taxa else round(0.5*old_rate + 0.5*nova_taxa, 3) end;
  end if;

  -- unit NAO e mais sobrescrito: a unidade do cadastro manda e a fala foi convertida.
  update products set current_stock = qtd, last_inventory_at = now(),
                      consumption_rate_month = coalesce(old_rate, consumption_rate_month),
                      updated_at = now() where id = pid;

  perform mercado_log_event(h, pid, p_name, 'estoque_ajustado', coalesce(est,0), qtd, qtd, 'bot');

  return json_build_object('ok', true, 'item', p_name, 'estoque', qtd, 'unidade', un,
    'taxa_mes', (select consumption_rate_month from products where id = pid),
    'taxa_recalibrada', t0 is not null,
    'acao', 'estoque_ajustado', 'antes', coalesce(est, 0), 'depois', qtd);
end $fn$;

-- ============ CARRINHO: MESMA REGRA AO FINALIZAR ============
create or replace function mercado_cart_apply_item(
  h uuid, p_product_id uuid, p_name text, p_price numeric, p_qty numeric, p_unit text)
returns numeric language plpgsql security definer set search_path = public as $fn$
declare pid uuid; prev_price numeric; saved numeric; un text; qtd numeric;
begin
  p_name := lower(trim(p_name));
  pid := p_product_id;
  if pid is null then
    select id into pid from products where household_id = h and name = p_name;
  end if;

  select unit into un from products where id = pid;
  qtd := coalesce(mercado_conv(p_qty, p_unit, un), p_qty);

  if pid is null then
    insert into products (household_id, name, unit, current_stock)
      values (h, p_name, coalesce(p_unit,'un'), p_qty) returning id into pid;
    un := coalesce(p_unit,'un');
    qtd := p_qty;
  else
    update products set current_stock = current_stock + qtd, updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases
    where product_id = pid order by purchased_at desc limit 1;

  insert into purchases (household_id, product_id, item_name, unit_price, quantity, unit)
    values (h, pid, p_name, p_price, qtd, un);

  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * qtd, 2) else 0 end;

  update shopping_list set status = 'bought', bought_at = now(),
                           product_id = coalesce(product_id, pid)
    where household_id = h and status = 'pending'
      and (product_id = pid or (product_id is null and item_name = p_name));

  return saved;
end $fn$;

revoke execute on function mercado_apply_consumption(bigint, text, numeric, text) from public, anon;
grant  execute on function mercado_apply_consumption(bigint, text, numeric, text) to service_role;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999101; h uuid; r json; est numeric; un text;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0030', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- conversao pura
  assert mercado_conv(500, 'g', 'kg')  = 0.5,  'meio quilo em gramas';
  assert mercado_conv(2, 'kg', 'g')    = 2000, 'dois quilos em gramas';
  assert mercado_conv(1500, 'ml', 'l') = 1.5,  'mil e quinhentos ml em litros';
  assert mercado_conv(3, 'un', 'kg')   = 3,    'unidade incompativel nao inventa conversao';
  assert mercado_conv(3, 'kg', 'kg')   = 3,    'mesma unidade nao mexe';

  -- O CASO RELATADO: 2 kg em casa, "usei 500 gramas"
  perform mercado_apply(cid, 'tenho', 'arroz', null::text, 0, 2, 'kg');
  r := mercado_apply(cid, 'consumi', 'arroz', null::text, 0, 500, 'g');
  select current_stock, unit into est, un from products where household_id = h and name = 'arroz';
  assert est = 1.5, format('2 kg menos 500 g tem que dar 1,5 kg, veio %s', est);
  assert un = 'kg',  format('a unidade do produto nao pode mudar para g, veio %s', un);

  -- compra em grama num produto cadastrado em kg
  perform mercado_apply(cid, 'comprei', 'arroz', null::text, 10, 500, 'g');
  select current_stock, unit into est, un from products where household_id = h and name = 'arroz';
  assert est = 2, format('1,5 kg mais 500 g tem que dar 2 kg, veio %s', est);
  assert un = 'kg', 'a unidade continua kg depois da compra';

  -- inventario em grama tambem converte
  perform mercado_apply(cid, 'tenho', 'arroz', null::text, 0, 750, 'g');
  select current_stock into est from products where household_id = h and name = 'arroz';
  assert est = 0.75, format('"tenho 750 g" deveria virar 0,75 kg, veio %s', est);

  -- volume
  perform mercado_apply(cid, 'tenho', 'leite', null::text, 0, 2, 'l');
  perform mercado_apply(cid, 'consumi', 'leite', null::text, 0, 500, 'ml');
  select current_stock into est from products where household_id = h and name = 'leite';
  assert est = 1.5, format('2 l menos 500 ml deveria dar 1,5 l, veio %s', est);

  -- consumo sem quantidade continua zerando (acabou)
  perform mercado_apply_consumption(cid, 'leite', null);
  select current_stock into est from products where household_id = h and name = 'leite';
  assert est = 0, format('consumo sem quantidade deveria zerar, veio %s', est);

  -- produto novo continua adotando a unidade falada
  perform mercado_apply(cid, 'tenho', 'farinha', null::text, 0, 500, 'g');
  select current_stock, unit into est, un from products where household_id = h and name = 'farinha';
  assert est = 500 and un = 'g', format('produto novo fica em g mesmo, veio %s %s', est, un);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0030 (unidades) OK';
end $test$;
