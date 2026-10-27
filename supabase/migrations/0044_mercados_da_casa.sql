-- Mercado_app: cada familia escolhe os mercados onde compra.
-- Rode DEPOIS de 0043.
--
-- Por que existe: o monitor de promocoes e um so para todas as casas (as ofertas sao
-- publicas, 0038), mas cada familia compra em lugares diferentes. Ofertas, De olho e
-- os avisos no celular passam a mostrar so os mercados que a casa marcou.
-- Casa sem nenhum marcado ve todos (como antes): nada some para quem ja usa.
--
-- Pedidos de mercado novo (0043) sao vistos por todas as casas, so pelo NOME e pelo
-- numero de familias que pediram (sem localizacao nem quem pediu). Quem tambem quer
-- aquele mercado diz "quero tambem"; quem nao quer simplesmente nao ve as ofertas dele.

create table if not exists casa_mercados (
  household_id uuid not null references households(id) on delete cascade,
  mercado      text not null,
  criado_em    timestamptz not null default now(),
  primary key (household_id, mercado)
);
alter table casa_mercados enable row level security;
revoke all on casa_mercados from anon, authenticated;

-- A casa ve este mercado? Sem escolha nenhuma, ve todos.
create or replace function mercado_casa_ve(h uuid, p_mercado text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select not exists (select 1 from casa_mercados where household_id = h)
      or exists (select 1 from casa_mercados where household_id = h and mercado = p_mercado);
$fn$;
revoke execute on function mercado_casa_ve(uuid, text) from public, anon, authenticated;

create or replace function mercado_ofertas_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object(
    'ok', true,
    'lista', mercado_promo_lista_h(h),
    'atualizado_em', (select max(coletado_em) from promo_ofertas),
    'meus_mercados', (select json_agg(mercado) from casa_mercados where household_id = h),
    'ofertas', coalesce((
      select json_agg(json_build_object(
               'id', v.id, 'mercado', v.mercado, 'produto', v.produto, 'marca', v.marca,
               'tamanho', v.tamanho, 'categoria', v.categoria, 'preco_por', v.preco_por,
               'preco_de', v.preco_de, 'condicao', v.condicao, 'fim', v.fim,
               'tem_foto', v.foto is not null))
        from mercado_promo_vigentes() v where mercado_casa_ve(h, v.mercado)), '[]'::json));
end $fn$;

-- Tela "Meus mercados": os acompanhados pelo monitor (com quantas ofertas valendo),
-- os escolhidos pela casa e os pedidos de mercado novo de todas as familias.
create or replace function mercado_meus_mercados_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object(
    'ok', true,
    'escolhidos', coalesce((select json_agg(mercado) from casa_mercados where household_id = h), '[]'::json),
    'acompanhados', coalesce((select json_agg(json_build_object('mercado', mercado, 'ofertas', n) order by n desc)
                                from (select mercado, count(*) n from mercado_promo_vigentes() group by 1) x), '[]'::json),
    'pedidos', coalesce((
      select json_agg(json_build_object('nome', nome, 'familias', familias, 'meu', meu) order by familias desc)
        from (select min(nome) as nome, count(*) as familias, bool_or(household_id = h) as meu
                from mercados_pedidos
               group by lower(translate(nome, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooouccaaaaeeiooouc'))) p), '[]'::json));
end $fn$;

create or replace function mercado_meus_mercados_salvar_web(p_mercados text[])
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from casa_mercados where household_id = h;
  insert into casa_mercados (household_id, mercado)
  select h, m from (select distinct trim(x) m from unnest(coalesce(p_mercados, '{}')) x) y where m <> '';
  return json_build_object('ok', true, 'escolhidos', (select count(*) from casa_mercados where household_id = h));
end $fn$;

-- Monitor: cada desejo leva os mercados da casa (null = todos), para o aviso no
-- celular so falar de mercado que a familia frequenta.
create or replace function mercado_push_pendentes_h()
returns json language sql stable security definer set search_path = public as $fn$
  select json_build_object(
    'ofertas', coalesce((select json_agg(json_build_object(
                 'mercado', v.mercado, 'produto', v.produto, 'marca', v.marca, 'tamanho', v.tamanho,
                 'preco_por', v.preco_por, 'preco_de', v.preco_de, 'condicao', v.condicao, 'fim', v.fim))
                 from mercado_promo_vigentes() v), '[]'::json),
    'desejos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'household_id', d.household_id, 'termo', d.termo, 'nome', d.nome,
                 'aparelho', exists (select 1 from push_inscricoes i where i.household_id = d.household_id),
                 'mercados', (select json_agg(c.mercado) from casa_mercados c where c.household_id = d.household_id),
                 'avisados', coalesce((select json_agg(a.chave) from promo_desejo_avisos a where a.desejo_id = d.id), '[]'::json)))
                 from promo_desejos d), '[]'::json),
    'inscricoes', coalesce((select json_agg(json_build_object(
                 'household_id', i.household_id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
                 from push_inscricoes i), '[]'::json));
$fn$;

revoke execute on function mercado_meus_mercados_web(), mercado_meus_mercados_salvar_web(text[]) from public, anon;
grant execute on function mercado_meus_mercados_web(), mercado_meus_mercados_salvar_web(text[]) to authenticated;

-- ============ SELF-TEST (padrao 0007; casas de teste criadas e apagadas aqui) ============
do $test$
declare c1 bigint := 999999044; c2 bigint := 999999045; h1 uuid; h2 uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id in (c1, c2));
  delete from household_members where telegram_chat_id in (c1, c2);
  perform mercado_create_family(c1, 'Casa Teste 0044 A', 'A');
  perform mercado_create_family(c2, 'Casa Teste 0044 B', 'B');
  select household_id into h1 from household_members where telegram_chat_id = c1;
  select household_id into h2 from household_members where telegram_chat_id = c2;
  assert h1 <> h2, 'cada cadastro e uma casa nova';

  -- sem escolha: ve tudo; com escolha: so os seus
  assert mercado_casa_ve(h1, 'guanabara') and mercado_casa_ve(h1, 'mundial'), 'sem escolha ve todos';
  insert into casa_mercados values (h1, 'guanabara');
  assert mercado_casa_ve(h1, 'guanabara') and not mercado_casa_ve(h1, 'mundial'), 'com escolha ve so os seus';
  assert mercado_casa_ve(h2, 'mundial'), 'a escolha de uma casa nao mexe na outra';

  insert into promo_desejos (household_id, termo, nome) values (h1, 'acem', 'Acém');
  assert (select x->'mercados'->>0 from json_array_elements(mercado_push_pendentes_h()->'desejos') x
           where (x->>'household_id')::uuid = h1 limit 1) = 'guanabara', 'monitor recebe os mercados da casa';

  delete from households where id in (h1, h2);
  delete from household_members where telegram_chat_id in (c1, c2);
  raise notice 'SELF-TEST 0044 (mercados da casa) OK';
end $test$;
