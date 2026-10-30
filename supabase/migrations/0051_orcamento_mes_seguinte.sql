-- Mercado_app: orcamento do mes que vem. Rode DEPOIS de 0050.
--
-- Por que existe: no fim do mes a casa ja quer combinar quanto vai gastar no proximo
-- ("nao consigo colocar do mes seguinte?"). mercado_budget_set_web so grava o mes corrente.
-- Esta grava o mes escolhido, mas so o corrente ou o seguinte: mes passado ja fechou.
-- A leitura (0040) ja acha: orcamento de um mes = ultimo definido ate ele.

create or replace function mercado_budget_mes_set_web(p_total numeric, p_mes date)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; mes date := date_trunc('month', p_mes)::date; hoje date := date_trunc('month', current_date)::date;
begin
  if p_total is null or p_total <= 0 then return json_build_object('ok', false, 'erro', 'valor_invalido'); end if;
  if mes is null or mes < hoje or mes > (hoje + interval '1 month')::date then
    return json_build_object('ok', false, 'erro', 'mes_invalido');
  end if;
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  insert into budgets (household_id, month, amount) values (h, mes, p_total)
  on conflict (household_id, month) do update set amount = excluded.amount;
  return json_build_object('ok', true, 'total', p_total, 'mes', mes);
end $fn$;

revoke execute on function mercado_budget_mes_set_web(numeric, date) from public, anon;
grant execute on function mercado_budget_mes_set_web(numeric, date) to authenticated;

-- ============ SELF-TEST ============
do $test$
begin
  assert (mercado_budget_mes_set_web(0, current_date)->>'erro') = 'valor_invalido', 'valor zero';
  assert (mercado_budget_mes_set_web(500, (current_date - interval '1 month')::date)->>'erro') = 'mes_invalido', 'mes passado';
  assert (mercado_budget_mes_set_web(500, (current_date + interval '2 months')::date)->>'erro') = 'mes_invalido', 'dois meses a frente';
  -- sem sessao para em sem_familia; o que importa e nao barrar o mes seguinte
  assert coalesce(mercado_budget_mes_set_web(500, (current_date + interval '1 month')::date)->>'erro', '') <> 'mes_invalido', 'mes seguinte vale';
  raise notice 'SELF-TEST 0051 (orcamento do mes seguinte) OK';
end $test$;
