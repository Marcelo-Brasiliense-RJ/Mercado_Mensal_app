-- Mercado_app: perguntar por UM item, e "esta faltando" passar a zerar o estoque.
-- Rode DEPOIS de 0027. Dois defeitos relatados pelo dono em uso real.
--
-- 1. "Tem arroz na minha lista? Se tem, quantos?" devolvia a lista INTEIRA.
--    O agente classificou certo (consultar, tipo faltando), mas o contrato so tinha
--    tres tipos (estoque | faltando | economia) e nenhum filtro por item. Numa
--    despensa de 102 produtos, perguntar de um item despeja tudo.
--
--    Conserto sem tocar no workflow: o no "Consultar (RPC)" ja manda p_tipo. Quando
--    p_tipo NAO for um dos tres conhecidos, tratamos o valor como nome de item.
--    Zero mudanca no n8n, so no prompt do agente e aqui.
--
-- 2. "tenho cloro" poe no estoque; logo depois "esta faltando cloro" punha na LISTA
--    e deixava o estoque intacto, entao o item aparecia com a tag "ja tenho" e em
--    casa ao mesmo tempo. Decisao do dono: dizer que falta significa que ACABOU.
--    Zera o estoque e poe na lista.

-- ============ 1. CONSULTA POR ITEM ============
-- Corpo identico ao que estava no banco, com UM ramo novo antes do default.
create or replace function mercado_consulta_texto(p_chat_id bigint, p_tipo text)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  h uuid; linhas text; n int; gasto numeric; orc numeric; txt text;
  linhas_lista text; n_lista int;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then
    return json_build_object('ok', false, 'erro', 'sem_familia',
      'text', 'Você ainda não entrou numa família. Me diga "criar família" com um nome, ou "entrar" com o código de convite.');
  end if;

  p_tipo := lower(trim(coalesce(p_tipo, 'estoque')));

  if p_tipo = 'economia' then
    select coalesce(sum(unit_price * quantity), 0) into gasto
      from purchases
      where household_id = h
        and date_trunc('month', purchased_at) = date_trunc('month', current_date);
    select amount into orc from budgets
      where household_id = h and month = date_trunc('month', current_date)::date limit 1;
    txt := '💰 Economia do mês' || chr(10)
        || 'Gasto: R$ ' || replace(to_char(gasto, 'FM999999990.00'), '.', ',');
    if orc is not null and orc > 0 then
      txt := txt || chr(10) || 'Orçamento: R$ ' || replace(to_char(orc, 'FM999999990.00'), '.', ',');
      if gasto > orc then
        txt := txt || chr(10) || 'Você passou R$ ' || replace(to_char(gasto - orc, 'FM999999990.00'), '.', ',') || ' do orçamento.';
      else
        txt := txt || chr(10) || 'Ainda dá pra gastar R$ ' || replace(to_char(orc - gasto, 'FM999999990.00'), '.', ',') || '.';
      end if;
    end if;
    return json_build_object('ok', true, 'text', txt);
  end if;

  if p_tipo = 'faltando' then
    select string_agg('• ' || initcap(item_name)
                        || case when coalesce(desired_quantity, 0) > 0
                                then ' (' || mercado_fmt_num(desired_quantity) || ' ' || coalesce(unit, 'un') || ')'
                                else '' end, chr(10)
                        order by item_name),
           count(*)
      into linhas, n
      from shopping_list
      where household_id = h and status = 'pending';
    if coalesce(n, 0) = 0 then
      return json_build_object('ok', true,
        'text', '🛒 Sua lista de compras está vazia. Me diga o que está faltando que eu anoto.');
    end if;
    return json_build_object('ok', true,
      'text', '🛒 Lista de compras (' || n || '):' || chr(10) || linhas);
  end if;

  -- ===== RAMO NOVO: p_tipo nao e um dos tres, entao e o nome de um item =====
  -- Busca por trecho, nao por igualdade: "acucar" acha "acucar demerara" e
  -- "acucar refinado", que hoje sao produtos separados nesta base.
  if p_tipo <> 'estoque' then
    select string_agg('• ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
                        order by name), count(*)
      into linhas, n
      from products where household_id = h and name ilike '%' || p_tipo || '%';

    select string_agg('• ' || initcap(item_name)
                        || case when coalesce(desired_quantity, 0) > 0
                                then ' (' || mercado_fmt_num(desired_quantity) || ' ' || coalesce(unit, 'un') || ')'
                                else '' end, chr(10)
                        order by item_name), count(*)
      into linhas_lista, n_lista
      from shopping_list
      where household_id = h and status = 'pending' and item_name ilike '%' || p_tipo || '%';

    if coalesce(n, 0) = 0 and coalesce(n_lista, 0) = 0 then
      return json_build_object('ok', true,
        'text', initcap(p_tipo) || ' não está no seu estoque nem na lista de compras.');
    end if;

    txt := '🔎 ' || initcap(p_tipo);
    txt := txt || chr(10) || chr(10) || '📦 Em casa:' || chr(10)
        || coalesce(linhas, '• nada cadastrado');
    txt := txt || chr(10) || chr(10) || '🛒 Na lista:' || chr(10)
        || coalesce(linhas_lista, '• não está na lista');
    return json_build_object('ok', true, 'text', txt);
  end if;

  -- default: estoque (o que tem em casa)
  select string_agg('• ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
                      order by name),
         count(*)
    into linhas, n
    from products
    where household_id = h and current_stock > 0;
  if coalesce(n, 0) = 0 then
    return json_build_object('ok', true, 'text', '📦 Seu estoque está vazio. Registre uma compra que eu começo a acompanhar.');
  end if;
  if length(linhas) > 3500 then
    linhas := left(linhas, 3500) || chr(10) || '… (lista grande, veja tudo no app)';
  end if;
  return json_build_object('ok', true,
    'text', '📦 Estoque (' || n || ' itens):' || chr(10) || linhas);
