-- Mercado_app — multi-família (multi-tenant) + auth + convite
-- Rode DEPOIS de 0001 e 0002. Idempotente onde dá.

-- ============ 1. FAMÍLIA GANHA CÓDIGO DE CONVITE ============
alter table households add column if not exists invite_code text unique;

-- ============ 2. MEMBROS (unifica identidade web e Telegram) ============
-- Cada linha é uma identidade (login web via auth.users OU chat do Telegram) ligada a uma família.
drop table if exists users cascade;
create table if not exists household_members (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  auth_user_id     uuid references auth.users(id) on delete cascade,
  telegram_chat_id bigint,
  name             text,
  role             text not null default 'member',  -- owner | member
  created_at       timestamptz not null default now(),
  unique (auth_user_id),
  unique (telegram_chat_id)
);
create index if not exists idx_members_household on household_members (household_id);
alter table household_members enable row level security;

-- ============ 3. GERADOR DE CÓDIGO DE CONVITE ============
create or replace function mercado_gen_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    perform 1 from households where invite_code = c;
    if not found then return c; end if;
  end loop;
end $$;

-- Famílias do usuário logado (SECURITY DEFINER: ignora RLS, evita recursão nas policies).
create or replace function mercado_uid_households()
returns setof uuid language sql stable security definer set search_path = public as $$
  select household_id from household_members where auth_user_id = auth.uid()
$$;

-- ============ 4. RLS: cada um só vê a própria família ============
drop policy if exists hm_rw on household_members;
create policy hm_rw on household_members for all to authenticated
  using (household_id in (select mercado_uid_households()))
  with check (household_id in (select mercado_uid_households()));

drop policy if exists hh_rw on households;
create policy hh_rw on households for all to authenticated
  using (id in (select mercado_uid_households()))
  with check (id in (select mercado_uid_households()));

drop policy if exists prod_rw on products;
create policy prod_rw on products for all to authenticated
  using (household_id in (select mercado_uid_households()))
  with check (household_id in (select mercado_uid_households()));

drop policy if exists pur_rw on purchases;
create policy pur_rw on purchases for all to authenticated
  using (household_id in (select mercado_uid_households()))
  with check (household_id in (select mercado_uid_households()));

drop policy if exists list_rw on shopping_list;
create policy list_rw on shopping_list for all to authenticated
  using (household_id in (select mercado_uid_households()))
  with check (household_id in (select mercado_uid_households()));

drop policy if exists bud_rw on budgets;
create policy bud_rw on budgets for all to authenticated
  using (household_id in (select mercado_uid_households()))
  with check (household_id in (select mercado_uid_households()));

-- ============ 5. RPCs DE FAMÍLIA — WEB (identidade = auth.uid()) ============
create or replace function mercado_create_family_web(p_name text default 'Minha casa')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid; h uuid; code text;
begin
  uid := auth.uid();
  if uid is null then return json_build_object('ok', false, 'erro', 'nao_autenticado'); end if;
  code := mercado_gen_code();
  insert into households (name, invite_code) values (coalesce(nullif(trim(p_name),''),'Minha casa'), code)
    returning id into h;
  insert into household_members (household_id, auth_user_id, role) values (h, uid, 'owner')
    on conflict (auth_user_id) do update set household_id = excluded.household_id, role = 'owner';
  return json_build_object('ok', true, 'household_id', h, 'invite_code', code);
end $$;

