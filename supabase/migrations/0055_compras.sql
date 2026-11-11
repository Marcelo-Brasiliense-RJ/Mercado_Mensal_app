-- Mercado_app: COMPRA como coisa propria (registro de compras do mes, nota e pendencias).
-- Rode DEPOIS de 0054.
--
-- Pedido do dono (2026-11-11): "quero uma listagem exata das compras que eu fiz no mes,
-- por competencia; as que eu nao carreguei a nota ficam como pendencia; e quero reabrir
-- a compra de 820 para subir a nota certa de 1.800 (retificar, voltar, editar, excluir)".
--
-- Ate aqui so existia o ITEM comprado (purchases), solto: nao dava para saber que os 51
-- itens de 11/11 eram uma compra so, nem trocar a nota dela. Agora cada item aponta para
-- uma compra (compra_id). Os itens que entram na mesma transacao (finalizar o carrinho,
-- importar uma nota) tem o mesmo purchased_at (now() e fixo na transacao): e assim que
-- as compras antigas sao agrupadas e as novas nascem, por gatilho, sem mexer nas RPCs
-- e no bot que ja gravam itens.
--
-- Pendencia = compra feita no mercado (carrinho) sem nota anexada e sem "nao tenho nota".
-- Trocar a nota = tira os itens velhos (devolvendo o que somaram no estoque) e grava os da
-- nota NA MESMA compra e na MESMA data: gasto e estoque nao duplicam.

-- ============ TABELA ============
create table if not exists compras (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  momento      timestamptz not null,              -- now() da transacao que gravou os itens
  data         date not null,                     -- competencia (dia da compra), editavel
  origem       text not null default 'avulsa',    -- carrinho | nota | avulsa
  trip_id      uuid references shopping_trips(id) on delete set null,
  mercado      text,
  nota_chave   text,
  nota_total   numeric,
  nota_em      timestamptz,                        -- quando a nota foi anexada
  sem_nota_ok  boolean not null default false,     -- "nao tenho a nota": sai das pendencias
  created_at   timestamptz not null default now(),
  unique (household_id, momento)
);
create index if not exists idx_compras_house_data on compras (household_id, data);
alter table compras enable row level security;
-- Sem policy: so RPCs security definer acessam (mesmo padrao de receipts e trips).

alter table purchases add column if not exists compra_id uuid references compras(id) on delete set null;
create index if not exists idx_purchases_compra on purchases (compra_id);

-- ============ GATILHO: todo item novo cai numa compra ============
-- mercado.compra_id: a RPC de trocar/anexar nota manda os itens para uma compra que ja
-- existe. mercado.origem: a importacao de nota marca a compra nova como 'nota'.
create or replace function mercado_compra_do_item()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare alvo text := nullif(current_setting('mercado.compra_id', true), '');
        orig text := coalesce(nullif(current_setting('mercado.origem', true), ''), 'avulsa');
begin
  if new.compra_id is not null then return new; end if;
  if alvo is not null then
    new.compra_id := alvo::uuid;
    return new;
  end if;
  insert into compras (household_id, momento, data, origem, nota_em)
    values (new.household_id, new.purchased_at, (new.purchased_at at time zone 'America/Sao_Paulo')::date,
            orig, case when orig = 'nota' then now() end)
    on conflict (household_id, momento) do nothing;
  select id into new.compra_id from compras where household_id = new.household_id and momento = new.purchased_at;
  return new;
end $fn$;

drop trigger if exists trg_purchases_compra on purchases;
create trigger trg_purchases_compra before insert on purchases
  for each row execute function mercado_compra_do_item();

-- Carrinho finalizado: os itens foram gravados na mesma transacao (now() igual ao
-- finalized_at), entao a compra criada por eles vira 'carrinho'.
create or replace function mercado_compra_da_trip()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'finalized' and new.finalized_at is not null then
    update compras set origem = 'carrinho', trip_id = new.id
     where household_id = new.household_id and momento = new.finalized_at and origem = 'avulsa';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_trip_compra on shopping_trips;
create trigger trg_trip_compra after update of status on shopping_trips
  for each row execute function mercado_compra_da_trip();