end $fn$;

-- ============ 2. "ESTA FALTANDO" ZERA O ESTOQUE ============
-- Corpo de 0023, com o bloco de zeramento acrescentado.
-- So a rota do BOT muda. mercado_list_add_web (app) fica como esta de proposito:
-- la o usuario toca em "Adicionar a lista" para repor um item que ele sabe que tem,
-- e zerar o estoque nesse gesto seria destrutivo e surpreendente.
create or replace function mercado_add_to_list(
  p_chat_id bigint, p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; pid uuid; estoque numeric; nivel numeric; ult_preco numeric;
        qtd numeric; lid uuid; zerou numeric := 0;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id, current_stock, par_level into pid, estoque, nivel
    from products where household_id = h and name = p_name;

  select unit_price into ult_preco from purchases
    where product_id = pid order by purchased_at desc limit 1;

  -- Se o estoque diz que tem, "esta faltando" quer dizer que acabou. Zera e registra
  -- o ajuste como evento proprio, para o desfazer conseguir devolver o valor antigo.
  -- Antes disto o item ficava na lista com a tag "ja tenho" E em casa ao mesmo tempo.
  if pid is not null and coalesce(estoque, 0) > 0 then
    zerou := estoque;
    update products set current_stock = 0, updated_at = now() where id = pid;
    perform mercado_log_event(h, pid, p_name, 'estoque_ajustado', zerou, 0, zerou, 'bot',
      jsonb_build_object('motivo', 'faltando_zera_estoque'));
    estoque := 0;
  end if;

  -- Com o estoque zerado, "quanto comprar" passa a ser o nivel normal inteiro.
  if coalesce(p_qty, 0) > 0 then
    qtd := p_qty;
  elsif nivel is not null and nivel > 0 then
    qtd := greatest(1, ceil(nivel - coalesce(estoque, 0)));
  else
    qtd := 1;
  end if;

  insert into shopping_list (household_id, product_id, item_name, desired_quantity, unit, estimated_price)
    values (h, pid, p_name, qtd, coalesce(p_unit,'un'), ult_preco)
    returning id into lid;

  perform mercado_log_event(h, pid, p_name, 'adicionado_lista',
    coalesce(estoque,0), coalesce(estoque,0), qtd, 'bot', jsonb_build_object('list_id', lid));

  return json_build_object('ok', true, 'item', p_name,
    -- ja_tem_em_casa agora e sempre false: se tinha, acabou de ser zerado.
    'ja_tem_em_casa', false, 'estoque_zerado', zerou,
    'estoque_atual', 0, 'nivel_normal', coalesce(nivel,0),
    'preco_estimado', ult_preco, 'quantidade', qtd,
    'acao', 'adicionado_lista', 'antes', coalesce(estoque,0), 'depois', coalesce(estoque,0));
end $fn$;

revoke execute on function mercado_consulta_texto(bigint, text) from public, anon;
grant  execute on function mercado_consulta_texto(bigint, text) to service_role;
revoke execute on function mercado_add_to_list(bigint, text, numeric, text) from public, anon;
grant  execute on function mercado_add_to_list(bigint, text, numeric, text) to service_role;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999081; h uuid; r json; t text; est numeric;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0028', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- ===== consulta por item =====
  r := mercado_consulta_texto(cid, 'arroz');
  assert (r->>'text') like 'Arroz não está%', format('item inexistente deveria dizer que nao esta, veio: %s', r->>'text');

  perform mercado_apply_inventory(cid, 'arroz', 5, 'kg');
  r := mercado_consulta_texto(cid, 'arroz');
  t := r->>'text';
  assert t like '🔎 Arroz%',      format('deveria abrir com a lupa e o nome, veio: %s', t);
  assert t like '%5 kg%',          format('deveria dizer 5 kg em casa, veio: %s', t);
  assert t not like '%Cloro%',     'consulta de arroz nao pode listar outros itens';

  -- busca por trecho acha os nomes fragmentados, que e o caso real desta base
  perform mercado_apply_inventory(cid, 'acucar demerara', 1, 'kg');
  perform mercado_apply_inventory(cid, 'acucar refinado', 2, 'kg');
  r := mercado_consulta_texto(cid, 'acucar');
  t := r->>'text';
  assert t like '%Demerara%' and t like '%Refinado%',
    format('busca por trecho deveria achar as duas variacoes, veio: %s', t);

  -- os tres tipos classicos continuam funcionando
  assert (mercado_consulta_texto(cid, 'estoque')->>'text')  like '📦 Estoque%',  'tipo estoque quebrou';
  assert (mercado_consulta_texto(cid, 'economia')->>'text') like '💰 Economia%', 'tipo economia quebrou';
  assert (mercado_consulta_texto(cid, 'faltando')->>'text') like '🛒 Sua lista%','tipo faltando quebrou';

  -- ===== "esta faltando" zera o estoque =====
  -- o caso do cloro: tenho 1, depois digo que esta faltando
  perform mercado_apply_inventory(cid, 'cloro', 1, 'un');
  select current_stock into est from products where household_id = h and name = 'cloro';
  assert est = 1, 'sanidade: cloro deveria estar com 1 em casa';

  r := mercado_add_to_list(cid, 'cloro', 1, 'un');
  assert (r->>'ok')::boolean,                      'deveria adicionar a lista';
  assert (r->>'estoque_zerado')::numeric = 1,      format('deveria informar que zerou 1, veio %s', r->>'estoque_zerado');
  assert not (r->>'ja_tem_em_casa')::boolean,      'depois de zerar, nao pode dizer que ainda tem em casa';

  select current_stock into est from products where household_id = h and name = 'cloro';
  assert est = 0, format('o estoque do cloro tinha que ter zerado, veio %s', est);
  assert (select status from shopping_list where household_id = h and item_name = 'cloro') = 'pending',
    'o cloro deveria estar pendente na lista';

  -- o desfazer devolve o estoque: primeiro tira da lista, depois destroi o zeramento
  perform mercado_desfazer(cid);
  perform mercado_desfazer(cid);
  select current_stock into est from products where household_id = h and name = 'cloro';
  assert est = 1, format('dois desfazer deveriam devolver o cloro para 1, veio %s', est);

  -- item que NAO tem em casa nao mexe em estoque nenhum
  r := mercado_add_to_list(cid, 'quinoa', 2, 'kg');
  assert (r->>'estoque_zerado')::numeric = 0, 'item sem estoque nao tem o que zerar';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0028 (consulta por item + faltando zera estoque) OK';
end $test$;
