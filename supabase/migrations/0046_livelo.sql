-- Mercado_app: pontos Livelo nas compras do mes.
-- Rode DEPOIS de 0045.
--
-- Por que existe: comprar pela Livelo (Carrefour online e outros parceiros) rende pontos,
-- e ponto e dinheiro. Um mercado um pouco mais caro que pontua pode sair mais barato. O
-- app compara o preco do encarte com o preco do parceiro MENOS o valor dos pontos.
--
-- livelo_paridades: pontos por real de cada parceiro, publicos e iguais para todos. O
--   coletor (GitHub Actions) busca a lista da Livelo a cada rodada, entao as campanhas
--   ("ate 10 pts por real so hoje") entram e saem sozinhas.
-- livelo_casa:      quanto vale 1 ponto para a casa, se ela e do Clube e os parceiros que usa.
-- casa_fixos:       o que a casa compra todo mes (cafe, sabao...). O app compara estes.
-- livelo_precos:    preco do fixo no parceiro, que a pessoa viu e digitou (o site do
--   parceiro nao abre para robo).
-- livelo_compras:   o que foi comprado pela Livelo e os pontos que rendeu (Economia do mes).

create table if not exists livelo_paridades (
  codigo        text primary key,          -- partnerCode da Livelo (CRM, EXT...)
  nome          text,                      -- nome conhecido; null = so o codigo
  pontos        numeric not null,          -- pontos por real agora (com campanha)
  pontos_clube  numeric not null,          -- para quem e do Clube Livelo
  pontos_normal numeric not null,          -- fora de campanha
  promocao      boolean not null default false,
  ate           boolean not null default false, -- "ate N pts": vale so para parte dos produtos
  regra         text,                      -- texto da campanha, sem HTML
  atualizado_em timestamptz not null default now()
);

create table if not exists livelo_casa (
  household_id uuid primary key references households(id) on delete cascade,
  valor_ponto  numeric not null default 0.03 check (valor_ponto >= 0 and valor_ponto <= 1),
  clube        boolean not null default false,
  parceiros    text[] not null default '{}'
);

create table if not exists casa_fixos (
  household_id uuid not null references households(id) on delete cascade,
  item         text not null,              -- nome do item em minusculas, como na lista
  criado_em    timestamptz not null default now(),
  primary key (household_id, item)
);

create table if not exists livelo_precos (
  household_id uuid not null references households(id) on delete cascade,
  item         text not null,
  parceiro     text not null,
  preco        numeric not null check (preco > 0),
  visto_em     timestamptz not null default now(),
  primary key (household_id, item, parceiro)
);

create table if not exists livelo_compras (
  id           bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  parceiro     text not null,
  item         text not null,
  valor        numeric not null check (valor > 0),
  pontos       numeric not null,
  em           timestamptz not null default now()
);
create index if not exists livelo_compras_casa_em on livelo_compras (household_id, em);

alter table livelo_paridades enable row level security;
alter table livelo_casa enable row level security;
alter table casa_fixos enable row level security;
alter table livelo_precos enable row level security;
alter table livelo_compras enable row level security;
revoke all on livelo_paridades, livelo_casa, casa_fixos, livelo_precos, livelo_compras from anon, authenticated;

-- ============ coletor: troca a tabela de pontos inteira (service_role) ============
create or replace function mercado_livelo_paridades_h(p_itens jsonb)
returns json language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    return json_build_object('ok', false, 'erro', 'vazio'); -- nunca apaga tudo por uma resposta ruim
  end if;
  insert into livelo_paridades (codigo, nome, pontos, pontos_clube, pontos_normal, promocao, ate, regra, atualizado_em)
  select x->>'codigo', nullif(x->>'nome', ''), (x->>'pontos')::numeric,
         coalesce((x->>'pontos_clube')::numeric, (x->>'pontos')::numeric),
         coalesce((x->>'pontos_normal')::numeric, (x->>'pontos')::numeric),
         coalesce((x->>'promocao')::boolean, false), coalesce((x->>'ate')::boolean, false),
         nullif(left(x->>'regra', 500), ''), now()
    from jsonb_array_elements(p_itens) x
   where coalesce(x->>'codigo', '') <> '' and (x->>'pontos') ~ '^[0-9.]+$'
  on conflict (codigo) do update
     set nome = coalesce(excluded.nome, livelo_paridades.nome), pontos = excluded.pontos,
         pontos_clube = excluded.pontos_clube, pontos_normal = excluded.pontos_normal,
         promocao = excluded.promocao, ate = excluded.ate, regra = excluded.regra,
         atualizado_em = excluded.atualizado_em;
  get diagnostics n = row_count;
  -- parceiro que saiu da Livelo some da tabela (nao da casa: ela so deixa de pontuar)
  delete from livelo_paridades where atualizado_em < now() - interval '1 minute';
  return json_build_object('ok', true, 'parceiros', n);
end $fn$;
revoke execute on function mercado_livelo_paridades_h(jsonb) from public, anon, authenticated;