-- Nota com chave (0015): o recibo e gravado na mesma transacao dos itens.
create or replace function mercado_compra_do_recibo()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update compras set origem = case when origem = 'avulsa' then 'nota' else origem end,
                     nota_chave = new.chave, nota_total = new.total,
                     mercado = coalesce(mercado, new.emitente), nota_em = coalesce(nota_em, now())
   where household_id = new.household_id and momento = new.imported_at;
  return new;
end $fn$;

drop trigger if exists trg_receipt_compra on receipts;
create trigger trg_receipt_compra after insert on receipts
  for each row execute function mercado_compra_do_recibo();

-- ============ AGRUPAR O QUE JA EXISTE ============
insert into compras (household_id, momento, data, origem)
  select distinct p.household_id, p.purchased_at, (p.purchased_at at time zone 'America/Sao_Paulo')::date, 'avulsa'
    from purchases p where p.compra_id is null
  on conflict (household_id, momento) do nothing;

update purchases p set compra_id = c.id
  from compras c
 where p.compra_id is null and c.household_id = p.household_id and c.momento = p.purchased_at;

update compras c set origem = 'carrinho', trip_id = t.id
  from shopping_trips t
 where c.origem = 'avulsa' and t.household_id = c.household_id
   and t.status = 'finalized' and t.finalized_at = c.momento;

update compras c set origem = 'nota', nota_chave = r.chave, nota_total = r.total,
                     mercado = coalesce(c.mercado, r.emitente), nota_em = r.imported_at
  from receipts r
 where r.household_id = c.household_id and r.imported_at = c.momento;

-- ============ IMPORTAR NOTA (0014 e 0015) marcando a compra como 'nota' ============
-- Mesmos corpos de antes, so com a marca de origem no comeco.
create or replace function mercado_apply_receipt_web(p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it jsonb; r json;
        total numeric := 0; economia numeric := 0; n int := 0; novos int := 0;
        item_name text; qtd numeric; preco numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  perform set_config('mercado.origem', 'nota', true);

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    item_name := lower(trim(coalesce(it->>'nome','')));
    if item_name = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);

    perform 1 from products where household_id = hid and name = item_name;
    if not found then novos := novos + 1; end if;

    r := mercado_apply_purchase_h(hid, item_name, nullif(it->>'marca',''),
           preco, qtd, coalesce(nullif(it->>'unidade',''), 'un'));

    n := n + 1;
    total := total + preco * qtd;
    economia := economia + coalesce((r->>'economia')::numeric, 0);
  end loop;

  return json_build_object('ok', true, 'itens', n, 'novos', novos,
    'total', round(total, 2), 'economia', round(economia, 2));
end $$;

create or replace function mercado_apply_receipt_web(
  p_items jsonb, p_chave text, p_emitente text default null, p_total numeric default 0)
returns json language plpgsql security definer set search_path = public as $$
declare hid uuid; it jsonb; r json;
        total numeric := 0; economia numeric := 0; n int := 0; novos int := 0;
        item_name text; qtd numeric; preco numeric;
begin
  select household_id into hid from household_members where auth_user_id = auth.uid() limit 1;
  if hid is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  if p_chave is not null and p_chave <> '' and exists (
      select 1 from receipts where household_id = hid and chave = p_chave) then
    return json_build_object('ok', false, 'erro', 'ja_importada');
  end if;
  perform set_config('mercado.origem', 'nota', true);

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    item_name := lower(trim(coalesce(it->>'nome','')));
    if item_name = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);

    perform 1 from products where household_id = hid and name = item_name;
    if not found then novos := novos + 1; end if;

    r := mercado_apply_purchase_h(hid, item_name, nullif(it->>'marca',''),
           preco, qtd, coalesce(nullif(it->>'unidade',''), 'un'));

    n := n + 1;
    total := total + preco * qtd;
    economia := economia + coalesce((r->>'economia')::numeric, 0);
  end loop;

  if p_chave is not null and p_chave <> '' then
    insert into receipts (household_id, chave, emitente, total, source)
      values (hid, p_chave, p_emitente, nullif(p_total,0), 'web')
      on conflict (household_id, chave) do nothing;
  end if;

  return json_build_object('ok', true, 'itens', n, 'novos', novos,
    'total', round(total, 2), 'economia', round(economia, 2));
end $$;

