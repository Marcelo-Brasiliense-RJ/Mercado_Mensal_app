-- 0011_list_write.sql
-- Lista de compras real pelo app web: leitura marca o que ja esta em estoque,
-- e escrita (adicionar, comprar->repoe estoque, remover).

-- Leitura: inclui em_estoque (true se o produto ligado tem estoque > 0).
-- O app usa isso para NAO contar no total a pagar o que voce ja tem.
create or replace function mercado_list_web()
returns json language sql stable security definer set search_path = public as $$
  with h as (select household_id from household_members where auth_user_id = auth.uid() limit 1)
  select coalesce(json_agg(json_build_object(
    'id', s.id,
    'name', s.item_name,
    'desired_quantity', s.desired_quantity,
    'unit', s.unit,
    'estimated_price', s.estimated_price,
    'status', s.status,
    'em_estoque', coalesce(p.current_stock, 0) > 0
  ) order by s.created_at), '[]'::json)
  from shopping_list s
  join h on s.household_id = h.household_id
  left join products p on p.id = s.product_id
  where s.status <> 'removed'
$$;

-- Adicionar item manual a lista (persistindo). Liga ao produto se ja existir.
create or replace function mercado_list_add_web(
  p_name text, p_qty numeric default 1, p_unit text default 'un', p_price numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; pid uuid;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select id into pid from products where household_id = hid and name = lower(trim(p_name));
  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price, status)
    values (hid, pid, lower(trim(p_name)), greatest(1, coalesce(p_qty,1)), coalesce(p_unit,'un'), p_price, 'pending');
  return json_build_object('ok', true);
end $$;

-- Comprar (dar baixa pela lista): marca comprado E repoe o estoque.
create or replace function mercado_list_buy_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it record; pid uuid; n int := 0;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  for it in select * from shopping_list
            where id = any(p_ids) and household_id = hid and status = 'pending' loop
    if it.product_id is not null then
      update products set current_stock = current_stock + it.desired_quantity, updated_at = now()
        where id = it.product_id;
    else
      insert into products (household_id, name, unit, current_stock, par_level)
        values (hid, lower(trim(it.item_name)), coalesce(it.unit,'un'), it.desired_quantity, it.desired_quantity)
      on conflict (household_id, name) do update
        set current_stock = products.current_stock + excluded.current_stock, updated_at = now()
      returning id into pid;
      update shopping_list set product_id = pid where id = it.id;
    end if;
    update shopping_list set status = 'bought', bought_at = now() where id = it.id;
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'comprados', n);
end $$;

-- Remover itens da lista.
create or replace function mercado_list_remove_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  update shopping_list set status = 'removed' where id = any(p_ids) and household_id = hid;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'removidos', n);
end $$;

grant execute on function
  mercado_list_add_web(text, numeric, text, numeric),
  mercado_list_buy_web(uuid[]),
  mercado_list_remove_web(uuid[])
  to authenticated;
