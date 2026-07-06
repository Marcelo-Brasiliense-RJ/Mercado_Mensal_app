-- Mercado_app — função despachante
-- Recebe a intenção e chama a RPC correta. Deixa o workflow do agente com um nó só de gravação.
-- Rode DEPOIS de 0003.

create or replace function mercado_apply(
  p_chat_id bigint, p_intencao text, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
begin
  case lower(coalesce(p_intencao,''))
    when 'comprei'      then return mercado_apply_purchase(p_chat_id, p_name, p_brand, p_price, p_qty, p_unit);
    when 'tenho'        then return mercado_apply_inventory(p_chat_id, p_name, p_qty, p_unit);
    when 'vou_comprar'  then return mercado_add_to_list(p_chat_id, p_name, p_qty, p_unit);
    when 'consumi'      then return mercado_apply_consumption(p_chat_id, p_name, p_qty);
    else return json_build_object('ok', false, 'erro', 'intencao_desconhecida', 'item', p_name);
  end case;
end $$;

grant execute on function mercado_apply(bigint, text, text, numeric, numeric, text) to service_role;
