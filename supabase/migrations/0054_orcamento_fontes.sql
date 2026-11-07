-- Mercado_app: orcamento montado por FONTES (VR de um, VR do outro, dinheiro...).
-- Rode DEPOIS de 0053.
--
-- Pedido do dono olhando o popup "Definir orcamento": "eu tenho um VR, a Bianca tem
-- outro e as vezes a gente coloca um dinheiro no final". O orcamento do mes passa a
-- ser a SOMA das fontes. budgets.amount continua sendo o total (toda a leitura de
-- 0008/0040 segue igual); as fontes ficam ao lado, so para montar e mostrar.
-- ponytail: jsonb na propria linha do mes, sem tabela nova. Fonte e nome + valor,
-- sem historico proprio; se um dia precisar "quanto do VR sobrou", ai vira tabela.

alter table budgets
  add column if not exists fontes jsonb not null default '[]'::jsonb;

-- Grava as fontes do mes (corrente ou o seguinte) e o total = soma delas.
-- p_fontes: [{"nome":"VR Marcelo","valor":600}, ...]
create or replace function mercado_budget_fontes_set_web(p_fontes jsonb, p_mes date default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare
  h uuid;
  hoje date := date_trunc('month', current_date)::date;
  mes date := coalesce(date_trunc('month', p_mes)::date, date_trunc('month', current_date)::date);
  limpas jsonb;
  total numeric;
begin
  if p_fontes is null or jsonb_typeof(p_fontes) <> 'array' then
    return json_build_object('ok', false, 'erro', 'fontes_invalidas');
  end if;
  if mes < hoje or mes > (hoje + interval '1 month')::date then
    return json_build_object('ok', false, 'erro', 'mes_invalido');
  end if;

  -- So o que tem valor positivo; nome vazio vira "Orcamento"; no maximo 12 fontes.
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'valor', valor) order by ord), '[]'::jsonb),
         coalesce(sum(valor), 0)
    into limpas, total
    from (
      -- O cast so roda no que e numero (CASE garante a ordem; WHERE nao garante).
      select ord, nome, valor
        from (
          select ord,
                 coalesce(nullif(left(btrim(e->>'nome'), 40), ''), 'Orçamento') as nome,
                 case when jsonb_typeof(e) = 'object' and (e->>'valor') ~ '^[0-9]+(\.[0-9]+)?$'
                      then round((e->>'valor')::numeric, 2) end as valor
            from jsonb_array_elements(p_fontes) with ordinality as t(e, ord)
        ) bruto
       where valor > 0
       order by ord
       limit 12
    ) f;

  if total <= 0 then return json_build_object('ok', false, 'erro', 'valor_invalido'); end if;

  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  insert into budgets (household_id, month, amount, fontes) values (h, mes, total, limpas)
  on conflict (household_id, month) do update set amount = excluded.amount, fontes = excluded.fontes;
  return json_build_object('ok', true, 'total', total, 'mes', mes, 'fontes', limpas);
end $fn$;

-- Le as fontes do orcamento que vale no mes (o ultimo definido ate ele, como em 0040).
create or replace function mercado_budget_fontes_web(p_mes date default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare
  h uuid;
  mes date := coalesce(date_trunc('month', p_mes)::date, date_trunc('month', current_date)::date);
  b record;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select amount, fontes into b from budgets where household_id = h and month <= mes order by month desc limit 1;
  return json_build_object('ok', true, 'total', coalesce(b.amount, 0), 'fontes', coalesce(b.fontes, '[]'::jsonb));
end $fn$;

revoke execute on function mercado_budget_fontes_set_web(jsonb, date) from public, anon;
grant execute on function mercado_budget_fontes_set_web(jsonb, date) to authenticated;
revoke execute on function mercado_budget_fontes_web(date) from public, anon;
grant execute on function mercado_budget_fontes_web(date) to authenticated;

-- ============ SELF-TEST ============
do $test$
begin
  assert (mercado_budget_fontes_set_web('{}'::jsonb)->>'erro') = 'fontes_invalidas', 'nao e lista';
  assert (mercado_budget_fontes_set_web('[{"nome":"VR","valor":0}]'::jsonb)->>'erro') = 'valor_invalido', 'tudo zero';
  assert (mercado_budget_fontes_set_web('[{"nome":"VR","valor":100}]'::jsonb, (current_date - interval '1 month')::date)->>'erro') = 'mes_invalido', 'mes passado';
  -- sem sessao para em sem_familia: a soma e a validacao passaram
  assert (mercado_budget_fontes_set_web('[{"nome":"VR 1","valor":600},{"nome":"Dinheiro","valor":"150.5"}]'::jsonb)->>'erro') = 'sem_familia', 'valido ate a casa';
  raise notice 'SELF-TEST 0054 (orcamento por fontes) OK';
end $test$;
