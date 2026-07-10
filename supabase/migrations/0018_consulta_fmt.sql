-- 0018_consulta_fmt.sql
-- Corrige a formatacao de quantidade em mercado_consulta_texto (0017).
-- Bug: to_char(v, 'FM999990.###') arredondava pra inteiro (0.198 kg virava "0",
-- 0.518 virava "1"), fazendo item fracionado parecer zerado. Agora mostra os
-- decimais (ate 3), sem zeros a direita, com virgula decimal.

create or replace function mercado_fmt_num(v numeric)
returns text language sql immutable set search_path = public as $$
  select replace(
           trim(trailing '.' from to_char(round(coalesce(v, 0), 3), 'FM999999990.999')),
           '.', ',')
$$;

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
    select string_agg('• ' || initcap(name) || ' (tem ' || mercado_fmt_num(current_stock)
                        || ' de ' || mercado_fmt_num(par_level) || ' ' || unit || ')', chr(10)
                        order by name),
           count(*)
      into linhas, n
      from products
      where household_id = h and par_level > 0 and current_stock < par_level * 0.5;
    if coalesce(n, 0) = 0 then
      return json_build_object('ok', true, 'text', '🛒 Nada faltando por enquanto. A casa está abastecida!');
    end if;
    return json_build_object('ok', true,
      'text', '🛒 Precisa repor (' || n || '):' || chr(10) || linhas);
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

-- SMOKE TEST:
-- select mercado_fmt_num(0.198);  -- esperado: 0,198
-- select mercado_fmt_num(2);      -- esperado: 2
-- select mercado_fmt_num(2.348);  -- esperado: 2,348
