-- 0008_read_web.sql
-- Leitura do app web (usuario autenticado). As tabelas tem RLS fechado (so
-- service_role), entao a leitura do app passa por estas RPCs security definer,
-- que resolvem a familia pelo auth.uid() (mesmo padrao das _web).

-- ===== ESTOQUE =====
create or replace function mercado_stock_web()
returns json language sql stable security definer set search_path = public as $$
  with h as (
    select household_id from household_members where auth_user_id = auth.uid() limit 1
  ),
  precos as (
    select product_id,
           (array_agg(unit_price order by purchased_at desc))[1] as price_last,
           avg(unit_price) as price_avg
    from purchases where product_id is not null
    group by product_id
  )
  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'name', p.name,
    'category', '',
    'unit', p.unit,
    'current', p.current_stock,
    'normal', p.par_level,
    'priceLast', pr.price_last,
    'priceAvg', pr.price_avg,
    'trend', case when coalesce(pr.price_avg,0) > 0
                  then round(((pr.price_last - pr.price_avg) / pr.price_avg)::numeric, 2)
                  else 0 end
  ) order by p.name), '[]'::json)
  from products p
  join h on p.household_id = h.household_id
  left join precos pr on pr.product_id = p.id
$$;

-- ===== LISTA DE COMPRAS =====
create or replace function mercado_list_web()
returns json language sql stable security definer set search_path = public as $$
  with h as (
    select household_id from household_members where auth_user_id = auth.uid() limit 1
  )
  select coalesce(json_agg(json_build_object(
    'id', s.id,
    'name', s.item_name,
    'desired_quantity', s.desired_quantity,
    'unit', s.unit,
    'estimated_price', s.estimated_price,
    'status', s.status
  ) order by s.created_at), '[]'::json)
  from shopping_list s
  join h on s.household_id = h.household_id
  where s.status <> 'removed'
$$;

-- ===== ECONOMIA (orcamento, gasto por mes, economia vs historico) =====
create or replace function mercado_economia_web()
returns json language sql stable security definer set search_path = public as $$
  with h as (
    select household_id from household_members where auth_user_id = auth.uid() limit 1
  ),
  meses as (
    select date_trunc('month', current_date) - ((n) || ' months')::interval as m
    from generate_series(5, 0, -1) as n
  ),
  gasto_mes as (
    select date_trunc('month', p.purchased_at) as m, sum(p.unit_price * p.quantity) as total
    from purchases p join h on p.household_id = h.household_id
    group by 1
  ),
  savings_calc as (
    select p.item_name as name,
           avg(p.unit_price) as avg_price,
           (array_agg(p.unit_price order by p.purchased_at desc))[1] as last_price
    from purchases p join h on p.household_id = h.household_id
    group by p.item_name
  )
  select json_build_object(
    'budget', json_build_object(
      'total', coalesce((select amount from budgets b join h on b.household_id = h.household_id
                         where b.month = date_trunc('month', current_date)::date limit 1), 0),
      'spent', coalesce((select total from gasto_mes where m = date_trunc('month', current_date)), 0)
    ),
    'months', (
      select coalesce(json_agg(json_build_object(
        'label', (array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[extract(month from meses.m)::int],
        'value', round(coalesce(g.total, 0))::int,
        'current', meses.m = date_trunc('month', current_date)
      ) order by meses.m), '[]'::json)
      from meses left join gasto_mes g on g.m = meses.m
    ),
    'savings', (
      select coalesce(json_agg(json_build_object(
        'name', s.name,
        'oldPrice', round(s.avg_price, 2),
        'newPrice', round(s.last_price, 2),
        'saved', round(s.avg_price - s.last_price, 2)
      )), '[]'::json)
      from savings_calc s where s.last_price < s.avg_price
    )
  )
$$;

grant execute on function
  mercado_stock_web(),
  mercado_list_web(),
  mercado_economia_web()
  to authenticated;
