-- 0014_receipt_web.sql
-- Aplicar nota fiscal pelo app web (usuario autenticado).
-- O site le a nota pelo webhook do n8n (visao Groq), o usuario revisa os itens e
-- confirma; esta RPC grava tudo na familia do auth.uid(), espelhando a logica de
-- mercado_apply_purchase (estoque + par_level + historico + economia + baixa da lista).
-- NAO altera as funcoes do bot (chat_id); so adiciona um helper interno e a _web.
--
-- Contrato de item (igual ao da nota do bot):
--   { "nome": "arroz", "marca": "tio joao", "qtd": 1, "preco": 5.49, "unidade": "un" }

-- ============ Helper interno: aplica UMA compra numa familia (h) ja resolvida ============
-- Mesma logica de mercado_apply_purchase(p_chat_id, ...), porem recebendo o
-- household direto, para ser reusada tanto pelo chat_id quanto pelo auth.uid().
create or replace function mercado_apply_purchase_h(
  h uuid, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; prev_price numeric; saved numeric;
begin
  p_name := lower(trim(p_name));

  select id into pid from products where household_id = h and name = p_name;
  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', (select current_stock from products where id = pid),
    'preco_anterior', prev_price, 'economia', saved);
end $$;

-- ============ Aplicar a nota inteira (itens revisados no site) ============
create or replace function mercado_apply_receipt_web(p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it jsonb; r json;
        total numeric := 0; economia numeric := 0; n int := 0; novos int := 0;
        item_name text; qtd numeric; preco numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    item_name := lower(trim(coalesce(it->>'nome','')));
    if item_name = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);

    perform 1 from products where household_id = hid and name = item_name;
    if not found then novos := novos + 1; end if;

    r := mercado_apply_purchase_h(hid, item_name, nullif(it->>'marca',''),
           preco, qtd, coalesce(nullif(it->>'unidade',''), 'un'));

    n := n + 1;
    total := total + preco * qtd;
    economia := economia + coalesce((r->>'economia')::numeric, 0);
  end loop;

  return json_build_object('ok', true, 'itens', n, 'novos', novos,
    'total', round(total, 2), 'economia', round(economia, 2));
end $$;

-- ============ Permissoes ============
revoke execute on function
  mercado_apply_purchase_h(uuid, text, text, numeric, numeric, text),
  mercado_apply_receipt_web(jsonb)
  from public, anon;
grant execute on function mercado_apply_receipt_web(jsonb) to authenticated;

-- ============ SMOKE TEST (rode manualmente logado como um usuario com familia) ============
-- select mercado_apply_receipt_web(
--   '[{"nome":"arroz","marca":"tio joao","qtd":2,"preco":5.49,"unidade":"un"},
--     {"nome":"feijao","marca":"","qtd":1,"preco":8.90,"unidade":"un"}]'::jsonb);
-- Esperado: {"ok":true,"itens":2,"novos":..,"total":19.88,"economia":..}
