-- Mercado_app: aba Economia mes a mes (so leitura).
-- Rode DEPOIS de 0039.
--
-- Por que existe: a compra da casa e mensal, mas a Economia so enxergava o mes corrente
-- (mercado_economia_web e mercado_compras_web usam current_date). Para fechar o mes e
-- comparar com o anterior, a tela precisa abrir qualquer mes: o que foi comprado, o
-- orcamento daquele mes e quanto cada item costumava custar ANTES dele.
--
-- Orcamento de um mes sem linha propria = o ultimo definido antes dele: a pessoa define
-- uma vez e ele vale ate mudar (mesma ideia do grafico de 0008, que repetia o atual).
-- Nao escreve nada; editar compra continua com as RPCs de 0033.

-- A conta fica em _h (casa por parametro) para o self-test chamar sem sessao.
create or replace function mercado_economia_mes_h(h uuid, p_mes date default null)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  mes date := date_trunc('month', coalesce(p_mes, current_date))::date;
  fim date := (date_trunc('month', coalesce(p_mes, current_date)) + interval '1 month')::date;
begin

  return json_build_object(
    'ok', true,
    'mes', mes,
    'atual', mes = date_trunc('month', current_date)::date,
    'primeiro_mes', (select date_trunc('month', min(purchased_at))::date from purchases where household_id = h),
    'orcamento', (select amount from budgets where household_id = h and month <= mes order by month desc limit 1),
    'gasto', coalesce((select round(sum(unit_price * quantity), 2) from purchases
                        where household_id = h and purchased_at >= mes and purchased_at < fim), 0),
    'compras', coalesce((
      select json_agg(json_build_object(
               'id', p.id, 'name', p.item_name, 'brand', p.brand, 'qty', p.quantity, 'unit', p.unit,
               'price', p.unit_price, 'total', round(p.quantity * p.unit_price, 2), 'at', p.purchased_at)
             order by p.purchased_at desc)
        from purchases p
       where p.household_id = h and p.purchased_at >= mes and p.purchased_at < fim), '[]'::json),
    -- Preco medio de cada item comprado no mes, nos 6 meses ANTERIORES: "de costume".
    'historico', coalesce((
      select json_agg(json_build_object('name', x.nome, 'media', x.media, 'vezes', x.vezes))
        from (select lower(trim(p.item_name)) as nome, round(avg(p.unit_price), 2) as media, count(*) as vezes
                from purchases p
               where p.household_id = h and p.unit_price > 0
                 and p.purchased_at >= mes - interval '6 months' and p.purchased_at < mes
                 and lower(trim(p.item_name)) in (select lower(trim(item_name)) from purchases
                                                   where household_id = h and purchased_at >= mes and purchased_at < fim)
               group by 1) x), '[]'::json),
    -- Os 6 meses ate o escolhido, para o grafico.
    'meses', (
      select json_agg(json_build_object(
               'mes', m.m,
               'gasto', coalesce((select round(sum(unit_price * quantity), 2) from purchases
                                   where household_id = h and purchased_at >= m.m
                                     and purchased_at < m.m + interval '1 month'), 0),
               'orcamento', (select amount from budgets where household_id = h and month <= m.m
                              order by month desc limit 1))
             order by m.m)
        from (select (mes - (n || ' months')::interval)::date as m from generate_series(5, 0, -1) n) m));
end $fn$;

create or replace function mercado_economia_mes_web(p_mes date default null)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_economia_mes_h(h, p_mes);
end $fn$;

revoke execute on function mercado_economia_mes_h(uuid, date) from public, anon, authenticated;
revoke execute on function mercado_economia_mes_web(date) from public, anon;
grant execute on function mercado_economia_mes_web(date) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999040; h uuid; r json;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0040', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;
  insert into budgets (household_id, month, amount) values (h, '2026-08-01', 900);
  insert into purchases (household_id, item_name, unit_price, quantity, purchased_at) values
    (h, 'Arroz', 20, 1, '2026-09-10'), (h, 'arroz', 18, 2, '2026-10-05'), (h, 'cafe', 15, 1, '2026-10-06');

  r := mercado_economia_mes_h(h, '2026-10-17');
  assert r->>'mes' = '2026-10-01', format('mes: %s', r->>'mes');
  assert (r->>'orcamento')::numeric = 900, format('outubro herda o orcamento de agosto: %s', r->>'orcamento');
  assert (r->>'gasto')::numeric = 51, format('gasto de outubro = 18*2 + 15: %s', r->>'gasto');
  assert json_array_length(r->'compras') = 2, format('compras de outubro: %s', r->'compras');
  assert (r->'historico'->0->>'media')::numeric = 20 and r->'historico'->0->>'name' = 'arroz',
    format('historico do arroz = setembro: %s', r->'historico');
  assert json_array_length(r->'meses') = 6 and (r->'meses'->4->>'gasto')::numeric = 20,
    format('6 meses, setembro = 20: %s', r->'meses');
  assert r->>'primeiro_mes' = '2026-09-01', format('primeiro mes: %s', r->>'primeiro_mes');

  -- julho: antes de qualquer orcamento
  r := mercado_economia_mes_h(h, '2026-07-01');
  assert r->'orcamento' is null or json_typeof(r->'orcamento') = 'null', format('julho sem orcamento: %s', r->'orcamento');

  -- sem sessao (SQL Editor) a porta web nao acha casa
  assert not (mercado_economia_mes_web()->>'ok')::boolean or auth.uid() is not null, 'sem sessao deveria falhar';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0040 (economia mes) OK';
end $test$;
