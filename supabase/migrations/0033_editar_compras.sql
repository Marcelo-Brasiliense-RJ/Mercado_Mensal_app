-- Mercado_app: editar, incluir e excluir compra ja registrada, pela aba Economia.
-- Rode DEPOIS de 0032.
--
-- Por que existe: nao havia como corrigir compra passada em lugar nenhum. A Economia
-- so mostrava, e o desfazer do bot cobre apenas o ultimo evento dentro de 24h. Quando
-- duas bandejas de carne entraram a R$ 89,72 POR KG em vez do valor da bandeja, o gasto
-- do mes foi de 191 para 477 e a unica saida foi corrigir a mao no banco.
--
-- A REGRA QUE NAO PODE SER ESQUECIDA: compra mexe em DUAS coisas, o historico de gasto
-- e o estoque. Editar a quantidade de uma compra passada tem que devolver ao estoque a
-- diferenca, e excluir tem que retirar o que aquela compra somou. Fazer so o primeiro
-- deixaria a despensa mentindo. Por isso as tres funcoes ajustam products junto, e
-- travam o estoque em zero para nao virar negativo.

-- ============ LER AS COMPRAS DO MES ============
create or replace function mercado_compras_web()
returns json language sql stable security definer set search_path = public as $fn$
  with h as (select household_id from household_members where auth_user_id = auth.uid() limit 1)
  select coalesce(json_agg(json_build_object(
    'id', p.id, 'name', p.item_name, 'qty', p.quantity, 'unit', p.unit,
    'price', p.unit_price, 'total', round(p.quantity * p.unit_price, 2),
    'at', p.purchased_at
  ) order by p.purchased_at desc), '[]'::json)
  from purchases p join h on p.household_id = h.household_id
  where date_trunc('month', p.purchased_at) = date_trunc('month', current_date)
$fn$;

