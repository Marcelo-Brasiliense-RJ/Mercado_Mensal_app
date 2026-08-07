-- Mercado_app: o modo "No mercado" deixa de depender do Telegram.
-- Rode DEPOIS de 0025.
--
-- Por que existe: o carrinho so podia ser aberto e alimentado pelo bot. O app tinha
-- mercado_trip_web (ler), mercado_trip_finalize_web (fechar) e
-- mercado_trip_remove_item_web (tirar item), mas NAO tinha como comecar nem como pegar.
-- Com o task runner do n8n fora do ar, isso significa que o recurso inteiro esta
-- inalcancavel: nao existe caminho nenhum para abrir uma compra hoje.
--
-- C3 do plano pedia so o mercado_trip_start_web. Sozinho ele entrega um carrinho vazio
-- que ninguem consegue encher, entao aqui vao os quatro que fecham o ciclo pelo app:
--   mercado_trip_start_web   abre (idempotente)
--   mercado_trip_add_web     pega um item
--   mercado_trip_cancel_web  desiste sem efetivar (sem isso, abrir por engano prende
--                            o painel: finalizar exige item e nao havia como fechar)
--   mercado_trip_finalize_web ja existia em 0012
--
-- Como a logica de "pegar" e a mesma para bot e app, ela sai de mercado_trip_add para
-- uma interna mercado_trip_add_h e as duas portas passam a chamar a MESMA funcao. A
-- assinatura de mercado_trip_add fica identica a de 0012/0021, caractere por caractere:
-- o workflow do n8n em producao chama com esses parametros.

