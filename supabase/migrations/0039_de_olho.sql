-- Mercado_app: lista "De olho" (produtos que a casa quer pegar em promocao) e aviso no celular.
-- Rode DEPOIS de 0038.
--
-- Por que existe: as vezes a pessoa quer uma coisa especifica (acem, azeite, fralda) e so
-- compra quando estiver em oferta. Ela marca o produto uma vez; a aba Ofertas mostra onde
-- esta e ate quando, e o monitor manda uma notificacao (Web Push, a nativa do iPhone com o
-- app na Tela de Inicio) quando aparecer uma promocao nova.
--
-- termo: o que casa com as ofertas ("acem", "azeite andorinha"), mesmo criterio da aba
--        Ofertas (primeira palavra abre o nome, as outras em qualquer lugar).
-- nome:  como aparece na tela, copiado do encarte quando a pessoa escolhe uma oferta.
-- foto:  miniatura copiada da oferta (~3 KB). As ofertas sao trocadas a cada coleta; o
--        desejo guarda a sua para continuar bonito quando a promocao acabar.
--
-- Avisos: uma linha por (desejo, promocao) ja avisada, para nao apitar de novo a mesma
-- oferta quando o encarte e republicado (os ids das ofertas mudam, a chave nao).

-- ============ TABELAS ============
create table if not exists promo_desejos (
  id           bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  termo        text not null,
  nome         text not null,
  foto         text,
  criado_em    timestamptz not null default now(),
  unique (household_id, termo)
);

create table if not exists promo_desejo_avisos (
  desejo_id  bigint not null references promo_desejos(id) on delete cascade,
  chave      text not null,           -- mercado|produto|preco|fim
  avisado_em timestamptz not null default now(),
  primary key (desejo_id, chave)
);

-- Um aparelho por linha. O endpoint e unico no mundo: se outra pessoa logar no mesmo
-- aparelho, a inscricao passa para ela.
create table if not exists push_inscricoes (
  endpoint     text primary key,
  household_id uuid not null references households(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  criado_em    timestamptz not null default now()
);

alter table promo_desejos enable row level security;
alter table promo_desejo_avisos enable row level security;
alter table push_inscricoes enable row level security;
revoke all on promo_desejos, promo_desejo_avisos, push_inscricoes from anon, authenticated;

-- ============ APP (_web: casa pelo auth.uid()) ============
create or replace function mercado_desejos_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'desejos', coalesce((
    select json_agg(json_build_object('id', d.id, 'termo', d.termo, 'nome', d.nome,
                                      'tem_foto', d.foto is not null) order by d.criado_em desc)
      from promo_desejos d where d.household_id = h), '[]'::json));
end $fn$;

