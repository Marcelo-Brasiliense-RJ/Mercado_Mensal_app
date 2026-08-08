-- Mercado_app: editar item que ja esta no carrinho, pelo app.
-- Rode DEPOIS de 0033.
--
-- O painel "No mercado" so deixava TIRAR item (mercado_trip_remove_item_web, 0012) e,
-- desde a 0026, pegar item novo. Corrigir a quantidade ou o preco de um item que ja
-- estava la exigia remover e pegar de novo. Como o preco falado no mercado erra com
-- frequencia (a etiqueta e da embalagem, e a transcricao come a virgula), corrigir na
-- hora e o gesto mais comum de todos.
--
-- Diferente de mercado_compra_update_web (0033), aqui NAO ha ajuste de estoque: item de
-- carrinho so vira compra, e so mexe em products, quando a compra e finalizada.
create or replace function mercado_trip_update_item_web(
  p_id uuid, p_qty numeric default null, p_price numeric default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; nova_qtd numeric; novo_preco numeric; total numeric; tid uuid;
begin
  -- Validacao ANTES de resolver a casa, mesmo motivo das outras _web: deixa o caso
  -- invalido testavel sem JWT, ja que auth.uid() e null fora de requisicao autenticada.
  if (p_qty is not null and p_qty <= 0) or (p_price is not null and p_price < 0) then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  update trip_items ti
     set quantity   = coalesce(p_qty, ti.quantity),
         unit_price = coalesce(p_price, ti.unit_price)
    from shopping_trips s
   where ti.id = p_id and ti.trip_id = s.id
     and s.household_id = h and s.status = 'open'
  returning ti.trip_id, ti.quantity, ti.unit_price into tid, nova_qtd, novo_preco;

  if tid is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  select coalesce(sum(quantity * unit_price), 0) into total from trip_items where trip_id = tid;

  return json_build_object('ok', true, 'qty', nova_qtd, 'price', novo_preco,
    'total_parcial', total);
end $fn$;

revoke execute on function mercado_trip_update_item_web(uuid, numeric, numeric) from public, anon;
grant  execute on function mercado_trip_update_item_web(uuid, numeric, numeric) to authenticated;

-- ============ SELF-TEST ============
-- O caminho autenticado depende de auth.uid(), null aqui (mesma limitacao das outras
-- _web). O que este bloco prova e a validacao de entrada e a mecanica do update.
do $test$
declare cid bigint := 999999141; h uuid; tid uuid; iid uuid; r json; q numeric; p numeric; t numeric;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0034', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- validacao antes de resolver a casa, alcancavel sem sessao
  r := mercado_trip_update_item_web(gen_random_uuid(), -1, null);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'quantidade negativa e invalida';
  r := mercado_trip_update_item_web(gen_random_uuid(), 1, 1);
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem sessao deveria ser sem_familia';

  -- mecanica: carrinho com dois itens, corrige o preco de um
  perform mercado_trip_add_h(h, 'arroz', 19.95, 5, 'kg');   -- entrou como preco por kg
  perform mercado_trip_add_h(h, 'feijao', 8.00, 1, 'kg');
  select id into tid from shopping_trips where household_id = h and status = 'open';
  select id into iid from trip_items where trip_id = tid and item_name = 'arroz';

  select coalesce(sum(quantity * unit_price), 0) into t from trip_items where trip_id = tid;
  assert t = 107.75, format('5 x 19,95 mais 8 deveria ser 107,75, veio %s', t);

  -- o caso real: o pacote de 5 kg custou 19,95, entao o preco por kg e 3,99
  update trip_items ti set unit_price = 3.99
    from shopping_trips s where ti.id = iid and ti.trip_id = s.id and s.household_id = h;
  select quantity, unit_price into q, p from trip_items where id = iid;
  assert q = 5 and p = 3.99, format('deveria ficar 5 x 3,99, veio %s x %s', q, p);

  select coalesce(sum(quantity * unit_price), 0) into t from trip_items where trip_id = tid;
  assert t = 27.95, format('total deveria cair para 27,95, veio %s', t);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0034 (editar item do carrinho) OK';
end $test$;
