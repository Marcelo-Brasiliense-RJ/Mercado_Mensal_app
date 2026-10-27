-- Mercado_app: codigo de barras -> estoque (guardar em casa sem passar pelo carrinho).
-- Rode DEPOIS de 0040.
--
-- Por que existe: o leitor so sabia por no carrinho (0035). Na tela de Estoque a pessoa
-- esta guardando a compra ou conferindo a despensa: ler o codigo tem que SOMAR no
-- estoque, e o vinculo codigo -> produto tem que ser o mesmo do carrinho, para a
-- proxima leitura (em qualquer tela) ja vir com o nome.
--
-- Soma no estoque igual a mercado_stock_add_web (0023): cria o produto se nao existe,
-- nivel normal comeca na quantidade, e registra o evento (Desfazer funciona).
-- Nao mexe em gasto: estoque nao e compra.

create or replace function mercado_barcode_estoque_h(
  h uuid, p_code text, p_name text default null, p_qty numeric default 1, p_unit text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare code text; nome text; un text; pid uuid; antes numeric; depois numeric; qtd numeric := coalesce(p_qty, 1);
begin
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  code := mercado_barcode_norm(p_code);
  if code is null then return json_build_object('ok', false, 'erro', 'codigo_invalido'); end if;
  if qtd <= 0 then return json_build_object('ok', false, 'erro', 'valor_invalido'); end if;

  nome := lower(trim(coalesce(p_name, '')));
  if nome = '' then
    select item_name, unit into nome, un from product_barcodes where household_id = h and barcode = code;
    if nome is null then
      return json_build_object('ok', false, 'erro', 'codigo_desconhecido', 'codigo', code);
    end if;
  end if;
  un := coalesce(nullif(trim(coalesce(p_unit, '')), ''), un, 'un');

  select id, current_stock into pid, antes from products where household_id = h and name = nome;
  antes := coalesce(antes, 0);
  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, nome, un, qtd, qtd) returning id into pid;
  else
    update products set current_stock = current_stock + qtd,
                        par_level = case when par_level = 0 then qtd else par_level end,
                        updated_at = now()
      where id = pid;
    -- produto que ja existe manda na unidade: o leitor nao troca "L" por "un"
    select unit into un from products where id = pid;
  end if;
  select current_stock into depois from products where id = pid;
  perform mercado_log_event(h, pid, nome, 'estoque_ajustado', antes, depois, qtd, 'web');

  insert into product_barcodes (household_id, barcode, product_id, item_name, unit)
    values (h, code, pid, nome, un)
    on conflict (household_id, barcode) do update
      set item_name = excluded.item_name, unit = excluded.unit,
          product_id = excluded.product_id, updated_at = now();

  return json_build_object('ok', true, 'id', pid, 'nome', nome, 'estoque_novo', depois, 'codigo', code);
end $fn$;
revoke execute on function mercado_barcode_estoque_h(uuid, text, text, numeric, text)
  from public, anon, authenticated, service_role;

create or replace function mercado_barcode_estoque_web(
  p_code text, p_name text default null, p_qty numeric default 1, p_unit text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_barcode_estoque_h(h, p_code, p_name, p_qty, p_unit);
end $fn$;
revoke execute on function mercado_barcode_estoque_web(text, text, numeric, text) from public, anon;
grant execute on function mercado_barcode_estoque_web(text, text, numeric, text) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999041; h uuid; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0041', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- codigo novo sem nome: pede o nome
  r := mercado_barcode_estoque_h(h, '7891000315507');
  assert r->>'erro' = 'codigo_desconhecido', format('sem nome: %s', r);

  -- com nome: cria o produto com 2 e amarra o codigo
  r := mercado_barcode_estoque_h(h, '789 1000 315507', 'Leite Integral', 2, 'L');
  assert (r->>'ok')::boolean and (r->>'estoque_novo')::numeric = 2, format('primeira leitura: %s', r);
  assert exists (select 1 from product_barcodes where household_id = h and barcode = '7891000315507'
                   and item_name = 'leite integral' and product_id is not null), 'vinculo deveria ficar gravado';

  -- segunda leitura so com o codigo: soma
  r := mercado_barcode_estoque_h(h, '7891000315507', null, 3);
  assert (r->>'estoque_novo')::numeric = 5, format('segunda leitura deveria somar: %s', r);
  assert (select par_level from products where household_id = h and name = 'leite integral') = 2,
    'nivel normal nao muda depois de definido';
  r := mercado_barcode_estoque_h(h, '7891000315507', null, 1, 'un');
  assert (select unit from products where household_id = h and name = 'leite integral') = 'L',
    'produto existente mantem a unidade';

  -- nao vira compra
  assert not exists (select 1 from purchases where household_id = h), 'estoque nao e compra';

  r := mercado_barcode_estoque_h(h, '7891000315507', null, 0);
  assert r->>'erro' = 'valor_invalido', format('quantidade zero: %s', r);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0041 (codigo -> estoque) OK';
end $test$;
