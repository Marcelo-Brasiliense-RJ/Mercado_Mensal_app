-- 0020_list_update.sql
-- Editar um item da lista de compras pelo app web: quantidade, unidade e preco
-- estimado. Serve pro controle de "quanto quero/preciso comprar" e o preco que a
-- pessoa pesquisou antes de ir ao mercado. Sempre no household do auth.uid().
-- null = nao mexe naquele campo; para preco, 0 e um valor valido (fica 0).

create or replace function mercado_list_update_web(
  p_id uuid, p_qty numeric default null, p_unit text default null, p_price numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  update shopping_list set
      desired_quantity = greatest(0, coalesce(p_qty, desired_quantity)),
      unit             = coalesce(nullif(trim(p_unit), ''), unit),
      estimated_price  = coalesce(p_price, estimated_price)
    where id = p_id and household_id = hid and status <> 'removed';
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return json_build_object('ok', true);
end $$;

grant execute on function mercado_list_update_web(uuid, numeric, text, numeric) to authenticated;

-- SMOKE TEST:
-- select mercado_list_update_web('<uuid do item>', 3, 'un', 12.90);
