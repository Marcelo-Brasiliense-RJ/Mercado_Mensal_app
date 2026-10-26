-- Mercado_app: lista de compras para o monitor de promocoes (so leitura).
-- Rode DEPOIS de 0036.
--
-- Por que existe: o monitor (promocoes/coletor) cruza as ofertas dos encartes com o que a
-- casa precisa comprar. Digitar essa lista de novo no monitor viola a regra 1 da secao 0.1
-- do tarefas.md (nunca perguntar duas vezes): o app ja sabe o que falta.
--
-- "O que falta" = itens pendentes da lista de compras + produtos em "Repor" (mesmo corte da
-- tela de Estoque e da 0017: par_level > 0 e estoque abaixo da metade do par_level).
-- Junto vai o ultimo preco pago, para o monitor mostrar "voce pagou X, la esta Y".
--
-- Nao escreve nada e nao cria tabela: o monitor guarda ofertas e alertas do lado dele.
-- ponytail: so service_role executa (o monitor roda no servidor/cron). Se o monitor virar
-- tela do app, o upgrade e uma porta _web que resolve a casa por auth.uid(), no padrao 0035.

create or replace function mercado_promo_lista_h(h uuid)
returns json language sql stable security definer set search_path = public as $fn$
  with itens as (
    select lower(trim(item_name)) as nome, unit as unidade, 'lista' as origem, desired_quantity as quantidade
      from shopping_list
     where household_id = h and status = 'pending'
    union all
    select p.name, p.unit, 'repor', greatest(p.par_level - p.current_stock, 0)
      from products p
     where p.household_id = h and p.par_level > 0 and p.current_stock < p.par_level * 0.5
  ), unicos as (
    -- o mesmo item na lista e em Repor aparece uma vez so; a lista (pedido explicito) ganha
    select distinct on (nome) nome, unidade, origem, quantidade
      from itens
     order by nome, (origem = 'lista') desc
  )
  select coalesce(json_agg(json_build_object(
           'nome', u.nome, 'unidade', u.unidade, 'origem', u.origem, 'quantidade', u.quantidade,
           'ultimo_preco', ult.unit_price, 'ultima_marca', ult.brand, 'ultima_compra', ult.purchased_at)
         order by u.nome), '[]'::json)
    from unicos u
    left join lateral (
      select pu.unit_price, pu.brand, pu.purchased_at
        from purchases pu
       where pu.household_id = h and lower(trim(pu.item_name)) = u.nome and pu.unit_price > 0
       order by pu.purchased_at desc
       limit 1
    ) ult on true;
$fn$;

-- ============ PERMISSOES ============
revoke execute on function mercado_promo_lista_h(uuid) from public, anon, authenticated;
grant execute on function mercado_promo_lista_h(uuid) to service_role;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999037; h uuid; r json; n int;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0037', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- casa sem nada: lista vazia, nao erro
  assert mercado_promo_lista_h(h)::text = '[]', 'casa vazia deveria devolver []';

  insert into products (household_id, name, unit, par_level, current_stock) values
    (h, 'arroz', 'kg', 5, 1),     -- 1 < 2,5: Repor
    (h, 'feijao', 'kg', 2, 2),    -- cheio: fora
    (h, 'cafe', 'un', 0, 0),      -- sem par_level: fora
    (h, 'leite', 'l', 12, 2);     -- Repor, e tambem na lista abaixo
  insert into shopping_list (household_id, item_name, desired_quantity, unit, status) values
    (h, 'Leite', 6, 'l', 'pending'),
    (h, 'azeite', 1, 'un', 'pending'),
    (h, 'sabao', 1, 'un', 'bought');  -- ja comprado: fora
  insert into purchases (household_id, item_name, brand, unit_price, quantity, unit, purchased_at) values
    (h, 'arroz', 'Tio Joao', 22.90, 1, 'un', now() - interval '20 days'),
    (h, 'arroz', 'Rei do Sul', 18.50, 1, 'un', now() - interval '2 days');

  r := mercado_promo_lista_h(h);
  n := json_array_length(r);
  assert n = 3, format('deveria ter arroz, azeite e leite, veio %s', r);
  assert r->0->>'nome' = 'arroz' and r->0->>'origem' = 'repor', format('arroz deveria vir de Repor, veio %s', r->0);
  assert (r->0->>'ultimo_preco')::numeric = 18.50 and r->0->>'ultima_marca' = 'Rei do Sul',
    format('arroz deveria trazer a compra mais recente, veio %s', r->0);
  assert r->1->>'nome' = 'azeite' and r->1->>'ultimo_preco' is null, format('azeite sem compra, veio %s', r->1);
  assert r->2->>'nome' = 'leite' and r->2->>'origem' = 'lista', format('leite na lista e em Repor vira um so, da lista: %s', r->2);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0037 (lista do monitor de promocoes) OK';
end $test$;