-- ============ LER ============
-- Compras do mes (por competencia = compras.data) e as pendencias de qualquer mes.
create or replace function mercado_compras_mes_h(h uuid, p_mes date default null)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  mes date := date_trunc('month', coalesce(p_mes, current_date))::date;
  fim date := (date_trunc('month', coalesce(p_mes, current_date)) + interval '1 month')::date;
begin
  return json_build_object(
    'ok', true,
    'mes', mes,
    'compras', coalesce((
      select json_agg(x order by x.data desc, x.momento desc) from (
        select c.id, c.data, c.momento, c.origem, c.mercado, c.nota_total, c.sem_nota_ok,
               c.nota_em is not null as tem_nota,
               (c.origem = 'carrinho' and c.nota_em is null and not c.sem_nota_ok) as pendente,
               count(p.id) as itens,
               coalesce(round(sum(p.unit_price * p.quantity), 2), 0) as total
          from compras c left join purchases p on p.compra_id = c.id
         where c.household_id = h and c.data >= mes and c.data < fim
         group by c.id
        having count(p.id) > 0
      ) x), '[]'::json),
    'pendentes', coalesce((
      select json_agg(json_build_object('id', y.id, 'data', y.data, 'total', y.total) order by y.data desc) from (
        select c.id, c.data, coalesce(round(sum(p.unit_price * p.quantity), 2), 0) as total
          from compras c join purchases p on p.compra_id = c.id
         where c.household_id = h and c.origem = 'carrinho' and c.nota_em is null and not c.sem_nota_ok
         group by c.id
      ) y), '[]'::json)
  );
end $fn$;

create or replace function mercado_compras_mes_web(p_mes date default null)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_compras_mes_h(h, p_mes);
end $fn$;

-- Itens de uma compra (mesmo formato de 'compras' em 0040, para a tela reaproveitar).
create or replace function mercado_compra_itens_web(p_id uuid)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if not exists (select 1 from compras where id = p_id and household_id = h) then
    return json_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  return json_build_object('ok', true, 'itens', coalesce((
    select json_agg(json_build_object(
             'id', p.id, 'name', p.item_name, 'brand', p.brand, 'qty', p.quantity, 'unit', p.unit,
             'price', p.unit_price, 'total', round(p.quantity * p.unit_price, 2), 'at', p.purchased_at)
           order by p.item_name)
      from purchases p where p.compra_id = p_id), '[]'::json));
end $fn$;

-- ============ MEXER NA COMPRA ============
-- Tira os itens de uma compra devolvendo ao estoque o que eles tinham somado (igual a
-- excluir item em 0033). Uso interno.
create or replace function mercado_compra_esvaziar_h(h uuid, p_id uuid)
returns numeric language plpgsql security definer set search_path = public as $fn$
declare c record; tirado numeric := 0;
begin
  for c in select * from purchases where compra_id = p_id and household_id = h loop
    if c.product_id is not null then
      update products set current_stock = greatest(0, current_stock - c.quantity), updated_at = now()
        where id = c.product_id and household_id = h;
    end if;
    tirado := tirado + c.quantity * c.unit_price;
    delete from purchases where id = c.id;
  end loop;
  return round(tirado, 2);
end $fn$;

-- Excluir a compra inteira (gasto e estoque voltam).
create or replace function mercado_compra_excluir_web(p_id uuid)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; tirado numeric;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if not exists (select 1 from compras where id = p_id and household_id = h) then
    return json_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  tirado := mercado_compra_esvaziar_h(h, p_id);
  delete from compras where id = p_id;
  perform mercado_log_event(h, null, 'compra', 'compra_excluida', tirado, 0, 0, 'web',
    jsonb_build_object('compra_id', p_id));
  return json_build_object('ok', true, 'removido', tirado);
end $fn$;

