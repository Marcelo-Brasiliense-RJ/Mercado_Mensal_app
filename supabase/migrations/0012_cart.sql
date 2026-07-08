-- 0012_cart.sql
-- Modo "No mercado": carrinho de compra em andamento (uma sessao por casa).
-- Entrada pelo Telegram (bot n8n), painel ao vivo no app web.
-- Rode DEPOIS de 0011.

-- ============ TABELAS ============
-- A sessao de compra. No maximo UMA aberta por casa (indice unico parcial).
create table if not exists shopping_trips (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  status       text not null default 'open',   -- open | finalized | cancelled
  started_at   timestamptz not null default now(),
  finalized_at timestamptz
);
create unique index if not exists uq_trip_open_per_house
  on shopping_trips (household_id) where status = 'open';

-- O que foi pego. unit_price sempre preenchido (o bot pergunta o preco).
create table if not exists trip_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references shopping_trips(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  item_name    text not null,
  quantity     numeric not null default 1,
  unit         text not null default 'un',
  unit_price   numeric not null,
  above_par    boolean not null default false,  -- estava acima do nivel quando pego
  created_at   timestamptz not null default now()
);
create index if not exists idx_trip_items_trip on trip_items (trip_id);

alter table shopping_trips enable row level security;
alter table trip_items    enable row level security;
-- Sem policies: acesso so via funcoes SECURITY DEFINER (service_role / auth.uid).

-- ============ AUXILIAR: aplica um item do carrinho como compra ============
-- Espelha mercado_apply_purchase, mas com a casa ja resolvida. Repoe estoque,
-- grava historico e marca item da lista como comprado. Retorna a economia.
create or replace function mercado_cart_apply_item(
  h uuid, p_product_id uuid, p_name text, p_price numeric, p_qty numeric, p_unit text)
returns numeric language plpgsql security definer set search_path = public as $$
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

  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  return saved;
end $$;
revoke execute on function mercado_cart_apply_item(uuid, uuid, text, numeric, numeric, text) from public, anon;

-- ============ FUNCOES DO BOT (service_role) ============

