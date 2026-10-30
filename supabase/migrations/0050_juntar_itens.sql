-- Mercado_app: juntar itens repetidos do estoque. Rode DEPOIS de 0049.
--
-- Por que existe: o mesmo produto entra com nomes diferentes (leitor, foto, voz:
-- "tipity granulada torrada e empacotada..." e "farinha de mandioca tipity granulada 500g")
-- e vira dois itens. Juntar mantem um so, com tudo dos outros: quantidade (mesma unidade),
-- historico de compras, codigos de barras, lista e carrinho.

create or replace function mercado_stock_juntar_web(p_destino uuid, p_outros uuid[], p_nome text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; d products; n int; nome text := nullif(trim(coalesce(p_nome, '')), '');
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_outros := array(select x from unnest(coalesce(p_outros, '{}')) x where x <> p_destino);
  if cardinality(p_outros) = 0 then return json_build_object('ok', false, 'erro', 'nada_para_juntar'); end if;

  select * into d from products where id = p_destino and household_id = h for update;
  if d.id is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  select count(*) into n from products where id = any(p_outros) and household_id = h;
  if n <> cardinality(p_outros) then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  -- quantidade so soma na mesma unidade (2 un + 1 kg nao vira 3 de nada)
  update products set
    current_stock = d.current_stock + coalesce((select sum(current_stock) from products
                                                 where id = any(p_outros) and unit = d.unit), 0),
    par_level = greatest(d.par_level, coalesce((select max(par_level) from products
                                                  where id = any(p_outros) and unit = d.unit), 0)),
    categoria = coalesce(d.categoria, (select categoria from products where id = any(p_outros) and categoria is not null limit 1)),
    updated_at = now()
  where id = p_destino;

  update purchases set product_id = p_destino where product_id = any(p_outros);
  update shopping_list set product_id = p_destino where product_id = any(p_outros);
  update trip_items set product_id = p_destino where product_id = any(p_outros);
  update mercado_events set product_id = p_destino where product_id = any(p_outros);
  update product_barcodes set product_id = p_destino where product_id = any(p_outros);
  -- fixos do mes (0046) seguem pelo nome
  delete from products where id = any(p_outros);

  if nome is not null and nome <> d.name then
    if exists (select 1 from products where household_id = h and name = nome and id <> p_destino) then
      return json_build_object('ok', false, 'erro', 'nome_em_uso');
    end if;
    update products set name = nome where id = p_destino;
  end if;
  return json_build_object('ok', true, 'juntados', cardinality(p_outros));
end $fn$;

revoke execute on function mercado_stock_juntar_web(uuid, uuid[], text) from public, anon;
grant execute on function mercado_stock_juntar_web(uuid, uuid[], text) to authenticated;

-- ============ SELF-TEST ============
do $test$
begin
  assert (mercado_stock_juntar_web(gen_random_uuid(), '{}')->>'ok') = 'false', 'sem sessao/sem itens nao junta';
  raise notice 'SELF-TEST 0050 (juntar itens) OK';
end $test$;
