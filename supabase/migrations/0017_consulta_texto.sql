-- 0017_consulta_texto.sql
-- Consulta pelo bot do Telegram (resolve familia por chat_id). Devolve um TEXTO
-- ja formatado pra mensagem, pra deixar o fluxo n8n simples (so reenviar .text).
-- Tipos: 'estoque' (o que tem em casa), 'faltando' (abaixo do nivel normal),
--        'economia' (gasto do mes x orcamento).

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
    select string_agg('• ' || initcap(name) || ' (tem ' || trim(to_char(current_stock, 'FM999990.###'))
                        || ' de ' || trim(to_char(par_level, 'FM999990.###')) || ' ' || unit || ')', chr(10)
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
  select string_agg('• ' || initcap(name) || ': ' || trim(to_char(current_stock, 'FM999990.###')) || ' ' || unit, chr(10)
                      order by name),
         count(*)
    into linhas, n
    from products
    where household_id = h and current_stock > 0;
  if coalesce(n, 0) = 0 then
    return json_build_object('ok', true, 'text', '📦 Seu estoque está vazio. Registre uma compra que eu começo a acompanhar.');
  end if;
  -- Telegram aguenta ~4096 chars; se a lista for enorme, corta com aviso.
  if length(linhas) > 3500 then
    linhas := left(linhas, 3500) || chr(10) || '… (lista grande, veja tudo no app)';
  end if;
  return json_build_object('ok', true,
    'text', '📦 Estoque (' || n || ' itens):' || chr(10) || linhas);
end $$;

revoke execute on function mercado_consulta_texto(bigint, text) from public, anon;
-- O bot chama via service_role (custom auth do n8n); nao precisa grant a authenticated.

-- SMOKE TEST (troque pelo seu chat_id):
-- select mercado_consulta_texto(<CHAT_ID>, 'estoque');
-- select mercado_consulta_texto(<CHAT_ID>, 'faltando');
-- select mercado_consulta_texto(<CHAT_ID>, 'economia');
