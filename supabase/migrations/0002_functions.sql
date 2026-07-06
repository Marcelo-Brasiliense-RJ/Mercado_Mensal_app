-- Mercado_app — funções de negócio (RPCs)
-- Toda mutação de estoque/lista/compra passa por aqui. n8n chama uma função por item.
-- SECURITY DEFINER: rodam ignorando RLS. Execução liberada só para service_role.

-- Resolve (ou cria) a casa e registra o chat_id do Telegram.
-- MVP: uma casa compartilhada por toda a família (a primeira que existir).
create or replace function mercado_resolve_household(p_chat_id bigint, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from households order by created_at limit 1;
  if h is null then
    insert into households default values returning id into h;
  end if;
  insert into users (household_id, telegram_chat_id, name)
    values (h, p_chat_id, p_name)
    on conflict (telegram_chat_id) do update set household_id = excluded.household_id;
  return h;
end $$;

-- COMPRA: soma ao estoque + registra no histórico + calcula economia vs último preço.
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; prev_price numeric; saved numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));

  select id into pid from products where household_id = h and name = p_name;
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

  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));

  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;

  -- se o item estava na lista, marca como comprado
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  return json_build_object('item', p_name, 'estoque_novo',
    (select current_stock from products where id = pid),
    'preco_anterior', prev_price, 'economia', saved);
end $$;

-- CONFERÊNCIA: sobrescreve o estoque com a verdade e recalibra a taxa de consumo.
create or replace function mercado_apply_inventory(
  p_chat_id bigint, p_name text, p_qty numeric, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; est numeric; t0 timestamptz; old_rate numeric;
        dias numeric; comprado numeric; consumido numeric; nova_taxa numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));

  select id, current_stock, last_inventory_at, consumption_rate_month
    into pid, est, t0, old_rate
    from products where household_id = h and name = p_name;

  if pid is null then
    insert into products (household_id, name, unit, current_stock, last_inventory_at)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, now()) returning id into pid;
    return json_build_object('item', p_name, 'estoque', p_qty, 'taxa_recalibrada', false);
  end if;

  -- recalibra só se houver conferência anterior para medir o intervalo
  if t0 is not null then
    dias := greatest(1, extract(epoch from (now() - t0)) / 86400);
    select coalesce(sum(quantity),0) into comprado from purchases
      where product_id = pid and purchased_at > t0;
    consumido := greatest(0, est + comprado - p_qty);
    nova_taxa := round(consumido / dias * 30, 3);
    old_rate := case when coalesce(old_rate,0) = 0 then nova_taxa
                     else round(0.5*old_rate + 0.5*nova_taxa, 3) end;
  end if;

  update products set current_stock = p_qty, last_inventory_at = now(),
                      unit = coalesce(p_unit, unit),
                      consumption_rate_month = coalesce(old_rate, consumption_rate_month),
                      updated_at = now()
    where id = pid;

  return json_build_object('item', p_name, 'estoque', p_qty,
    'taxa_mes', (select consumption_rate_month from products where id = pid),
    'taxa_recalibrada', t0 is not null);
end $$;

-- LISTA: adiciona à lista e avisa se já tem acima do nível normal.
create or replace function mercado_add_to_list(
  p_chat_id bigint, p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; estoque numeric; nivel numeric; ult_preco numeric; ja_tem boolean;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  select unit_price into ult_preco from purchases
    where product_id = pid order by purchased_at desc limit 1;

  ja_tem := pid is not null and estoque is not null and nivel is not null
            and nivel > 0 and estoque >= nivel;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price)
    values (h, pid, p_name, p_qty, coalesce(p_unit,'un'), ult_preco);

  return json_build_object('item', p_name, 'ja_tem_em_casa', ja_tem,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0),
    'preco_estimado', ult_preco);
end $$;

-- CONSUMO: baixa manual explícita ("acabou / usei").
create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  p_name := lower(trim(p_name));
  select id into pid from products where household_id = h and name = p_name;
  if pid is null then
    return json_build_object('item', p_name, 'erro', 'produto não encontrado');
  end if;
  update products
    set current_stock = greatest(0, current_stock - coalesce(p_qty, current_stock)),
        updated_at = now()
    where id = pid;
  return json_build_object('item', p_name,
    'estoque_novo', (select current_stock from products where id = pid));
end $$;

-- JOB DIÁRIO: baixa estimada de todos os produtos (taxa mensal / 30).
create or replace function mercado_daily_depletion()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update products
    set current_stock = greatest(0, current_stock - consumption_rate_month/30.0),
        updated_at = now()
    where consumption_rate_month > 0 and current_stock > 0;
  get diagnostics n = row_count;
  return n;
end $$;

-- Permissões: só service_role executa as RPCs.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  mercado_resolve_household(bigint, text),
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text),
  mercado_apply_inventory(bigint, text, numeric, text),
  mercado_add_to_list(bigint, text, numeric, text),
  mercado_apply_consumption(bigint, text, numeric),
  mercado_daily_depletion()
  to service_role;