create or replace function mercado_join_family_web(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid; h uuid;
begin
  uid := auth.uid();
  if uid is null then return json_build_object('ok', false, 'erro', 'nao_autenticado'); end if;
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then return json_build_object('ok', false, 'erro', 'codigo_invalido'); end if;
  insert into household_members (household_id, auth_user_id) values (h, uid)
    on conflict (auth_user_id) do update set household_id = excluded.household_id;
  return json_build_object('ok', true, 'household_id', h, 'familia', (select name from households where id = h));
end $$;

create or replace function mercado_my_household()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('household_id', hm.household_id, 'familia', h.name,
                           'invite_code', h.invite_code, 'role', hm.role)
  from household_members hm join households h on h.id = hm.household_id
  where hm.auth_user_id = auth.uid() limit 1
$$;

-- ============ 6. RPCs DE FAMÍLIA — TELEGRAM (identidade = chat_id) ============
create or replace function mercado_create_family(p_chat_id bigint, p_name text default 'Minha casa', p_member_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; code text;
begin
  code := mercado_gen_code();
  insert into households (name, invite_code) values (coalesce(nullif(trim(p_name),''),'Minha casa'), code)
    returning id into h;
  insert into household_members (household_id, telegram_chat_id, name, role) values (h, p_chat_id, p_member_name, 'owner')
    on conflict (telegram_chat_id) do update set household_id = excluded.household_id, role = 'owner';
  return json_build_object('ok', true, 'household_id', h, 'invite_code', code);
end $$;

create or replace function mercado_join_family(p_code text, p_chat_id bigint, p_member_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then return json_build_object('ok', false, 'erro', 'codigo_invalido'); end if;
  insert into household_members (household_id, telegram_chat_id, name) values (h, p_chat_id, p_member_name)
    on conflict (telegram_chat_id) do update set household_id = excluded.household_id;
  return json_build_object('ok', true, 'household_id', h, 'familia', (select name from households where id = h));
end $$;

-- Resolve a família a partir do chat do Telegram (null se ainda não entrou em nenhuma).
create or replace function mercado_resolve_household(p_chat_id bigint)
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from household_members where telegram_chat_id = p_chat_id limit 1
$$;

-- ============ 7. MUTAÇÕES (agora com guarda de "sem família") ============
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; prev_price numeric; saved numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id into pid from products where household_id = h and name = p_name;
  if pid is null then
    insert into products (household_id, name, unit, current_stock)
      values (h, p_name, coalesce(p_unit,'un'), p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        unit = coalesce(p_unit, unit), updated_at = now() where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', (select current_stock from products where id = pid),
    'preco_anterior', prev_price, 'economia', saved);
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
    return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty, 'taxa_recalibrada', false);
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

  return json_build_object('ok', true, 'item', p_name, 'estoque', p_qty,
    'taxa_mes', (select consumption_rate_month from products where id = pid),
    'taxa_recalibrada', t0 is not null);
end $$;

create or replace function mercado_add_to_list(
  p_chat_id bigint, p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; estoque numeric; nivel numeric; ult_preco numeric; ja_tem boolean;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, par_level into pid, estoque, nivel from products where household_id = h and name = p_name;
  select unit_price into ult_preco from purchases where product_id = pid order by purchased_at desc limit 1;
  ja_tem := pid is not null and estoque is not null and nivel is not null and nivel > 0 and estoque >= nivel;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price)
    values (h, pid, p_name, p_qty, coalesce(p_unit,'un'), ult_preco);

  return json_build_object('ok', true, 'item', p_name, 'ja_tem_em_casa', ja_tem,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0), 'preco_estimado', ult_preco);
end $$;

create or replace function mercado_apply_consumption(
  p_chat_id bigint, p_name text, p_qty numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));
  select id into pid from products where household_id = h and name = p_name;
  if pid is null then return json_build_object('ok', false, 'erro', 'produto_nao_encontrado', 'item', p_name); end if;
  update products set current_stock = greatest(0, current_stock - coalesce(p_qty, current_stock)), updated_at = now()
    where id = pid;
  return json_build_object('ok', true, 'item', p_name, 'estoque_novo', (select current_stock from products where id = pid));
end $$;

-- ============ 8. PERMISSÕES ============
revoke execute on all functions in schema public from public, anon;

-- Web: usuário autenticado gerencia a própria família
grant execute on function
  mercado_create_family_web(text),
  mercado_join_family_web(text),
  mercado_my_household()
  to authenticated;

-- Telegram / bot (n8n): service_role
grant execute on function
  mercado_create_family(bigint, text, text),
  mercado_join_family(text, bigint, text),
  mercado_resolve_household(bigint),
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text),
  mercado_apply_inventory(bigint, text, numeric, text),
  mercado_add_to_list(bigint, text, numeric, text),
  mercado_apply_consumption(bigint, text, numeric),
  mercado_daily_depletion()
  to service_role;