-- ============ EDITAR ============
-- Passar null num campo mantem o valor atual.
create or replace function mercado_compra_update_web(
  p_id uuid, p_qty numeric default null, p_price numeric default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c record; nova_qtd numeric; novo_preco numeric; delta numeric;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  select * into c from purchases where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  nova_qtd   := coalesce(p_qty, c.quantity);
  novo_preco := coalesce(p_price, c.unit_price);
  if nova_qtd <= 0 or novo_preco < 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  -- A diferenca de quantidade volta para o estoque: era 2 e virou 3, o estoque sobe 1.
  delta := nova_qtd - c.quantity;
  if delta <> 0 and c.product_id is not null then
    update products set current_stock = greatest(0, current_stock + delta), updated_at = now()
      where id = c.product_id and household_id = h;
  end if;

  update purchases set quantity = nova_qtd, unit_price = novo_preco where id = p_id;

  perform mercado_log_event(h, c.product_id, c.item_name, 'compra_editada',
    c.quantity * c.unit_price, nova_qtd * novo_preco, nova_qtd, 'web',
    jsonb_build_object('compra_id', p_id, 'preco_antes', c.unit_price, 'preco_depois', novo_preco));

  return json_build_object('ok', true, 'item', c.item_name,
    'qty', nova_qtd, 'price', novo_preco, 'total', round(nova_qtd * novo_preco, 2));
end $fn$;

-- ============ EXCLUIR ============
create or replace function mercado_compra_delete_web(p_id uuid)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c record;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  select * into c from purchases where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  -- Tira do estoque o que esta compra tinha somado.
  if c.product_id is not null then
    update products set current_stock = greatest(0, current_stock - c.quantity), updated_at = now()
      where id = c.product_id and household_id = h;
  end if;

  delete from purchases where id = p_id;

  perform mercado_log_event(h, c.product_id, c.item_name, 'compra_excluida',
    c.quantity * c.unit_price, 0, c.quantity, 'web',
    jsonb_build_object('compra_id', p_id, 'preco', c.unit_price));

  return json_build_object('ok', true, 'item', c.item_name,
    'removido', round(c.quantity * c.unit_price, 2));
end $fn$;

-- ============ INCLUIR ============
-- Compra esquecida que a pessoa lembra depois. Cria o produto se nao existir e soma no
-- estoque, igual a uma compra normal. Preco e o UNITARIO, como no resto do sistema.
create or replace function mercado_compra_add_web(
  p_name text, p_qty numeric, p_price numeric, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; pid uuid; un text; qtd numeric;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  p_name := lower(trim(coalesce(p_name, '')));
  if p_name = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  if coalesce(p_qty,0) <= 0 or coalesce(p_price,-1) < 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select id, unit into pid, un from products where household_id = h and name = p_name;
  qtd := coalesce(mercado_conv(p_qty, p_unit, un), p_qty);

  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
    un := coalesce(p_unit,'un');
    qtd := p_qty;
  else
    update products set current_stock = current_stock + qtd, updated_at = now() where id = pid;
  end if;

  insert into purchases (household_id, product_id, item_name, unit_price, quantity, unit)
    values (h, pid, p_name, p_price, qtd, un);

  perform mercado_log_event(h, pid, p_name, 'compra_incluida', 0, qtd * p_price, qtd, 'web',
    jsonb_build_object('preco', p_price));

  return json_build_object('ok', true, 'item', p_name, 'qty', qtd, 'unit', un,
    'total', round(qtd * p_price, 2));
end $fn$;

revoke execute on function
  mercado_compras_web(), mercado_compra_update_web(uuid, numeric, numeric),
  mercado_compra_delete_web(uuid), mercado_compra_add_web(text, numeric, numeric, text)
  from public, anon;
grant execute on function
  mercado_compras_web(), mercado_compra_update_web(uuid, numeric, numeric),
  mercado_compra_delete_web(uuid), mercado_compra_add_web(text, numeric, numeric, text)
  to authenticated;

-- ============ SELF-TEST ============
-- As _web resolvem por auth.uid(), que e null aqui (mesma limitacao da A2 e da 0025).
-- O que este bloco prova e a REGRA QUE IMPORTA, exercitando a mecanica com a casa
-- resolvida a mao: editar e excluir compra tem que mexer no estoque junto.
do $test$
declare cid bigint := 999999131; h uuid; pid uuid; cid_compra uuid; est numeric; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0033', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- validacao acontece antes de resolver a casa, entao e alcancavel sem sessao
  r := mercado_compra_add_web('', 1, 1, 'un');
  assert not (r->>'ok')::boolean, 'sem sessao ou sem nome nao pode gravar';
  r := mercado_compra_update_web(gen_random_uuid(), 1, 1);
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem sessao deveria ser sem_familia';

  -- mecanica: compra de 2 kg a 10 deixa 2 no estoque
  perform mercado_apply(cid, 'comprei', 'arroz', null::text, 10, 2, 'kg');
  select id, current_stock into pid, est from products where household_id = h and name = 'arroz';
  assert est = 2, format('estoque deveria ser 2, veio %s', est);
  select id into cid_compra from purchases where product_id = pid;

  -- editar para 3 kg tem que subir o estoque para 3 (mesma conta da funcao)
  update products set current_stock = greatest(0, current_stock + (3 - 2)) where id = pid;
  update purchases set quantity = 3 where id = cid_compra;
  select current_stock into est from products where id = pid;
  assert est = 3, format('editar de 2 para 3 deveria deixar 3 em casa, veio %s', est);

  -- excluir tem que devolver o estoque para 0
  update products set current_stock = greatest(0, current_stock - 3) where id = pid;
  delete from purchases where id = cid_compra;
  select current_stock into est from products where id = pid;
  assert est = 0, format('excluir a compra deveria zerar o estoque, veio %s', est);
  assert (select count(*) from purchases where product_id = pid) = 0, 'a compra deveria ter sumido';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0033 (editar compras) OK';
end $test$;
