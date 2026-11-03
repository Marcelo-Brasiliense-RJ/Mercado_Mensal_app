-- Mercado_app: memoria da visao (foto da prateleira). Rode DEPOIS de 0052.
--
-- Por que existe: a IA le o rotulo do jeito dela ("Pilao Trad 500"), a pessoa confirma
-- o nome da casa ("Café Pilão"). Guardar esse par faz a proxima foto ja vir VERDE, sem
-- perguntar e sem gastar IA a mais. Os recortes (miniatura de cada produto confirmado,
-- com a qualidade: bom = a IA acertou, medio = precisou confirmar, ruim = a IA nao leu)
-- sao o banco de imagens da casa, base do reconhecimento no proprio celular (fase 2).
--
-- Miniatura em data URI (~6 KB), no padrao do promo_evitar.foto: sem Storage para
-- configurar. Guarda as 20 mais recentes por produto.

create table if not exists visao_memoria (
  household_id  uuid not null references households(id) on delete cascade,
  lido          text not null,          -- o que a IA leu, normalizado (minusculo, sem acento)
  nome          text not null,          -- o nome que a casa confirmou
  vezes         int  not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (household_id, lido)
);
alter table visao_memoria enable row level security;
revoke all on visao_memoria from anon, authenticated;

create table if not exists visao_recortes (
  id           bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  nome         text not null,
  lido         text,
  qualidade    text not null check (qualidade in ('bom', 'medio', 'ruim')),
  imagem       text not null,           -- data:image/jpeg;base64,...
  criado_em    timestamptz not null default now()
);
create index if not exists visao_recortes_casa_nome on visao_recortes (household_id, nome, criado_em desc);
alter table visao_recortes enable row level security;
revoke all on visao_recortes from anon, authenticated;

-- Le a memoria da casa: pares lido -> nome e os nomes conhecidos (memoria + estoque).
create or replace function mercado_visao_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object(
    'ok', true,
    'memoria', coalesce((select json_agg(json_build_object('lido', m.lido, 'nome', m.nome, 'vezes', m.vezes))
                           from visao_memoria m where m.household_id = h), '[]'::json),
    'recortes', coalesce((select json_agg(json_build_object('nome', r.nome, 'qualidade', r.qualidade, 'n', r.n))
                            from (select nome, qualidade, count(*) n from visao_recortes
                                   where household_id = h group by nome, qualidade) r), '[]'::json));
end $fn$;

-- Aprende com o que a pessoa confirmou. p_itens: [{lido, nome, qualidade, imagem}]
create or replace function mercado_visao_aprender_web(p_itens json)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; it json; l text; n text; q text; img text; feitos int := 0;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  for it in select * from json_array_elements(coalesce(p_itens, '[]'::json)) loop
    l := lower(trim(coalesce(it->>'lido', '')));
    n := trim(coalesce(it->>'nome', ''));
    q := coalesce(it->>'qualidade', 'medio');
    img := it->>'imagem';
    continue when n = '' or q not in ('bom', 'medio', 'ruim');
    if l <> '' then
      insert into visao_memoria (household_id, lido, nome) values (h, l, n)
      on conflict (household_id, lido) do update
        set nome = excluded.nome, vezes = visao_memoria.vezes + 1, atualizado_em = now();
    end if;
    if img like 'data:image/%' and length(img) < 60000 then
      insert into visao_recortes (household_id, nome, lido, qualidade, imagem) values (h, n, nullif(l, ''), q, img);
      delete from visao_recortes where id in (
        select id from visao_recortes where household_id = h and nome = n
         order by criado_em desc offset 20);
    end if;
    feitos := feitos + 1;
  end loop;
  return json_build_object('ok', true, 'feitos', feitos);
end $fn$;

revoke execute on function mercado_visao_web(), mercado_visao_aprender_web(json) from public, anon;
grant execute on function mercado_visao_web(), mercado_visao_aprender_web(json) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999053; h uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0053', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;
  insert into visao_memoria (household_id, lido, nome) values (h, 'pilao trad 500', 'Café Pilão');
  insert into visao_recortes (household_id, nome, qualidade, imagem) values (h, 'Café Pilão', 'bom', 'data:image/jpeg;base64,AA');
  begin
    insert into visao_recortes (household_id, nome, qualidade, imagem) values (h, 'x', 'otimo', 'data:');
    assert false, 'qualidade fora de bom/medio/ruim deveria falhar';
  exception when check_violation then null;
  end;
  assert not (mercado_visao_web()->>'ok')::boolean or auth.uid() is not null, 'sem sessao deveria falhar';
  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0053 (memoria da visao) OK';
end $test$;
