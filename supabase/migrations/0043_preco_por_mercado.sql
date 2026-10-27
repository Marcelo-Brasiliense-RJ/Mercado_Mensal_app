-- Mercado_app: preco de cada produto em cada mercado, e pedidos de mercado novo.
-- Rode DEPOIS de 0042.
--
-- Por que existe: no mercado, ler o codigo tem que trazer o PRECO DAQUELE mercado, para
-- a pessoa so confirmar. O encarte so tem promocao; o preco de prateleira de tudo nao
-- existe em base publica nenhuma. Entao o app aprende com a casa: cada item posto no
-- carrinho, com o mercado identificado pelo GPS, grava o preco visto la. Na proxima
-- vez, naquele mercado, o campo ja vem com ele.
--
-- mercado: id dos que o monitor acompanha (guanabara, mundial...) ou o nome de um que
-- ainda nao acompanha ("Atacadão"). Pedidos de mercado novo ficam em mercados_pedidos
-- para entrar no monitor numa rodada futura.
-- Localizacao do pedido vai arredondada (3 casas, ~100 m): basta para achar a loja.

create table if not exists precos_vistos (
  household_id uuid not null references households(id) on delete cascade,
  mercado      text not null,
  item_name    text not null,           -- minusculo, como products.name
  barcode      text,
  preco        numeric not null check (preco > 0),
  visto_em     timestamptz not null default now(),
  primary key (household_id, mercado, item_name)
);
create index if not exists idx_precos_vistos_codigo on precos_vistos (household_id, mercado, barcode);

create table if not exists mercados_pedidos (
  household_id uuid not null references households(id) on delete cascade,
  nome         text not null,
  lat          numeric,
  lng          numeric,
  vezes        int not null default 1,
  criado_em    timestamptz not null default now(),
  primary key (household_id, nome)
);

alter table precos_vistos enable row level security;
alter table mercados_pedidos enable row level security;
revoke all on precos_vistos, mercados_pedidos from anon, authenticated;

create or replace function mercado_preco_visto_web(p_mercado text, p_item text, p_preco numeric, p_barcode text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; m text := trim(coalesce(p_mercado, '')); i text := lower(trim(coalesce(p_item, '')));
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if m = '' or i = '' or coalesce(p_preco, 0) <= 0 then return json_build_object('ok', false, 'erro', 'valor_invalido'); end if;
  insert into precos_vistos (household_id, mercado, item_name, barcode, preco)
  values (h, m, i, nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), ''), p_preco)
  on conflict (household_id, mercado, item_name) do update
     set preco = excluded.preco, barcode = coalesce(excluded.barcode, precos_vistos.barcode), visto_em = now();
  return json_build_object('ok', true);
end $fn$;

create or replace function mercado_precos_mercado_web(p_mercado text)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'precos', coalesce((
    select json_agg(json_build_object('item', item_name, 'barcode', barcode, 'preco', preco, 'visto_em', visto_em))
      from precos_vistos where household_id = h and mercado = trim(p_mercado)), '[]'::json));
end $fn$;

create or replace function mercado_pedir_mercado_web(p_nome text, p_lat numeric default null, p_lng numeric default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; n text := trim(coalesce(p_nome, ''));
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(n) < 2 then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  insert into mercados_pedidos (household_id, nome, lat, lng)
  values (h, n, round(p_lat, 3), round(p_lng, 3))
  on conflict (household_id, nome) do update set vezes = mercados_pedidos.vezes + 1;
  return json_build_object('ok', true);
end $fn$;

-- Monitor: o que pediram para acompanhar (mostrado no log de cada rodada).
create or replace function mercado_mercados_pedidos_h()
returns json language sql stable security definer set search_path = public as $fn$
  select coalesce(json_agg(json_build_object('nome', nome, 'lat', lat, 'lng', lng, 'vezes', vezes, 'desde', criado_em)
                  order by vezes desc), '[]'::json)
    from mercados_pedidos;
$fn$;

revoke execute on function mercado_preco_visto_web(text, text, numeric, text), mercado_precos_mercado_web(text),
  mercado_pedir_mercado_web(text, numeric, numeric) from public, anon;
grant execute on function mercado_preco_visto_web(text, text, numeric, text), mercado_precos_mercado_web(text),
  mercado_pedir_mercado_web(text, numeric, numeric) to authenticated;
revoke execute on function mercado_mercados_pedidos_h() from public, anon, authenticated;
grant execute on function mercado_mercados_pedidos_h() to service_role;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999043; h uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0043', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  insert into precos_vistos (household_id, mercado, item_name, preco) values (h, 'guanabara', 'detergente', 2.49);
  insert into precos_vistos (household_id, mercado, item_name, preco) values (h, 'guanabara', 'detergente', 2.19)
  on conflict (household_id, mercado, item_name) do update set preco = excluded.preco;
  assert (select preco from precos_vistos where household_id = h and item_name = 'detergente') = 2.19, 'ultimo preco vence';

  insert into mercados_pedidos (household_id, nome) values (h, 'Atacadão');
  assert exists (select 1 from json_array_elements(mercado_mercados_pedidos_h()) x where x->>'nome' = 'Atacadão'),
    'pedido aparece para o monitor';

  -- sem sessao (SQL Editor) as portas web nao acham casa
  assert not (mercado_pedir_mercado_web('X')->>'ok')::boolean or auth.uid() is not null, 'sem sessao deveria falhar';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0043 (preco por mercado) OK';
end $test$;
