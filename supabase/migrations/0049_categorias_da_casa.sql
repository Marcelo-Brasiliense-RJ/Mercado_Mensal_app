-- Mercado_app: cada casa tem as suas categorias do estoque (criar, renomear, excluir,
-- trocar o icone e a ordem). Rode DEPOIS de 0048.
--
-- Por que existe: as 14 categorias dos encartes servem de partida, mas cada casa
-- organiza a despensa do seu jeito ("Cafe da manha", "Bebe", "Churrasco"...).
--
-- Sem linhas em casa_categorias, a casa usa as 14 padrao (nada muda para quem nao mexe).
-- Salvar manda a lista inteira, na ordem: o que tem `antigo` diferente do nome foi
-- renomeado (os itens vao junto); o que sumiu da lista foi excluido (os itens voltam ao
-- palpite pelo nome). "Outros" nao sai: e para onde vai o que nao tem categoria.

create table if not exists casa_categorias (
  household_id uuid not null references households(id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 1 and 40),
  icone        text not null default '🛒' check (length(icone) <= 16),
  ordem        int not null,
  primary key (household_id, nome)
);
alter table casa_categorias enable row level security;
revoke all on casa_categorias from anon, authenticated;

create or replace function mercado_categorias_padrao()
returns json language sql immutable as $fn$
  select json_build_array(
    json_build_object('nome', 'Hortifruti', 'icone', '🥦'), json_build_object('nome', 'Padaria', 'icone', '🍞'),
    json_build_object('nome', 'Carnes', 'icone', '🥩'), json_build_object('nome', 'Frios e Laticínios', 'icone', '🧀'),
    json_build_object('nome', 'Congelados', 'icone', '🧊'), json_build_object('nome', 'Mercearia', 'icone', '🥫'),
    json_build_object('nome', 'Doces e Biscoitos', 'icone', '🍪'), json_build_object('nome', 'Bebidas', 'icone', '🥤'),
    json_build_object('nome', 'Limpeza', 'icone', '🧽'), json_build_object('nome', 'Perfumaria e Higiene', 'icone', '🧴'),
    json_build_object('nome', 'Bebê', 'icone', '🍼'), json_build_object('nome', 'Pet', 'icone', '🐾'),
    json_build_object('nome', 'Utilidades', 'icone', '🔦'), json_build_object('nome', 'Outros', 'icone', '🛒'));
$fn$;

create or replace function mercado_categorias_h(h uuid)
returns json language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select json_agg(json_build_object('nome', nome, 'icone', icone) order by ordem)
       from casa_categorias where household_id = h),
    mercado_categorias_padrao());
$fn$;
revoke execute on function mercado_categorias_h(uuid) from public, anon, authenticated;

create or replace function mercado_categorias_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'categorias', mercado_categorias_h(h));
end $fn$;

-- p_lista: [{nome, icone, antigo?}] na ordem desejada.
create or replace function mercado_categorias_salvar_web(p_lista jsonb)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; x jsonb; i int := 0; nomes text[] := '{}'; antes text[];
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if jsonb_typeof(p_lista) <> 'array' or jsonb_array_length(p_lista) = 0 then
    return json_build_object('ok', false, 'erro', 'lista_vazia');
  end if;
  for x in select * from jsonb_array_elements(p_lista) loop
    if length(trim(coalesce(x->>'nome', ''))) not between 1 and 40 then
      return json_build_object('ok', false, 'erro', 'nome_invalido');
    end if;
    if trim(x->>'nome') = any(nomes) then return json_build_object('ok', false, 'erro', 'nome_repetido'); end if;
    nomes := nomes || trim(x->>'nome');
  end loop;
  if not 'Outros' = any(nomes) then nomes := nomes || 'Outros'::text; p_lista := p_lista || '[{"nome":"Outros","icone":"🛒"}]'; end if;

  select array_agg(e->>'nome') into antes from json_array_elements(mercado_categorias_h(h)) e;

  -- renomeados: os itens vao junto
  for x in select * from jsonb_array_elements(p_lista) loop
    if coalesce(x->>'antigo', '') <> '' and x->>'antigo' <> trim(x->>'nome') then
      update products set categoria = trim(x->>'nome') where household_id = h and categoria = x->>'antigo';
    end if;
  end loop;
  -- excluidos: os itens voltam ao palpite pelo nome
  update products set categoria = null
   where household_id = h and categoria is not null and not categoria = any(nomes);

  delete from casa_categorias where household_id = h;
  for x in select * from jsonb_array_elements(p_lista) loop
    i := i + 1;
    insert into casa_categorias (household_id, nome, icone, ordem)
    values (h, trim(x->>'nome'), coalesce(nullif(trim(x->>'icone'), ''), '🛒'), i);
  end loop;
  return json_build_object('ok', true, 'categorias', mercado_categorias_h(h));
end $fn$;

-- A escolha do item (0048) passa a aceitar as categorias da casa.
create or replace function mercado_stock_categoria_web(p_id uuid, p_categoria text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c text := nullif(trim(coalesce(p_categoria, '')), '');
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if c is not null and not exists (
    select 1 from json_array_elements(mercado_categorias_h(h)) e where e->>'nome' = c
  ) then
    return json_build_object('ok', false, 'erro', 'categoria_invalida');
  end if;
  update products set categoria = c, updated_at = now() where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return json_build_object('ok', true);
end $fn$;

revoke execute on function mercado_categorias_web(), mercado_categorias_salvar_web(jsonb) from public, anon;
grant execute on function mercado_categorias_web(), mercado_categorias_salvar_web(jsonb) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999049; h uuid; pid uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0049', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  assert json_array_length(mercado_categorias_h(h)) = 14, 'sem escolha: as 14 padrao';

  insert into products (household_id, name, unit, categoria) values (h, 'item teste 0049', 'un', 'Mercearia')
  returning id into pid;
  insert into casa_categorias (household_id, nome, icone, ordem) values (h, 'Despensa', '🥫', 1), (h, 'Outros', '🛒', 2);
  -- renomear leva o item junto (simula o salvar sem sessao)
  update products set categoria = 'Despensa' where household_id = h and categoria = 'Mercearia';
  assert (select categoria from products where id = pid) = 'Despensa', 'renomear leva os itens';
  assert json_array_length(mercado_categorias_h(h)) = 2, 'a casa usa as suas';
  assert (mercado_categorias_salvar_web('[]'::jsonb)->>'ok') = 'false', 'lista vazia nao apaga tudo';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0049 (categorias da casa) OK';
end $test$;