-- ============ app ============
create or replace function mercado_livelo_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid; c livelo_casa; ini timestamptz := date_trunc('month', now());
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select * into c from livelo_casa where household_id = h;
  return json_build_object(
    'ok', true,
    'configurado', c.household_id is not null,
    'valor_ponto', coalesce(c.valor_ponto, 0.03),
    'clube', coalesce(c.clube, false),
    'parceiros', coalesce(c.parceiros, '{}'),
    'paridades', coalesce((select json_agg(json_build_object(
        'codigo', p.codigo, 'nome', p.nome, 'pontos', p.pontos, 'pontos_clube', p.pontos_clube,
        'pontos_normal', p.pontos_normal, 'promocao', p.promocao, 'ate', p.ate, 'regra', p.regra,
        'atualizado_em', p.atualizado_em) order by p.nome nulls last, p.codigo)
      from livelo_paridades p where p.nome is not null or p.codigo = any(coalesce(c.parceiros, '{}'))), '[]'::json),
    'fixos', coalesce((select json_agg(f.item order by f.item) from casa_fixos f where f.household_id = h), '[]'::json),
    'precos', coalesce((select json_agg(json_build_object('item', x.item, 'parceiro', x.parceiro,
        'preco', x.preco, 'visto_em', x.visto_em)) from livelo_precos x where x.household_id = h), '[]'::json),
    'mes', (select json_build_object('pontos', coalesce(sum(k.pontos), 0), 'gasto', coalesce(sum(k.valor), 0),
        'compras', count(*)) from livelo_compras k where k.household_id = h and k.em >= ini),
    'por_parceiro', coalesce((select json_agg(json_build_object('parceiro', z.parceiro, 'pontos', z.pts, 'itens', z.itens))
        from (select k.parceiro, sum(k.pontos) pts, string_agg(distinct k.item, ', ') itens
                from livelo_compras k where k.household_id = h and k.em >= ini group by k.parceiro) z), '[]'::json));
end $fn$;

create or replace function mercado_livelo_config_web(p_valor_ponto numeric, p_clube boolean, p_parceiros text[])
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  if p_valor_ponto is null or p_valor_ponto < 0 or p_valor_ponto > 1 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  insert into livelo_casa (household_id, valor_ponto, clube, parceiros)
  values (h, p_valor_ponto, coalesce(p_clube, false), coalesce(p_parceiros, '{}'))
  on conflict (household_id) do update
     set valor_ponto = excluded.valor_ponto, clube = excluded.clube, parceiros = excluded.parceiros;
  return json_build_object('ok', true);
end $fn$;

create or replace function mercado_fixo_web(p_item text, p_fixo boolean)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; i text := lower(trim(coalesce(p_item, '')));
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(i) < 2 then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  if p_fixo then
    insert into casa_fixos (household_id, item) values (h, i) on conflict do nothing;
  else
    delete from casa_fixos where household_id = h and item = i;
    delete from livelo_precos where household_id = h and item = i;
  end if;
  return json_build_object('ok', true);
end $fn$;

-- p_preco null: apaga o preco daquele parceiro.
create or replace function mercado_livelo_preco_web(p_item text, p_parceiro text, p_preco numeric)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; i text := lower(trim(coalesce(p_item, '')));
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(i) < 2 or coalesce(p_parceiro, '') = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  if p_preco is null then
    delete from livelo_precos where household_id = h and item = i and parceiro = p_parceiro;
  elsif p_preco <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  else
    insert into livelo_precos (household_id, item, parceiro, preco) values (h, i, p_parceiro, p_preco)
    on conflict (household_id, item, parceiro) do update set preco = excluded.preco, visto_em = now();
  end if;
  return json_build_object('ok', true);
end $fn$;

-- Pontos pela tabela do dia (Clube, se a casa for), para a Economia do mes.
create or replace function mercado_livelo_compra_web(p_parceiro text, p_item text, p_valor numeric)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; clube boolean; pts numeric;
begin
  if p_valor is null or p_valor <= 0 then return json_build_object('ok', false, 'erro', 'valor_invalido'); end if;
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select coalesce(c.clube, false) into clube from livelo_casa c where c.household_id = h;
  select case when coalesce(clube, false) then p.pontos_clube else p.pontos end into pts
    from livelo_paridades p where p.codigo = p_parceiro;
  pts := round(p_valor * coalesce(pts, 0));
  insert into livelo_compras (household_id, parceiro, item, valor, pontos)
  values (h, p_parceiro, lower(trim(coalesce(p_item, ''))), p_valor, pts);
  return json_build_object('ok', true, 'pontos', pts);
end $fn$;

revoke execute on function mercado_livelo_web(), mercado_livelo_config_web(numeric, boolean, text[]),
  mercado_fixo_web(text, boolean), mercado_livelo_preco_web(text, text, numeric),
  mercado_livelo_compra_web(text, text, numeric) from public, anon;
grant execute on function mercado_livelo_web(), mercado_livelo_config_web(numeric, boolean, text[]),
  mercado_fixo_web(text, boolean), mercado_livelo_preco_web(text, text, numeric),
  mercado_livelo_compra_web(text, text, numeric) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999047; h uuid; r json; antes int;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0046', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  select count(*) into antes from livelo_paridades;
  r := mercado_livelo_paridades_h('[]'::jsonb);
  assert not (r->>'ok')::boolean, 'lista vazia nao pode apagar a tabela';
  assert (select count(*) from livelo_paridades) = antes, 'lista vazia mexeu na tabela';

  insert into casa_fixos (household_id, item) values (h, 'cafe');
  begin
    insert into casa_fixos (household_id, item) values (h, 'cafe');
    assert false, 'fixo repetido deveria falhar';
  exception when unique_violation then null;
  end;
  begin
    insert into livelo_precos (household_id, item, parceiro, preco) values (h, 'cafe', 'CRM', 0);
    assert false, 'preco zero deveria falhar';
  exception when check_violation then null;
  end;
  assert not (mercado_livelo_web()->>'ok')::boolean or auth.uid() is not null, 'sem sessao deveria falhar';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0046 (livelo) OK';
end $test$;
