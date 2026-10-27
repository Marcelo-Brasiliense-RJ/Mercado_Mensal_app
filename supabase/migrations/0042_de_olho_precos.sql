-- Mercado_app: historico de preco dos produtos "De olho".
-- Rode DEPOIS de 0041.
--
-- Por que existe: o card De olho so dizia "sem promocao agora", e a pessoa nao sabia se o
-- preco de hoje e bom ou caro. As ofertas sao trocadas a cada coleta (0038), entao o
-- historico tem que ficar no proprio desejo: a ultima promocao vista e a menor de todas.
-- Quem atualiza e o monitor (promocoes avisar), a cada rodada, para TODAS as casas
-- (antes so ia quem tinha celular inscrito). Marcar pela estrela ja grava a oferta escolhida.

alter table promo_desejos add column if not exists ultimo_preco   numeric;
alter table promo_desejos add column if not exists ultimo_mercado text;
alter table promo_desejos add column if not exists ultimo_fim     timestamptz;
alter table promo_desejos add column if not exists ultimo_visto   timestamptz;
alter table promo_desejos add column if not exists menor_preco    numeric;
alter table promo_desejos add column if not exists menor_mercado  text;
alter table promo_desejos add column if not exists menor_em       timestamptz;

create or replace function mercado_desejo_json(d promo_desejos)
returns json language sql immutable as $fn$
  select json_build_object('id', d.id, 'termo', d.termo, 'nome', d.nome, 'tem_foto', d.foto is not null,
    'ultimo_preco', d.ultimo_preco, 'ultimo_mercado', d.ultimo_mercado, 'ultimo_fim', d.ultimo_fim,
    'ultimo_visto', d.ultimo_visto, 'menor_preco', d.menor_preco, 'menor_mercado', d.menor_mercado,
    'menor_em', d.menor_em);
$fn$;

-- Registra uma promocao vista: vira a "ultima" e, se for a mais barata, a "menor".
create or replace function mercado_desejo_visto(p_id bigint, p_preco numeric, p_mercado text, p_fim timestamptz)
returns void language sql security definer set search_path = public as $fn$
  update promo_desejos
     set ultimo_preco = p_preco, ultimo_mercado = p_mercado, ultimo_fim = p_fim, ultimo_visto = now(),
         menor_preco   = case when menor_preco is null or p_preco < menor_preco then p_preco else menor_preco end,
         menor_mercado = case when menor_preco is null or p_preco < menor_preco then p_mercado else menor_mercado end,
         menor_em      = case when menor_preco is null or p_preco < menor_preco then now() else menor_em end
   where id = p_id and p_preco > 0;
$fn$;
revoke execute on function mercado_desejo_visto(bigint, numeric, text, timestamptz) from public, anon, authenticated;

create or replace function mercado_desejos_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'desejos', coalesce((
    select json_agg(mercado_desejo_json(d) order by d.criado_em desc)
      from promo_desejos d where d.household_id = h), '[]'::json));
end $fn$;

create or replace function mercado_desejo_salvar_web(p_termo text, p_nome text, p_oferta bigint default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; t text := lower(trim(coalesce(p_termo, ''))); o promo_ofertas; d promo_desejos;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(t) < 2 then return json_build_object('ok', false, 'erro', 'termo_curto'); end if;
  select * into o from promo_ofertas where id = p_oferta;
  insert into promo_desejos (household_id, termo, nome, foto)
  values (h, t, coalesce(nullif(trim(p_nome), ''), t), o.foto)
  on conflict (household_id, termo) do update
     set nome = excluded.nome, foto = coalesce(excluded.foto, promo_desejos.foto)
  returning * into d;
  if o.id is not null then
    perform mercado_desejo_visto(d.id, o.preco_por, o.mercado, o.fim);
    select * into d from promo_desejos where id = d.id;
  end if;
  return json_build_object('ok', true, 'desejo', mercado_desejo_json(d));
end $fn$;

-- Monitor: agora vai todo desejo (para guardar o preco), com a marca de quem tem aparelho.
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
                 'avisados', coalesce((select json_agg(a.chave) from promo_desejo_avisos a where a.desejo_id = d.id), '[]'::json)))
                 from promo_desejos d), '[]'::json),
    'inscricoes', coalesce((select json_agg(json_build_object(
                 'household_id', i.household_id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
                 from push_inscricoes i), '[]'::json));
$fn$;

-- Monitor: a promocao mais barata vista agora de cada desejo.
create or replace function mercado_desejos_precos_h(p_vistos json)
returns json language plpgsql security definer set search_path = public as $fn$
declare v json; n int := 0;
begin
  for v in select * from json_array_elements(coalesce(p_vistos, '[]'::json)) loop
    perform mercado_desejo_visto((v->>'id')::bigint, (v->>'preco')::numeric, v->>'mercado',
                                 nullif(v->>'fim', '')::timestamptz);
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'atualizados', n);
end $fn$;

revoke execute on function mercado_desejos_precos_h(json), mercado_push_pendentes_h() from public, anon, authenticated;
grant execute on function mercado_desejos_precos_h(json), mercado_push_pendentes_h() to service_role;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999042; h uuid; d bigint; r promo_desejos; p json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0042', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;
  insert into promo_desejos (household_id, termo, nome) values (h, 'acem', 'Acém') returning id into d;

  -- sem aparelho inscrito o desejo vai ao monitor mesmo assim, marcado
  p := mercado_push_pendentes_h();
  assert exists (select 1 from json_array_elements(p->'desejos') x
                  where (x->>'id')::bigint = d and not (x->>'aparelho')::boolean), 'desejo sem aparelho deveria ir';

  perform mercado_desejos_precos_h(json_build_array(json_build_object('id', d, 'preco', 29.98, 'mercado', 'guanabara', 'fim', '2026-10-30')));
  perform mercado_desejos_precos_h(json_build_array(json_build_object('id', d, 'preco', 32.5, 'mercado', 'mundial', 'fim', null)));
  select * into r from promo_desejos where id = d;
  assert r.ultimo_preco = 32.5 and r.ultimo_mercado = 'mundial', format('ultima: %s %s', r.ultimo_preco, r.ultimo_mercado);
  assert r.menor_preco = 29.98 and r.menor_mercado = 'guanabara', format('menor: %s %s', r.menor_preco, r.menor_mercado);
  assert (mercado_desejo_json(r)->>'menor_preco')::numeric = 29.98, 'json do desejo traz o historico';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0042 (de olho precos) OK';
end $test$;