-- Marca (ou atualiza) um produto. p_oferta: a oferta escolhida, de onde vem a foto.
create or replace function mercado_desejo_salvar_web(p_termo text, p_nome text, p_oferta bigint default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; t text := lower(trim(coalesce(p_termo, ''))); f text; d promo_desejos;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(t) < 2 then return json_build_object('ok', false, 'erro', 'termo_curto'); end if;
  select foto into f from promo_ofertas where id = p_oferta;
  insert into promo_desejos (household_id, termo, nome, foto)
  values (h, t, coalesce(nullif(trim(p_nome), ''), t), f)
  on conflict (household_id, termo) do update
     set nome = excluded.nome, foto = coalesce(excluded.foto, promo_desejos.foto)
  returning * into d;
  return json_build_object('ok', true, 'desejo', json_build_object(
    'id', d.id, 'termo', d.termo, 'nome', d.nome, 'tem_foto', d.foto is not null));
end $fn$;

create or replace function mercado_desejo_remover_web(p_id bigint)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from promo_desejos where id = p_id and household_id = h;
  return json_build_object('ok', true);
end $fn$;

create or replace function mercado_desejo_foto_web(p_id bigint)
returns text language sql stable security definer set search_path = public as $fn$
  select d.foto from promo_desejos d
    join household_members m on m.household_id = d.household_id and m.auth_user_id = auth.uid()
   where d.id = p_id;
$fn$;

create or replace function mercado_push_inscrever_web(p_endpoint text, p_p256dh text, p_auth text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return json_build_object('ok', false, 'erro', 'inscricao_invalida');
  end if;
  insert into push_inscricoes (endpoint, household_id, auth_user_id, p256dh, auth)
  values (p_endpoint, h, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
     set household_id = excluded.household_id, auth_user_id = excluded.auth_user_id,
         p256dh = excluded.p256dh, auth = excluded.auth;
  return json_build_object('ok', true);
end $fn$;

create or replace function mercado_push_cancelar_web(p_endpoint text)
returns json language sql security definer set search_path = public as $fn$
  with x as (delete from push_inscricoes where endpoint = p_endpoint and auth_user_id = auth.uid())
  select json_build_object('ok', auth.uid() is not null);
$fn$;

-- ============ MONITOR (service_role) ============
-- Tudo que o monitor precisa para avisar: ofertas valendo (sem foto), desejos das casas
-- com aparelho inscrito (com as chaves ja avisadas) e as inscricoes.
create or replace function mercado_push_pendentes_h()
returns json language sql stable security definer set search_path = public as $fn$
  select json_build_object(
    'ofertas', coalesce((select json_agg(json_build_object(
                 'mercado', v.mercado, 'produto', v.produto, 'marca', v.marca, 'tamanho', v.tamanho,
                 'preco_por', v.preco_por, 'preco_de', v.preco_de, 'condicao', v.condicao, 'fim', v.fim))
                 from mercado_promo_vigentes() v), '[]'::json),
    'desejos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'household_id', d.household_id, 'termo', d.termo, 'nome', d.nome,
                 'avisados', coalesce((select json_agg(a.chave) from promo_desejo_avisos a where a.desejo_id = d.id), '[]'::json)))
                 from promo_desejos d
                where exists (select 1 from push_inscricoes i where i.household_id = d.household_id)), '[]'::json),
    'inscricoes', coalesce((select json_agg(json_build_object(
                 'household_id', i.household_id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
                 from push_inscricoes i), '[]'::json));
$fn$;

-- Depois de enviar: grava o que foi avisado e apaga aparelho que saiu (404/410 do push).
create or replace function mercado_push_registrar_h(p_avisos json, p_mortas json default '[]')
returns json language plpgsql security definer set search_path = public as $fn$
declare n int; m int;
begin
  insert into promo_desejo_avisos (desejo_id, chave)
  select (a->>'desejo_id')::bigint, a->>'chave'
    from json_array_elements(coalesce(p_avisos, '[]'::json)) a
   where exists (select 1 from promo_desejos d where d.id = (a->>'desejo_id')::bigint)
  on conflict do nothing;
  get diagnostics n = row_count;
  delete from push_inscricoes where endpoint in (select json_array_elements_text(coalesce(p_mortas, '[]'::json)));
  get diagnostics m = row_count;
  -- aviso velho nao serve para nada: a promocao ja acabou
  delete from promo_desejo_avisos where avisado_em < now() - interval '60 days';
  return json_build_object('ok', true, 'avisos', n, 'removidas', m);
end $fn$;

-- ============ PERMISSOES ============
revoke execute on function mercado_desejos_web(), mercado_desejo_salvar_web(text, text, bigint),
  mercado_desejo_remover_web(bigint), mercado_desejo_foto_web(bigint),
  mercado_push_inscrever_web(text, text, text), mercado_push_cancelar_web(text) from public, anon;
grant execute on function mercado_desejos_web(), mercado_desejo_salvar_web(text, text, bigint),
  mercado_desejo_remover_web(bigint), mercado_desejo_foto_web(bigint),
  mercado_push_inscrever_web(text, text, text), mercado_push_cancelar_web(text) to authenticated;
revoke execute on function mercado_push_pendentes_h(), mercado_push_registrar_h(json, json)
  from public, anon, authenticated;
grant execute on function mercado_push_pendentes_h(), mercado_push_registrar_h(json, json) to service_role;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999039; h uuid; d bigint; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0039', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  insert into promo_desejos (household_id, termo, nome) values (h, 'acem', 'Acém') returning id into d;
  insert into push_inscricoes (endpoint, household_id, p256dh, auth)
  values ('https://push.teste/0039', h, 'p', 'a');

  r := mercado_push_pendentes_h();
  assert exists (select 1 from json_array_elements(r->'desejos') x where (x->>'id')::bigint = d),
    'desejo da casa inscrita deveria ir para o monitor';

  r := mercado_push_registrar_h(json_build_array(json_build_object('desejo_id', d, 'chave', 'k1'),
                                                 json_build_object('desejo_id', d, 'chave', 'k1')),
                                json_build_array('https://push.teste/0039'));
  assert (r->>'avisos')::int = 1 and (r->>'removidas')::int = 1, format('registrar: %s', r);

  -- sem aparelho inscrito a casa sai da lista do monitor
  r := mercado_push_pendentes_h();
  assert not exists (select 1 from json_array_elements(r->'desejos') x where (x->>'id')::bigint = d),
    'casa sem aparelho nao deveria ir para o monitor';

  -- sem sessao (SQL Editor) as portas web nao acham casa
  assert not (mercado_desejos_web()->>'ok')::boolean, 'sem sessao deveria falhar';
  assert mercado_desejo_foto_web(d) is null, 'foto sem sessao deveria ser null';

  delete from households where id = h;
  assert not exists (select 1 from promo_desejo_avisos where desejo_id = d), 'apagar a casa apaga os avisos';
  raise notice 'SELF-TEST 0039 (de olho) OK';
end $test$;
