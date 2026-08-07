-- Mercado_app: "ver carrinho" pelo Telegram.
-- Rode DEPOIS de 0031.
--
-- Pedido do dono, depois de tentar e o bot INVENTAR a lista: ele pediu o carrinho, o
-- agente devolveu op pegar sem item nenhum e o no Code respondeu so "Feito.", enquanto
-- a resposta do modelo trazia uma lista montada de memoria da conversa. Nao havia rota
-- para ler o carrinho, e o que o modelo nao tem ele preenche.
--
-- Mesmo atalho da consulta por item (0028): o no "Consultar (RPC)" ja manda p_tipo,
-- entao 'carrinho' vira mais um tipo e nao precisa de saida nova no switch.
-- O ramo tem que vir ANTES do de nome de item, senao "carrinho" seria procurado como
-- se fosse um produto chamado carrinho.
create or replace function mercado_consulta_texto(p_chat_id bigint, p_tipo text)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  h uuid; linhas text; n int; gasto numeric; orc numeric; txt text;
  linhas_lista text; n_lista int; usa_emoji boolean; tid uuid; total numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then
    return json_build_object('ok', false, 'erro', 'sem_familia',
      'text', 'Você ainda não entrou numa família. Me diga "criar família" com um nome, ou "entrar" com o código de convite.');
  end if;

  select coalesce((prefs->>'emoji')::boolean, false) into usa_emoji
    from household_members where telegram_chat_id = p_chat_id limit 1;
  usa_emoji := coalesce(usa_emoji, false);

  p_tipo := lower(trim(coalesce(p_tipo, 'estoque')));

  -- ===== CARRINHO (compra aberta agora) =====
  if p_tipo in ('carrinho', 'compra', 'mercado') then
    select id into tid from shopping_trips where household_id = h and status = 'open' limit 1;
    if tid is null then
      return json_build_object('ok', true,
        'text', '🛒 Você não está numa compra agora. Diga "tô no mercado" para começar.');
    end if;

    select string_agg(case when usa_emoji then mercado_emoji(item_name) else '•' end
                        || ' ' || initcap(item_name)
                        || case when quantity > 1 then ' · ' || mercado_fmt_num(quantity) || ' ' || coalesce(unit,'un') else '' end
                        || ' · R$ ' || replace(to_char(quantity * unit_price, 'FM999999990.00'), '.', ','),
                        chr(10) order by created_at),
           count(*), coalesce(sum(quantity * unit_price), 0)
      into linhas, n, total
      from trip_items where trip_id = tid;

    if coalesce(n, 0) = 0 then
      return json_build_object('ok', true,
        'text', '🛒 Compra aberta, carrinho ainda vazio. Vá falando o que for pegando.');
    end if;

    txt := '🛒 No carrinho (' || n || '):' || chr(10) || linhas
        || chr(10) || '🧾 Total: R$ ' || replace(to_char(total, 'FM999999990.00'), '.', ',');

    select amount into orc from budgets
      where household_id = h and month = date_trunc('month', current_date)::date limit 1;
    if orc is not null then
      select coalesce(sum(unit_price * quantity), 0) into gasto from purchases
        where household_id = h and date_trunc('month', purchased_at) = date_trunc('month', current_date);
      txt := txt || chr(10)
          || case when orc - gasto - total >= 0
                  then '💰 Orçamento R$ ' || replace(to_char(orc, 'FM999999990.00'), '.', ',')
                       || ' · ainda cabe R$ ' || replace(to_char(orc - gasto - total, 'FM999999990.00'), '.', ',')
                  else '⚠️ Orçamento R$ ' || replace(to_char(orc, 'FM999999990.00'), '.', ',')
                       || ' · passou R$ ' || replace(to_char(gasto + total - orc, 'FM999999990.00'), '.', ',') end;
    end if;
    return json_build_object('ok', true, 'text', txt);
  end if;

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
    select string_agg(case when usa_emoji then mercado_emoji(item_name) else '•' end
                        || ' ' || initcap(item_name)
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

  if p_tipo <> 'estoque' then
    select string_agg(case when usa_emoji then mercado_emoji(name) else '•' end
                        || ' ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
                        order by name), count(*)
      into linhas, n
      from products where household_id = h and name ilike '%' || p_tipo || '%';

    select string_agg(case when usa_emoji then mercado_emoji(item_name) else '•' end
                        || ' ' || initcap(item_name)
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

  select string_agg(case when usa_emoji then mercado_emoji(name) else '•' end
                      || ' ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
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

revoke execute on function mercado_consulta_texto(bigint, text) from public, anon;
grant  execute on function mercado_consulta_texto(bigint, text) to service_role;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999121; h uuid; t text;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0032', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- sem compra aberta
  t := mercado_consulta_texto(cid, 'carrinho')->>'text';
  assert t like '%não está numa compra%', format('sem compra deveria convidar a comecar, veio: %s', t);

  -- carrinho aberto e vazio
  perform mercado_trip_start_h(h);
  t := mercado_consulta_texto(cid, 'carrinho')->>'text';
  assert t like '%carrinho ainda vazio%', format('aberto e vazio tem texto proprio, veio: %s', t);

  -- com itens: lista e total de verdade, nao de memoria
  perform mercado_trip_add_h(h, 'arroz', 10.98, 1, 'un');
  perform mercado_trip_add_h(h, 'milho de pipoca', 3.79, 2, 'un');
  t := mercado_consulta_texto(cid, 'carrinho')->>'text';
  assert t like '%Arroz%' and t like '%Milho De Pipoca%', format('deveria listar os itens, veio: %s', t);
  assert t like '%7,58%',  format('2 x 3,79 deveria aparecer como 7,58, veio: %s', t);
  assert t like '%18,56%', format('total deveria ser 10,98 + 7,58 = 18,56, veio: %s', t);

  -- com orcamento, mostra quanto ainda cabe
  perform mercado_budget_set(cid, 100);
  t := mercado_consulta_texto(cid, 'carrinho')->>'text';
  assert t like '%ainda cabe%81,44%', format('100 menos 18,56 = 81,44, veio: %s', t);

  -- os tipos antigos continuam de pe. Precisa de estoque de verdade: item de
  -- carrinho so vira produto ao finalizar a compra, entao sem isto a casa de teste
  -- responde "estoque vazio" e o assert falha por culpa do teste, nao da funcao.
  perform mercado_apply_inventory(cid, 'feijao', 3, 'kg');
  assert (mercado_consulta_texto(cid, 'estoque')->>'text')  like '📦 Estoque%',  'tipo estoque quebrou';
  assert (mercado_consulta_texto(cid, 'faltando')->>'text') like '🛒 Sua lista%','tipo faltando quebrou';
  -- consulta por item usa o feijao, nao o arroz: o arroz desta casa de teste so
  -- existe no CARRINHO, e item de carrinho nao esta no estoque nem na lista ainda.
  assert (mercado_consulta_texto(cid, 'feijao')->>'text')   like '🔎 Feijao%',   'consulta por item quebrou';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0032 (ver carrinho) OK';
end $test$;
