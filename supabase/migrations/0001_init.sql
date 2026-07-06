-- Mercado_app — schema inicial
-- Projeto dedicado: rode este arquivo no SQL Editor do Supabase.
-- RLS habilitado sem policies permissivas: acesso só via service_role (n8n / API server-side).

-- ============ CASA E MEMBROS ============
create table if not exists households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Minha casa',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  telegram_chat_id bigint unique not null,
  name             text,
  created_at       timestamptz not null default now()
);

-- ============ CATÁLOGO + ESTOQUE + MODELO DE CONSUMO ============
create table if not exists products (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references households(id) on delete cascade,
  name                   text not null,                 -- nome canônico, minúsculo (ex: "açúcar")
  unit                   text not null default 'un',    -- un | kg | l | pacote
  par_level              numeric not null default 0,    -- nível normal desejado em casa
  consumption_rate_month numeric not null default 0,    -- taxa estimada por mês (auto-calibra)
  current_stock          numeric not null default 0,    -- estoque estimado atual
  last_inventory_at      timestamptz,                   -- última conferência por voz
  updated_at             timestamptz not null default now(),
  unique (household_id, name)
);

-- ============ HISTÓRICO DE COMPRAS (base de economia e preço) ============
create table if not exists purchases (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  item_name    text not null,                 -- guarda o nome mesmo se o produto sumir
  brand        text,
  unit_price   numeric not null default 0,
  quantity     numeric not null default 1,
  unit         text not null default 'un',
  purchased_at timestamptz not null default now()
  -- ponytail: total (unit_price*quantity) e mês (date_trunc) são calculados na query,
  -- não como colunas geradas, para evitar 42P17 (expressão não-immutable).
);
create index if not exists idx_purchases_prod_date on purchases (product_id, purchased_at);
create index if not exists idx_purchases_house_date on purchases (household_id, purchased_at);

-- ============ LISTA DE COMPRAS ============
create table if not exists shopping_list (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  item_name        text not null,
  desired_quantity numeric not null default 1,
  unit             text not null default 'un',
  estimated_price  numeric,                       -- último preço conhecido do item
  status           text not null default 'pending', -- pending | bought | removed
  created_at       timestamptz not null default now(),
  bought_at        timestamptz
);
create index if not exists idx_list_house_status on shopping_list (household_id, status);

-- ============ ORÇAMENTO MENSAL ============
create table if not exists budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month        date not null,      -- primeiro dia do mês
  amount       numeric not null,
  unique (household_id, month)
);

-- ============ SEGURANÇA ============
alter table households    enable row level security;
alter table users         enable row level security;
alter table products      enable row level security;
alter table purchases     enable row level security;
alter table shopping_list enable row level security;
alter table budgets       enable row level security;
-- Sem policies: anon/public não lê nada. Todo acesso é server-side com service_role.
