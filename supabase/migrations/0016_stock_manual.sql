-- 0016_stock_manual.sql
-- Duas acoes do estoque pelo app web (usuario autenticado), sempre no household
-- do proprio auth.uid():
--   1) mercado_stock_add_web  : adiciona item manualmente AO ESTOQUE, sem gravar
--      compra (nao mexe no gasto do mes nem no historico de preco). Cria o produto
--      ou soma a quantidade a um existente. Espelha mercado_apply_purchase_h (0014)
--      SEM o insert em purchases.
--   2) mercado_stock_baixa_web: baixa por consumo. Subtrai p_qty do current_stock,
--      travando em 0. p_qty >= current_stock zera (baixa total = baixa parcial cheia).

-- ===== Adicionar item manualmente ao estoque (sem compra) =====
create or replace function mercado_stock_add_web(
  p_name text, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; pid uuid;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  p_name := lower(trim(coalesce(p_name, '')));
  if p_name = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  p_qty := coalesce(p_qty, 1);

  select id into pid from products where household_id = hid and name = p_name;
  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (hid, p_name, coalesce(p_unit, 'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  return json_build_object('ok', true, 'id', pid,
    'estoque_novo', (select current_stock from products where id = pid));
end $$;

-- ===== Baixa por consumo (parcial ou total) num item =====
create or replace function mercado_stock_baixa_web(p_id uuid, p_qty numeric)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; novo numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  update products set current_stock = greatest(0, current_stock - greatest(0, coalesce(p_qty, 0))),
                      updated_at = now()
    where id = p_id and household_id = hid
    returning current_stock into novo;
  if novo is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  return json_build_object('ok', true, 'estoque_novo', novo);
end $$;

-- ===== Permissoes =====
revoke execute on function
  mercado_stock_add_web(text, numeric, text),
  mercado_stock_baixa_web(uuid, numeric)
  from public, anon;
grant execute on function
  mercado_stock_add_web(text, numeric, text),
  mercado_stock_baixa_web(uuid, numeric)
  to authenticated;

-- ===== SMOKE TEST (rode logado como usuario com familia) =====
-- select mercado_stock_add_web('cafe manual', 2, 'un');   -- cria/soma, sem compra
-- select mercado_stock_baixa_web('<uuid do produto>', 0.5); -- consome 0,5
-- Esperado: {"ok":true,"estoque_novo":...}. Gasto do mes NAO muda.
