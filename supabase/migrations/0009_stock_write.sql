-- 0009_stock_write.sql
-- Escrita do estoque pelo app web (usuario autenticado), em lote.
-- Sempre restrito ao household do proprio usuario (auth.uid()).

-- Dar baixa: marca como acabou (zera o estoque). Mantem o produto e o historico.
create or replace function mercado_stock_zerar_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  update products set current_stock = 0, updated_at = now()
    where id = any(p_ids) and household_id = hid;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'afetados', n);
end $$;

-- Excluir: remove os produtos do estoque.
create or replace function mercado_stock_delete_web(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from products where id = any(p_ids) and household_id = hid;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'afetados', n);
end $$;

grant execute on function
  mercado_stock_zerar_web(uuid[]),
  mercado_stock_delete_web(uuid[])
  to authenticated;