-- Mudar a data (competencia) e o mercado. A data move os itens junto, para o gasto do
-- mes seguir a compra.
create or replace function mercado_compra_editar_web(p_id uuid, p_data date default null, p_mercado text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c record;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select * into c from compras where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if p_data is not null and (p_data > current_date + 31 or p_data < date '2020-01-01') then
    return json_build_object('ok', false, 'erro', 'data_invalida');
  end if;

  update compras set data = coalesce(p_data, data),
                     mercado = case when p_mercado is null then mercado else nullif(btrim(p_mercado), '') end
   where id = p_id;
  if p_data is not null and p_data <> c.data then
    -- meio-dia de Sao Paulo: longe da virada do dia em qualquer fuso
    update purchases set purchased_at = (p_data + time '12:00') at time zone 'America/Sao_Paulo'
     where compra_id = p_id;
  end if;
  return json_build_object('ok', true);
end $fn$;

-- "Nao tenho a nota" (sai das pendencias) e o desfazer disso.
create or replace function mercado_compra_sem_nota_web(p_id uuid, p_ok boolean default true)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  update compras set sem_nota_ok = coalesce(p_ok, true) where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return json_build_object('ok', true);
end $fn$;

-- A nota de uma compra que ja existe.
-- p_trocar = true: RETIFICAR. Tira os itens velhos (e o que somaram no estoque) e fica so
--   o que a nota diz ("subi errado", "o carrinho anotou 820, a nota foi 1.800").
-- p_trocar = false: ANEXAR. Soma os itens da nota que faltavam (conferencia do carrinho:
--   o que foi esquecido) e marca a compra como "com nota".
-- Os itens novos ficam na MESMA compra e na MESMA data: o gasto continua no mes certo.
create or replace function mercado_compra_nota_web(
  p_id uuid, p_items jsonb, p_trocar boolean default true,
  p_chave text default null, p_emitente text default null, p_total numeric default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c record; quando timestamptz; antes numeric; depois numeric;
        it jsonb; nome text; qtd numeric; preco numeric; n int := 0;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select * into c from compras where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if p_trocar and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return json_build_object('ok', false, 'erro', 'nota_vazia');
  end if;
  -- Nota repetida: so vale se for desta mesma compra (refazer a leitura dela).
  if nullif(p_chave, '') is not null and exists (
      select 1 from receipts r where r.household_id = h and r.chave = p_chave)
     and coalesce(c.nota_chave, '') <> p_chave then
    return json_build_object('ok', false, 'erro', 'ja_importada');
  end if;

  select coalesce(round(sum(unit_price * quantity), 2), 0), min(purchased_at)
    into antes, quando from purchases where compra_id = p_id;
  quando := coalesce(quando, (c.data + time '12:00') at time zone 'America/Sao_Paulo');

  if p_trocar then perform mercado_compra_esvaziar_h(h, p_id); end if;

  perform set_config('mercado.compra_id', p_id::text, true);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    nome := lower(trim(coalesce(it->>'nome', '')));
    if nome = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);
    perform mercado_apply_purchase_h(h, nome, nullif(it->>'marca', ''), preco, qtd,
                                     coalesce(nullif(it->>'unidade', ''), 'un'));
    n := n + 1;
  end loop;
  perform set_config('mercado.compra_id', '', true);

  -- Os itens da nota entram com a data da compra, nao com a de hoje.
  update purchases set purchased_at = quando where compra_id = p_id and purchased_at <> quando;

  if nullif(p_chave, '') is not null then
    insert into receipts (household_id, chave, emitente, total, source)
      values (h, p_chave, p_emitente, nullif(p_total, 0), 'web')
      on conflict (household_id, chave) do nothing;
  end if;

  update compras set nota_em = now(), sem_nota_ok = false,
                     nota_chave = coalesce(nullif(p_chave, ''), nota_chave),
                     nota_total = coalesce(nullif(p_total, 0), nota_total),
                     mercado = coalesce(mercado, nullif(btrim(p_emitente), ''))
   where id = p_id;

  select coalesce(round(sum(unit_price * quantity), 2), 0) into depois from purchases where compra_id = p_id;
  perform mercado_log_event(h, null, 'compra', case when p_trocar then 'compra_nota_trocada' else 'compra_nota_anexada' end,
    antes, depois, n, 'web', jsonb_build_object('compra_id', p_id));
  return json_build_object('ok', true, 'itens', n, 'antes', antes, 'depois', depois);
end $fn$;

-- A compra do ultimo carrinho finalizado (a conferencia logo depois do caixa anexa a
-- nota nela, em vez de criar outra compra so com os esquecidos).
create or replace function mercado_compra_ultimo_carrinho_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid; cid uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  select id into cid from compras where household_id = h and origem = 'carrinho'
   order by momento desc limit 1;
  return json_build_object('ok', cid is not null, 'id', cid);
end $fn$;

-- ============ PERMISSOES ============
revoke execute on function
  mercado_compra_do_item(), mercado_compra_da_trip(), mercado_compra_do_recibo(),
  mercado_compras_mes_h(uuid, date), mercado_compra_esvaziar_h(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function
  mercado_compras_mes_web(date), mercado_compra_itens_web(uuid), mercado_compra_excluir_web(uuid),
  mercado_compra_editar_web(uuid, date, text), mercado_compra_sem_nota_web(uuid, boolean),
  mercado_compra_nota_web(uuid, jsonb, boolean, text, text, numeric), mercado_compra_ultimo_carrinho_web(),
  mercado_apply_receipt_web(jsonb), mercado_apply_receipt_web(jsonb, text, text, numeric)
  from public, anon;
grant execute on function
  mercado_compras_mes_web(date), mercado_compra_itens_web(uuid), mercado_compra_excluir_web(uuid),
  mercado_compra_editar_web(uuid, date, text), mercado_compra_sem_nota_web(uuid, boolean),
  mercado_compra_nota_web(uuid, jsonb, boolean, text, text, numeric), mercado_compra_ultimo_carrinho_web(),
  mercado_apply_receipt_web(jsonb), mercado_apply_receipt_web(jsonb, text, text, numeric)
  to authenticated;

-- ============ SELF-TEST (casa de teste, apagada no fim) ============
do $test$
declare h uuid := gen_random_uuid(); t uuid; c1 uuid; r json; antes_estoque numeric;
begin
  insert into households (id, name) values (h, 'Casa Teste 0055');

  -- 1) carrinho de 2 itens na mesma transacao -> UMA compra 'carrinho'
  insert into shopping_trips (id, household_id) values (gen_random_uuid(), h) returning id into t;
  perform mercado_apply_purchase_h(h, 'teste arroz', null, 10, 2, 'kg');
  perform mercado_apply_purchase_h(h, 'teste feijao', null, 5, 1, 'kg');
  update shopping_trips set status = 'finalized', finalized_at = now() where id = t;
  select id into c1 from compras where household_id = h;
  assert (select count(*) from compras where household_id = h) = 1, 'deveria ser 1 compra';
  assert (select origem from compras where id = c1) = 'carrinho', 'deveria ser carrinho';
  r := mercado_compras_mes_h(h, current_date);
  assert json_array_length(r->'pendentes') = 1, format('1 pendente: %s', r);
  assert (r->'compras'->0->>'total')::numeric = 25, format('total 25: %s', r);

  -- 2) retificar com a nota: arroz vira 3 kg a 9, feijao some, entra cafe
  select current_stock into antes_estoque from products where household_id = h and name = 'teste arroz';
  assert antes_estoque = 2, format('estoque arroz antes %s', antes_estoque);
  perform set_config('mercado.compra_id', c1::text, true);
  perform mercado_compra_esvaziar_h(h, c1);
  perform mercado_apply_purchase_h(h, 'teste arroz', null, 9, 3, 'kg');
  perform mercado_apply_purchase_h(h, 'teste cafe', null, 20, 1, 'pct');
  perform set_config('mercado.compra_id', '', true);
  update compras set nota_em = now() where id = c1;
  assert (select count(*) from compras where household_id = h) = 1, 'retificar nao cria compra nova';
  assert (select current_stock from products where household_id = h and name = 'teste arroz') = 3, 'arroz 2-2+3 = 3';
  assert (select current_stock from products where household_id = h and name = 'teste feijao') = 0, 'feijao devolvido';
  r := mercado_compras_mes_h(h, current_date);
  assert (r->'compras'->0->>'total')::numeric = 47, format('total 27+20: %s', r);
  assert json_array_length(r->'pendentes') = 0, 'com nota sai da pendencia';

  -- 3) item avulso em outra transacao simulada (outro momento) -> compra 'avulsa' separada
  insert into purchases (household_id, item_name, unit_price, quantity, purchased_at)
    values (h, 'teste pao', 1, 1, now() - interval '1 hour');
  assert (select count(*) from compras where household_id = h) = 2, 'avulsa e outra compra';

  -- 4) esvaziar e apagar
  perform mercado_compra_esvaziar_h(h, c1);
  assert (select current_stock from products where household_id = h and name = 'teste cafe') = 0, 'cafe devolvido';

  delete from households where id = h;
  raise notice 'SELF-TEST 0055 (compras) OK';
end $test$;
