-- 0019_consulta_faltando_lista.sql
-- Corrige o tipo 'faltando' de mercado_consulta_texto.
-- Bug: 'faltando' lia products abaixo do nivel (par_level), mas quando a pessoa
-- diz "ta faltando X" o item vai pra shopping_list (lista de compras). Entao o
-- que ela quer ver em "O que esta faltando" e a LISTA DE COMPRAS (pendentes).
-- Passa a ler shopping_list status='pending'. Mantem estoque e economia iguais.

create or replace function mercado_consulta_texto(p_chat_id bigint, p_tipo text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  h uuid;
  linhas text;
  n int;
  gasto numeric;
  orc numeric;
  txt text;
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
    -- Lista de compras: itens pendentes que a pessoa marcou pra comprar.
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
end $$;

revoke execute on function mercado_consulta_texto(bigint, text) from public, anon;

-- SMOKE TEST (troque pelo seu chat_id): apos anotar "nescau", deve listar nescau.
-- select mercado_consulta_texto(<CHAT_ID>, 'faltando');
