-- Mercado_app: comprar um item tira ele da lista mesmo quando a lista nao sabe o produto.
-- Rode DEPOIS de 0026.
--
-- Pedido do dono: "botei miojo na lista, quero falar 'peguei o miojo, foi quatorze reais'
-- e ele atualizar esse pedido". Isso ja era pra funcionar: tanto mercado_apply_purchase
-- (0023) quanto mercado_cart_apply_item (0012) marcam o item da lista como comprado
-- depois de repor o estoque. So que as duas casam a lista por product_id.
--
-- O PROBLEMA, medido em producao antes de escrever esta migration:
--   select count(*), count(product_id) from shopping_list where status = 'pending'
--   -> 19 itens, apenas 3 com product_id. DEZESSEIS itens da lista sao orfaos.
--
-- Por que nascem orfaos: mercado_add_to_list faz
--   select id into pid from products where household_id = h and name = p_name
-- e insere a linha com esse pid. Se a familia ainda NAO tem o produto cadastrado (que e
-- o caso normal de "preciso comprar miojo", justamente algo que falta em casa), pid e
-- null e a linha da lista nasce sem ligacao. Dali em diante, comprar o item nunca casa.
--
-- CORRECAO: casar tambem por nome quando o vinculo nao existe, e curar o product_id no
-- mesmo update para a linha parar de ser orfa. Nao mexemos em mercado_add_to_list: criar
-- produto so porque entrou na lista faria aparecer item zerado no estoque de quem so
-- queria anotar uma compra futura.
--
-- ponytail: casa por igualdade de nome, ja normalizado em lower(trim()) pelas duas pontas.
-- Nao e busca aproximada de proposito: "leite" nao deve casar com "leite condensado".

-- ============ COMPRA PELO BOT ============
-- Identica a de 0023, com UMA mudanca: o where do update da lista.
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
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

  -- AQUI a mudanca: alem do product_id, casa pelo nome quando a linha da lista e orfa,
  -- e aproveita para ligar o produto nela (cura o dado, nao so contorna).
  with upd as (
    update shopping_list set status = 'bought', bought_at = now(),
                             product_id = coalesce(product_id, pid)
      where household_id = h and status = 'pending'
        and (product_id = pid or (product_id is null and item_name = p_name))
      returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into lista_ids from upd;

  select current_stock into depois from products where id = pid;
  perform mercado_log_event(h, pid, p_name, 'compra_registrada', antes, depois, p_qty, 'bot',
    jsonb_build_object('preco', p_price, 'marca', p_brand, 'lista_ids', to_jsonb(lista_ids)));

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', depois,
    'preco_anterior', prev_price, 'economia', saved,
    'acao', 'compra_registrada', 'antes', antes, 'depois', depois,
    -- para o bot poder dizer "e tirei da sua lista"
    'saiu_da_lista', coalesce(array_length(lista_ids, 1), 0));
end $fn$;

-- ============ FINALIZAR O CARRINHO ============
-- Identica a de 0012, com a mesma mudanca no where.
create or replace function mercado_cart_apply_item(
  h uuid, p_product_id uuid, p_name text, p_price numeric, p_qty numeric, p_unit text)
returns numeric language plpgsql security definer set search_path = public as $fn$
declare pid uuid; prev_price numeric; saved numeric;
begin
  p_name := lower(trim(p_name));
  pid := p_product_id;
  if pid is null then
    select id into pid from products where household_id = h and name = p_name;
  end if;

  if pid is null then
    insert into products (household_id, name, unit, current_stock)
      values (h, p_name, coalesce(p_unit,'un'), p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases
    where product_id = pid order by purchased_at desc limit 1;

  insert into purchases (household_id, product_id, item_name, unit_price, quantity, unit)
    values (h, pid, p_name, p_price, p_qty, coalesce(p_unit,'un'));

  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;

  update shopping_list set status = 'bought', bought_at = now(),
                           product_id = coalesce(product_id, pid)
    where household_id = h and status = 'pending'
      and (product_id = pid or (product_id is null and item_name = p_name));

  return saved;
end $fn$;

-- ============ PERMISSOES (repetidas para a migration ser autossuficiente) ============
revoke execute on function
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text) from public, anon;
grant  execute on function
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text) to service_role;
revoke execute on function
  mercado_cart_apply_item(uuid, uuid, text, numeric, numeric, text) from public, anon;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999071; h uuid; r json; st text; lid uuid; pid uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0027', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- O caso do dono: item entra na lista SEM produto cadastrado, entao nasce orfao.
  perform mercado_add_to_list(cid, 'miojo', 1, 'un');
  select id, product_id into lid, pid from shopping_list where household_id = h and item_name = 'miojo';
  assert pid is null, 'sanidade: o item deveria ter nascido sem product_id, que e o bug';

  -- "peguei o miojo, foi quatorze reais"
  r := mercado_apply_purchase(cid, 'miojo', null, 14.00, 1, 'un');
  assert (r->>'ok')::boolean, 'a compra deveria gravar';
  assert (r->>'saiu_da_lista')::int = 1,
    format('a compra tinha que tirar 1 item da lista, tirou %s', r->>'saiu_da_lista');

  select status, product_id into st, pid from shopping_list where id = lid;
  assert st = 'bought', format('o miojo deveria ter saido da lista, esta %s', st);
  assert pid is not null, 'o product_id deveria ter sido curado no mesmo update';

  -- Nao pode varrer a lista inteira: outro item pendente fica intacto.
  perform mercado_add_to_list(cid, 'sabao', 1, 'un');
  perform mercado_apply_purchase(cid, 'miojo', null, 14.00, 1, 'un');
  select status into st from shopping_list where household_id = h and item_name = 'sabao';
  assert st = 'pending', format('comprar miojo nao pode mexer no sabao, ficou %s', st);

  -- Nome parecido nao casa: a comparacao e exata, nao aproximada.
  perform mercado_add_to_list(cid, 'leite condensado', 1, 'un');
  perform mercado_apply_purchase(cid, 'leite', null, 5.00, 1, 'l');
  select status into st from shopping_list where household_id = h and item_name = 'leite condensado';
  assert st = 'pending', format('comprar leite nao pode tirar leite condensado da lista, ficou %s', st);

  -- Carrinho: mesmo casamento, pela outra porta.
  perform mercado_add_to_list(cid, 'cafe', 1, 'un');
  perform mercado_trip_add_h(h, 'cafe', 19.90, 1, 'un');
  perform mercado_trip_finalize(cid);
  select status into st from shopping_list where household_id = h and item_name = 'cafe';
  assert st = 'bought', format('finalizar o carrinho deveria tirar o cafe da lista, ficou %s', st);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0027 (lista casa por nome) OK';
end $test$;