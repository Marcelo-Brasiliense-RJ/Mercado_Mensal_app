-- Mercado_app: o nivel normal (par_level) deixa de ser um numero arbitrario.
-- Rode DEPOIS de 0024.
--
-- Por que existe: par_level e preenchido com a quantidade da PRIMEIRA compra (0005,
-- e tambem 0016/0023 quando o item nasce pelo app) e nunca mais muda. Nao ha nenhuma
-- tela para ajusta-lo. Como e ele que decide quando o app diz "Repor", o alerta central
-- do produto roda hoje sobre um numero que o usuario nunca escolheu: comprou 12 cervejas
-- uma vez, o item fica em "Repor" para sempre.
--
-- Duas funcoes, nao uma:
--   mercado_stock_set_par_web:      escreve (C2). Espelha mercado_stock_baixa_web de 0016.
--   mercado_stock_par_sugerido_web: le uma SUGESTAO a partir do historico (J2.1).
--
-- A segunda existe por causa da regra 2 da secao 0.1 do plano ("todo campo nasce
-- preenchido"): o app propoe um numero vindo das compras reais e o usuario aceita num
-- toque. Perguntar o numero seria mais barato de programar e pior de usar.
--
-- Dado insuficiente devolve null, nunca um chute: com menos de 2 compras na janela nao
-- ha media que signifique alguma coisa, e sugerir a partir de uma compra so reproduziria
-- exatamente o defeito que esta migration existe para corrigir.

-- ============ C2: escrever o nivel normal ============
create or replace function mercado_stock_set_par_web(p_id uuid, p_par numeric)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; novo numeric;
begin
  -- Validacao antes de resolver a casa, mesmo motivo de mercado_budget_set_web em 0021:
  -- deixa o caso invalido testavel sem JWT (auth.uid() e null fora de requisicao autenticada).
  if p_par is null or p_par < 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  update products set par_level = p_par, updated_at = now()
    where id = p_id and household_id = hid
    returning par_level into novo;
  -- par_level e not null, entao novo so e null quando nenhuma linha foi afetada
  if novo is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  return json_build_object('ok', true, 'normal', novo);
end $$;

revoke execute on function mercado_stock_set_par_web(uuid, numeric) from public, anon;
grant  execute on function mercado_stock_set_par_web(uuid, numeric) to authenticated;

-- ============ J2.1: sugerir o nivel normal a partir do historico ============
-- Interna, para o self-test conseguir exercitar o calculo sem fabricar uma sessao web
-- (auth_user_id tem FK para auth.users; criar usuario fake em producao seria pior que a
-- falta do teste). Mesmo arranjo _h + _web de mercado_desfazer_h em 0023.
--
-- ponytail: media simples da quantidade por compra na janela, sem ponderar por
-- frequencia nem por consumo. Cobre o caso comum ("compro 2 por vez, me avise abaixo
-- de 2"). Se aparecer item com intervalo de compra muito irregular, o upgrade e
-- consumption_rate_month x intervalo medio entre compras, que a tabela ja permite.
create or replace function mercado_stock_par_sugerido_h(h uuid, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare u text; n int; media numeric; sug numeric; dias int := 90;
begin
  select unit into u from products where id = p_id and household_id = h;
  if u is null then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;

  select count(*), avg(quantity) into n, media from purchases
    where product_id = p_id and household_id = h
      and purchased_at >= now() - (dias || ' days')::interval;

  if n < 2 then
    return json_build_object('ok', true, 'sugerido', null,
      'base_compras', n, 'periodo_dias', dias);
  end if;

  -- kg e L admitem fracao; o resto e contavel e um nivel de 1,5 sabonetes nao quer
  -- dizer nada. Minimo 1 nas unidades contaveis: nivel 0 desliga o alerta, que e o
  -- oposto do que a sugestao serve para fazer.
  sug := case when lower(u) in ('kg', 'l') then round(media, 1)
              else greatest(1, round(media)) end;

  return json_build_object('ok', true, 'sugerido', sug,
    'base_compras', n, 'periodo_dias', dias);
end $$;
revoke execute on function mercado_stock_par_sugerido_h(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function mercado_stock_par_sugerido_web(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_stock_par_sugerido_h(h, p_id);
end $$;

revoke execute on function mercado_stock_par_sugerido_web(uuid) from public, anon;
grant  execute on function mercado_stock_par_sugerido_web(uuid) to authenticated;

-- ============ SELF-TEST (padrao 0007; cria casa de teste e apaga no fim) ============
-- Cobre: validacao de entrada e caminho sem sessao de set_par (o caminho autenticado
-- dele nao e testavel aqui, mesma limitacao registrada na A2), e o calculo inteiro do
-- sugerido, que e onde mora a logica de verdade.
do $$
declare cid bigint := 999999051; h uuid; r json;
        pid_kg uuid; pid_un uuid; pid_uma uuid;
begin
  -- 1. set_par: validacao e ausencia de sessao
  r := mercado_stock_set_par_web(gen_random_uuid(), -1);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'negativo deveria ser valor_invalido';
  r := mercado_stock_set_par_web(gen_random_uuid(), null);
  assert not (r->>'ok')::boolean and r->>'erro' = 'valor_invalido', 'null deveria ser valor_invalido';
  r := mercado_stock_set_par_web(gen_random_uuid(), 3);
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem sessao deveria ser sem_familia';

  -- 2. casa de teste
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0025', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  insert into products (household_id, name, unit, current_stock, par_level)
    values (h, 'arroz teste', 'kg', 0, 12) returning id into pid_kg;
  insert into products (household_id, name, unit, current_stock, par_level)
    values (h, 'sabonete teste', 'un', 0, 0) returning id into pid_un;
  insert into products (household_id, name, unit, current_stock, par_level)
    values (h, 'azeite teste', 'l', 0, 0) returning id into pid_uma;

  insert into purchases (household_id, product_id, item_name, unit_price, quantity, unit, purchased_at) values
    (h, pid_kg,  'arroz teste',    22.00, 2,  'kg', now() - interval '10 days'),
    (h, pid_kg,  'arroz teste',    21.00, 4,  'kg', now() - interval '40 days'),
    (h, pid_kg,  'arroz teste',    18.00, 99, 'kg', now() - interval '200 days'),  -- fora da janela
    (h, pid_un,  'sabonete teste',  3.50, 1,  'un', now() - interval '5 days'),
    (h, pid_un,  'sabonete teste',  3.50, 2,  'un', now() - interval '35 days'),
    (h, pid_uma, 'azeite teste',   34.00, 1,  'l',  now() - interval '15 days');

  -- 3. media na janela, ignorando o que e velho demais
  r := mercado_stock_par_sugerido_h(h, pid_kg);
  assert (r->>'ok')::boolean,                        'sugestao deveria responder ok';
  assert (r->>'base_compras')::int = 2,              format('so 2 compras entram na janela, veio %s', r->>'base_compras');
  assert (r->>'sugerido')::numeric = 3.0,            format('media de 2 e 4 kg deveria ser 3, veio %s', r->>'sugerido');
  assert (r->>'periodo_dias')::int = 90,             'a janela declarada deveria ser 90 dias';

  -- 4. unidade contavel arredonda para inteiro
  r := mercado_stock_par_sugerido_h(h, pid_un);
  assert (r->>'sugerido')::numeric = 2,              format('media de 1 e 2 un deveria arredondar para 2, veio %s', r->>'sugerido');

  -- 5. dado insuficiente e null, nunca um chute
  r := mercado_stock_par_sugerido_h(h, pid_uma);
  assert (r->>'ok')::boolean,                        'uma compra so ainda e resposta valida';
  assert r->>'sugerido' is null,                     'com menos de 2 compras o sugerido tem que ser null';
  assert (r->>'base_compras')::int = 1,              'base_compras deveria contar a unica compra';

  -- 6. guarda de household: produto de outra casa nao vaza
  r := mercado_stock_par_sugerido_h(gen_random_uuid(), pid_kg);
  assert not (r->>'ok')::boolean and r->>'erro' = 'nao_encontrado', 'produto de outra casa nao deveria ser encontrado';

  -- 7. a escrita chega no par_level (mesmo update da funcao, casa resolvida a mao)
  update products set par_level = 3 where id = pid_kg and household_id = h;
  assert (select par_level from products where id = pid_kg) = 3,
    'aceitar a sugestao tem que trocar o 12 da primeira compra pelo 3 do historico';

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  -- households on delete cascade limpa products e purchases da casa de teste
  raise notice 'SELF-TEST 0025 (C2 set_par + J2.1 sugestao) OK';
end $$;