-- ============ ABRIR ============
-- Idempotente por construcao, e o indice uq_trip_open_per_house (0012) garante isso no
-- banco: uma compra aberta por casa.
create or replace function mercado_trip_start_h(h uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare tid uuid;
begin
  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    insert into shopping_trips (household_id) values (h) returning id into tid;
  end if;
  return tid;
end $fn$;
revoke execute on function mercado_trip_start_h(uuid) from public, anon, authenticated, service_role;

-- Mesma assinatura e mesmo retorno de 0012, agora delegando.
create or replace function mercado_trip_start(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'trip_id', mercado_trip_start_h(h));
end $fn$;

create or replace function mercado_trip_start_web()
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; tid uuid; ja boolean;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  ja := tid is not null;
  tid := mercado_trip_start_h(h);
  -- 'ja_estava_aberta' deixa a tela decidir se comemora ou fica quieta.
  return json_build_object('ok', true, 'trip_id', tid, 'ja_estava_aberta', ja);
end $fn$;

-- ============ PEGAR ============
-- Corpo identico ao de 0021, com a casa recebida em vez de resolvida por chat_id.
-- Nao ha regra nova aqui: preco ausente cai no ultimo preco pago, item acima do nivel
-- grava com aviso, e a compra abre sozinha se nao houver nenhuma.
create or replace function mercado_trip_add_h(
  h uuid, p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare tid uuid; pid uuid; estoque numeric; nivel numeric; above boolean; total numeric;
        abriu boolean := false; preco numeric; origem text;
begin
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  p_name := lower(trim(coalesce(p_name, '')));
  if p_name = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;

  select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
  if tid is null then
    tid := mercado_trip_start_h(h);
    abriu := true;
  end if;

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  above := pid is not null and nivel is not null and nivel > 0
           and estoque is not null and estoque >= nivel;

  if p_price is not null then
    preco  := p_price;
    origem := 'informado';
  else
    select unit_price into preco from purchases
      where product_id = pid order by purchased_at desc limit 1;
    origem := 'historico';
    if preco is null then
      return json_build_object('ok', false, 'erro', 'sem_preco', 'item', p_name,
        'compra_aberta_agora', abriu);
    end if;
  end if;

  insert into trip_items (trip_id, household_id, product_id, item_name, quantity, unit, unit_price, above_par)
    values (tid, h, pid, p_name, coalesce(p_qty,1), coalesce(p_unit,'un'), preco, above);

  select coalesce(sum(quantity * unit_price), 0) into total from trip_items where trip_id = tid;
  return json_build_object('ok', true, 'needs_confirm', false, 'item', p_name,
    'above_par', above, 'total_parcial', total, 'compra_aberta_agora', abriu,
    'preco', preco, 'preco_origem', origem,
    'aviso', case when above then 'ja_tinha_em_casa' else null end,
    'estoque_atual', coalesce(estoque,0), 'nivel_normal', coalesce(nivel,0));
end $fn$;
revoke execute on function mercado_trip_add_h(uuid, text, numeric, numeric, text)
  from public, anon, authenticated, service_role;

-- ASSINATURA INTOCADA (o n8n chama assim). p_confirm continua ignorado, como em 0021.
create or replace function mercado_trip_add(
  p_chat_id bigint, p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un', p_confirm boolean default false)
returns json language plpgsql security definer set search_path = public as $fn$
begin
  return mercado_trip_add_h(mercado_resolve_household(p_chat_id), p_name, p_price, p_qty, p_unit);
end $fn$;

create or replace function mercado_trip_add_web(
  p_name text, p_price numeric default null,
  p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_trip_add_h(h, p_name, p_price, p_qty, p_unit);
end $fn$;

-- ============ DESISTIR ============
create or replace function mercado_trip_cancel_web()
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; n int;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  update shopping_trips set status = 'cancelled', finalized_at = now()
    where household_id = h and status = 'open';
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'cancelada', n > 0);
end $fn$;

-- ============ PERMISSOES ============
revoke execute on function
  mercado_trip_start(bigint),
  mercado_trip_add(bigint, text, numeric, numeric, text, boolean)
  from public, anon;
grant execute on function
  mercado_trip_start(bigint),
  mercado_trip_add(bigint, text, numeric, numeric, text, boolean)
  to service_role;

revoke execute on function
  mercado_trip_start_web(),
  mercado_trip_add_web(text, numeric, numeric, text),
  mercado_trip_cancel_web()
  from public, anon;
grant execute on function
  mercado_trip_start_web(),
  mercado_trip_add_web(text, numeric, numeric, text),
  mercado_trip_cancel_web()
  to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
-- O caminho autenticado nao e testavel em SQL (auth_user_id tem FK para auth.users),
-- mesma limitacao da A2 e da 0025. O que este bloco prova e o miolo compartilhado:
-- mercado_trip_add_h e mercado_trip_start_h, que e por onde as duas portas passam.
do $test$
declare cid bigint := 999999061; h uuid; r json; t1 uuid; t2 uuid; n int;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0026', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- abrir e idempotente: duas chamadas, uma compra so
  t1 := mercado_trip_start_h(h);
  t2 := mercado_trip_start_h(h);
  assert t1 = t2, 'abrir duas vezes deveria devolver a MESMA compra';
  assert (select count(*) from shopping_trips where household_id = h and status = 'open') = 1,
    'nao pode existir mais de uma compra aberta por casa';

  -- pegar com preco informado
  r := mercado_trip_add_h(h, 'arroz', 25.00, 2, 'kg');
  assert (r->>'ok')::boolean,                       'pegar com preco deveria gravar';
  assert (r->>'preco_origem') = 'informado',        'preco veio do usuario';
  assert (r->>'total_parcial')::numeric = 50.00,    format('2 x 25 = 50, veio %s', r->>'total_parcial');

  -- item sem historico e sem preco: perguntar e inevitavel
  r := mercado_trip_add_h(h, 'quinoa', null, 1, 'kg');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_preco',
    'produto nunca comprado e sem preco tem que devolver sem_preco';

  -- nome vazio nao cria lixo no carrinho
  r := mercado_trip_add_h(h, '   ', 10, 1, 'un');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_nome', 'nome vazio deveria ser sem_nome';

  -- casa nao resolvida nao estoura, devolve erro tratado
  r := mercado_trip_add_h(null, 'arroz', 10, 1, 'kg');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem casa deveria ser sem_familia';

  -- carrinho aberto sozinho quando nao havia nenhum
  update shopping_trips set status = 'cancelled' where household_id = h and status = 'open';
  r := mercado_trip_add_h(h, 'arroz', 25.00, 1, 'kg');
  assert (r->>'compra_aberta_agora')::boolean, 'sem compra aberta, pegar tem que abrir uma';

  -- preco do historico: 'arroz' agora existe em purchases? nao, trip_items nao vira compra
  -- ate finalizar. Entao o fallback e testado com uma compra real gravada a mao.
  insert into products (household_id, name, unit, current_stock, par_level)
    values (h, 'feijao', 'kg', 5, 2);
  insert into purchases (household_id, product_id, item_name, unit_price, quantity, unit)
    select h, id, 'feijao', 9.50, 1, 'kg' from products where household_id = h and name = 'feijao';
  r := mercado_trip_add_h(h, 'feijao', null, 1, 'kg');
  assert (r->>'ok')::boolean,                       'com historico, preco ausente nao bloqueia';
  assert (r->>'preco_origem') = 'historico',        'preco deveria vir do historico';
  assert (r->>'preco')::numeric = 9.50,             format('ultimo preco pago era 9.50, veio %s', r->>'preco');
  assert (r->>'aviso') = 'ja_tinha_em_casa',        'estoque 5 acima do nivel 2 deveria avisar, sem impedir';

  select count(*) into n from trip_items ti join shopping_trips s on s.id = ti.trip_id
    where s.household_id = h and s.status = 'open';
  assert n = 2, format('carrinho aberto deveria ter 2 itens, veio %s', n);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0026 (carrinho pelo app) OK';
end $test$;