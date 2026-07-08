-- 0010_stock_to_list.sql
-- Manda itens do estoque para a lista de compras (em lote), pelo app web.
-- desired_quantity = quanto falta para o nivel normal (par_level - current_stock),
-- no minimo 1. Nao duplica itens que ja estao 'pending' na lista.

create or replace function mercado_stock_to_list_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price, status)
  select p.household_id, p.id, p.name,
         greatest(1, ceil(p.par_level - p.current_stock))::numeric,
         p.unit,
         (select unit_price from purchases where product_id = p.id order by purchased_at desc limit 1),
         'pending'
  from products p
  where p.id = any(p_ids) and p.household_id = hid
    and not exists (
      select 1 from shopping_list s
      where s.household_id = hid and s.product_id = p.id and s.status = 'pending'
    );

  get diagnostics n = row_count;
  return json_build_object('ok', true, 'adicionados', n);
end $$;

grant execute on function mercado_stock_to_list_web(uuid[]) to authenticated;
