-- 0013_add_to_list_qty.sql
-- "Esta faltando X" monta a lista de compras calculando quanto falta pro normal.
-- Quando a quantidade nao e informada (p_qty <= 0), usa greatest(1, par_level - estoque).
-- Se a pessoa disse um numero, usa o numero. Rode DEPOIS de 0012.

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

  return json_build_object('item', p_name, 'ja_tem_em_casa', ja_tem,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0),
    'preco_estimado', ult_preco, 'quantidade', qtd);
end $$;

grant execute on function mercado_add_to_list(bigint, text, numeric, text) to service_role;