-- Abre a compra. Idempotente: se ja houver aberta, devolve a existente.
create or replace function mercado_trip_start(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; tid uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    insert into shopping_trips (household_id) values (h) returning id into tid;
  end if;
  return json_build_object('ok', true, 'trip_id', tid);
end $$;

-- Adiciona um item ao carrinho aberto.
-- Confronto: se estoque >= nivel normal e sem confirmacao, NAO grava e pede confirmar.
-- Preco: obrigatorio (o agente pergunta antes de chamar).
create or replace function mercado_trip_add(
  p_chat_id bigint, p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un', p_confirm boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; tid uuid; pid uuid; estoque numeric; nivel numeric; above boolean; total numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    return json_build_object('ok', false, 'erro', 'sem_compra_aberta');
  end if;

  p_name := lower(trim(p_name));
  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  above := pid is not null and nivel is not null and nivel > 0
           and estoque is not null and estoque >= nivel;

  if above and not coalesce(p_confirm, false) then
    return json_build_object('ok', true, 'needs_confirm', true, 'item', p_name,
      'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0));
  end if;

  if p_price is null then
    return json_build_object('ok', false, 'erro', 'sem_preco', 'item', p_name);
  end if;

  insert into trip_items (trip_id, household_id, product_id, item_name, quantity, unit, unit_price, above_par)
    values (tid, h, pid, p_name, coalesce(p_qty,1), coalesce(p_unit,'un'), p_price, above);

  select coalesce(sum(quantity * unit_price), 0) into total from trip_items where trip_id = tid;
  return json_build_object('ok', true, 'needs_confirm', false, 'item', p_name,
    'above_par', above, 'total_parcial', total);
end $$;

-- Finaliza: aplica cada item (estoque + historico + economia), fecha a compra.
create or replace function mercado_trip_finalize(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; tid uuid; it record; economia numeric := 0; total numeric := 0; n int := 0;
begin
  h := mercado_resolve_household(p_chat_id);
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    return json_build_object('ok', false, 'erro', 'sem_compra_aberta');
  end if;

  for it in select * from trip_items where trip_id = tid loop
    economia := economia + mercado_cart_apply_item(h, it.product_id, it.item_name, it.unit_price, it.quantity, it.unit);
    total := total + it.quantity * it.unit_price;
    n := n + 1;
  end loop;

  update shopping_trips set status = 'finalized', finalized_at = now() where id = tid;
  return json_build_object('ok', true, 'itens', n, 'total', total, 'economia', economia);
end $$;

-- Cancela a compra aberta sem efetivar nada.
create or replace function mercado_trip_cancel(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; n int;
begin
  h := mercado_resolve_household(p_chat_id);
  update shopping_trips set status = 'cancelled', finalized_at = now()
    where household_id = h and status = 'open';
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'cancelada', n > 0);
end $$;

-- Despachante do carrinho (espelha mercado_apply): o n8n chama uma funcao so.
create or replace function mercado_cart_apply(
  p_chat_id bigint, p_op text, p_name text default null, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un', p_confirm boolean default false)
returns json language plpgsql security definer set search_path = public as $$
begin
  case lower(coalesce(p_op,''))
    when 'comecar'   then return mercado_trip_start(p_chat_id);
    when 'pegar'     then return mercado_trip_add(p_chat_id, p_name, p_price, p_qty, p_unit, p_confirm);
    when 'finalizar' then return mercado_trip_finalize(p_chat_id);
    when 'cancelar'  then return mercado_trip_cancel(p_chat_id);
    else return json_build_object('ok', false, 'erro', 'op_desconhecida', 'op', p_op);
  end case;
end $$;

-- ============ FUNCOES WEB (auth.uid) ============

-- Le a compra aberta do usuario + itens + total (null se nao houver). Painel em polling.
create or replace function mercado_trip_web()
returns json language plpgsql stable security definer set search_path = public as $$
declare h uuid; tid uuid; res json;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return null; end if;
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then return null; end if;
  select json_build_object(
    'trip_id', tid,
    'total', coalesce((select sum(quantity * unit_price) from trip_items where trip_id = tid), 0),
    'items', coalesce((select json_agg(json_build_object(
        'id', id, 'name', item_name, 'quantity', quantity, 'unit', unit,
        'unit_price', unit_price, 'above_par', above_par
      ) order by created_at) from trip_items where trip_id = tid), '[]'::json)
  ) into res;
  return res;
end $$;

-- Finaliza a compra pelo painel (mesma logica, casa por auth.uid).
create or replace function mercado_trip_finalize_web()
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; tid uuid; it record; economia numeric := 0; total numeric := 0; n int := 0;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then return json_build_object('ok', false, 'erro', 'sem_compra_aberta'); end if;

  for it in select * from trip_items where trip_id = tid loop
    economia := economia + mercado_cart_apply_item(h, it.product_id, it.item_name, it.unit_price, it.quantity, it.unit);
    total := total + it.quantity * it.unit_price;
    n := n + 1;
  end loop;

  update shopping_trips set status = 'finalized', finalized_at = now() where id = tid;
  return json_build_object('ok', true, 'itens', n, 'total', total, 'economia', economia);
end $$;

-- Remove um item do carrinho aberto (corrigir engano pelo painel).
create or replace function mercado_trip_remove_item_web(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; n int;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from trip_items ti using shopping_trips s
    where ti.id = p_id and ti.trip_id = s.id and s.household_id = h and s.status = 'open';
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'removidos', n);
end $$;

-- ============ PERMISSOES ============
revoke execute on function
  mercado_trip_start(bigint),
  mercado_trip_add(bigint, text, numeric, numeric, text, boolean),
  mercado_trip_finalize(bigint),
  mercado_trip_cancel(bigint),
  mercado_cart_apply(bigint, text, text, numeric, numeric, text, boolean)
  from public, anon;

grant execute on function
  mercado_trip_start(bigint),
  mercado_trip_add(bigint, text, numeric, numeric, text, boolean),
  mercado_trip_finalize(bigint),
  mercado_trip_cancel(bigint),
  mercado_cart_apply(bigint, text, text, numeric, numeric, text, boolean)
  to service_role;

grant execute on function
  mercado_trip_web(),
  mercado_trip_finalize_web(),
  mercado_trip_remove_item_web(uuid)
  to authenticated;
