-- Mercado_app: Carrefour como mais um mercado, pela Livelo.
-- Rode DEPOIS de 0046.
--
-- Por que existe: a Livelo nao pode ficar escondida. O coletor busca no site do
-- Carrefour Mercado os itens que as casas com Livelo precisam (lista + fixos do mes) e
-- publica como ofertas do mercado "carrefour"; o app desconta os pontos e compara com
-- os encartes, como qualquer mercado.
--
-- 1. mercado_casa_ve: quem marcou o Carrefour na Livelo ve o Carrefour, mesmo sem ele
--    na escolha de mercados (0044).
-- 2. mercado_livelo_termos_h: o que buscar no Carrefour (so leitura, service_role).

create or replace function mercado_casa_ve(h uuid, p_mercado text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select not exists (select 1 from casa_mercados where household_id = h)
      or exists (select 1 from casa_mercados where household_id = h and mercado = p_mercado)
      or (p_mercado = 'carrefour'
          and exists (select 1 from livelo_casa c where c.household_id = h and c.parceiros && array['CRM', 'CRF']));
$fn$;
revoke execute on function mercado_casa_ve(uuid, text) from public, anon, authenticated;

create or replace function mercado_livelo_termos_h()
returns json language sql stable security definer set search_path = public as $fn$
  with casas as (
    select household_id from livelo_casa where parceiros && array['CRM', 'CRF']
  ), termos as (
    select f.item as termo from casa_fixos f join casas c using (household_id)
    union
    select lower(trim(s.item_name)) from shopping_list s join casas c using (household_id) where s.status = 'pending'
  )
  select coalesce(json_agg(termo order by termo), '[]'::json) from termos where length(termo) >= 2;
$fn$;
revoke execute on function mercado_livelo_termos_h() from public, anon, authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999048; h uuid; t json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0047', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  insert into casa_mercados values (h, 'guanabara');
  assert not mercado_casa_ve(h, 'carrefour'), 'sem Livelo nao ve o Carrefour';
  insert into livelo_casa (household_id, parceiros) values (h, array['CRM']);
  assert mercado_casa_ve(h, 'carrefour'), 'com Carrefour na Livelo ve o Carrefour';
  assert not mercado_casa_ve(h, 'mundial'), 'os outros continuam pela escolha';

  insert into casa_fixos (household_id, item) values (h, 'cafe teste 0047');
  t := mercado_livelo_termos_h();
  assert t::jsonb ? 'cafe teste 0047', 'fixo da casa com Livelo entra na busca';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0047 (carrefour livelo) OK';
end $test$;
