-- Mercado_app — compra por foto da nota (importador em lote) + conserto do par_level
-- Rode DEPOIS de 0003. Independe de 0004 (dispatch), mas o ideal e rodar 0004 tambem.
-- Padrao do projeto: RLS ligado sem policy (so service_role acessa); RPCs SECURITY DEFINER.
--
-- Contrato de item lido da nota (guardado em receipt_drafts.items, um objeto por item):
--   { "nome": "arroz", "marca": "tio joao", "qtd": 1, "preco": 5.49, "unidade": "un" }
--   nome = generico minusculo; marca separada; qtd/preco como numero (ponto decimal).

-- ============ 1. RASCUNHO DA NOTA (um por chat de cada vez) ============
-- Duas fases no mesmo registro:
--   status 'coletando' -> juntando os file_id das fotos, sem OCR ainda (Gate 1)
--   status 'revisao'   -> itens ja lidos, aguardando "confirmar" (Gate 2)
create table if not exists receipt_drafts (
  chat_id      bigint primary key,                  -- 1 rascunho por chat
  household_id uuid references households(id) on delete cascade,
  status       text not null default 'coletando',   -- coletando | revisao
  photos       jsonb not null default '[]'::jsonb,  -- ["file_id_telegram", ...]
  items        jsonb not null default '[]'::jsonb,  -- [{nome,marca,qtd,preco,unidade}, ...]
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table receipt_drafts enable row level security;
-- Sem policy: so service_role (n8n) acessa. O app web nao mexe em rascunho no MVP.

-- ============ 2. par_level PASSA A SER PREENCHIDO (conserta campo morto) ============
-- Na 1a vez que um produto e comprado (par_level ainda 0), a qtd vira o "nivel normal".
-- Vale para voz E foto, porque ambas passam por aqui. Recalibravel depois pela conferencia.
create or replace function mercado_apply_purchase(
  p_chat_id bigint, p_name text, p_brand text default null,
  p_price numeric default 0, p_qty numeric default 1, p_unit text default 'un')
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; pid uuid; prev_price numeric; saved numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  p_name := lower(trim(p_name));

  select id into pid from products where household_id = h and name = p_name;
  if pid is null then
    insert into products (household_id, name, unit, current_stock, par_level)
      values (h, p_name, coalesce(p_unit,'un'), p_qty, p_qty) returning id into pid;
  else
    update products set current_stock = current_stock + p_qty,
                        par_level = case when par_level = 0 then p_qty else par_level end,
                        unit = coalesce(p_unit, unit), updated_at = now()
      where id = pid;
  end if;

  select unit_price into prev_price from purchases where product_id = pid order by purchased_at desc limit 1;
  insert into purchases (household_id, product_id, item_name, brand, unit_price, quantity, unit)
    values (h, pid, p_name, p_brand, p_price, p_qty, coalesce(p_unit,'un'));
  saved := case when prev_price is not null and prev_price > p_price
                then round((prev_price - p_price) * p_qty, 2) else 0 end;
  update shopping_list set status = 'bought', bought_at = now()
    where household_id = h and product_id = pid and status = 'pending';

  return json_build_object('ok', true, 'item', p_name,
    'estoque_novo', (select current_stock from products where id = pid),
    'preco_anterior', prev_price, 'economia', saved);
end $$;

-- ============ 3. GATE 1: COLETA DE FOTOS ============
-- Cada foto recebida entra aqui. Cria o rascunho se nao existir. Se ja existia um
-- rascunho em 'revisao' (carrinho antigo nao confirmado), comeca uma nota nova.
create or replace function mercado_draft_add_photo(p_chat_id bigint, p_file_id text)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; qtd int;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  insert into receipt_drafts (chat_id, household_id, status, photos)
    values (p_chat_id, h, 'coletando', jsonb_build_array(p_file_id))
  on conflict (chat_id) do update set
    photos = case when receipt_drafts.status = 'revisao'
                  then jsonb_build_array(p_file_id)
                  else receipt_drafts.photos || jsonb_build_array(p_file_id) end,
    items  = case when receipt_drafts.status = 'revisao' then '[]'::jsonb else receipt_drafts.items end,
    status = 'coletando',
    household_id = excluded.household_id,
    updated_at = now();

  select jsonb_array_length(photos) into qtd from receipt_drafts where chat_id = p_chat_id;
  return json_build_object('ok', true, 'fotos', qtd, 'status', 'coletando');
end $$;

-- ============ 4. LER O RASCUNHO (monta o resumo e o total) ============
create or replace function mercado_draft_get(p_chat_id bigint)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ok', true,
    'status', d.status,
    'fotos', jsonb_array_length(d.photos),
    'photos', d.photos,           -- file_id das fotos, o n8n baixa no "Processar"
    'itens', d.items,
    'total', coalesce((
       select round(sum(coalesce((e->>'preco')::numeric,0) * coalesce((e->>'qtd')::numeric,1)), 2)
       from jsonb_array_elements(d.items) e), 0)
  )
  from receipt_drafts d where d.chat_id = p_chat_id
$$;

-- ============ 5. GRAVAR OS ITENS LIDOS PELA VISAO (Gate 1 -> revisao) ============
-- Chamado pelo n8n depois do OCR. Coloca os itens e passa para 'revisao'.
create or replace function mercado_draft_set_items(p_chat_id bigint, p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  update receipt_drafts
    set items = coalesce(p_items, '[]'::jsonb), status = 'revisao', updated_at = now()
    where chat_id = p_chat_id;
  if not found then return json_build_object('ok', false, 'erro', 'sem_rascunho'); end if;
  return mercado_draft_get(p_chat_id);
end $$;

-- ============ 6. CORRECAO ANTES DE CONFIRMAR (opera no dado exato, nao na memoria do LLM) ============
-- O n8n traduz a fala ("item 7 sao 2") para (acao, indice 1-based, valor) e chama aqui.
create or replace function mercado_draft_edit(
  p_chat_id bigint, p_action text, p_index int, p_value text default null)
returns json language plpgsql security definer set search_path = public as $$
declare i int; cur jsonb;
begin
  select items into cur from receipt_drafts where chat_id = p_chat_id;
  if cur is null then return json_build_object('ok', false, 'erro', 'sem_rascunho'); end if;
  i := p_index - 1;  -- usuario ve a lista 1-based
  if i < 0 or i >= jsonb_array_length(cur) then
    return json_build_object('ok', false, 'erro', 'indice_invalido');
  end if;

  case lower(coalesce(p_action,''))
    when 'remove'    then cur := cur - i;
    when 'set_qty'   then cur := jsonb_set(cur, array[i::text,'qtd'],   to_jsonb(replace(p_value,',','.')::numeric));
    when 'set_price' then cur := jsonb_set(cur, array[i::text,'preco'], to_jsonb(replace(p_value,',','.')::numeric));
    when 'set_brand' then cur := jsonb_set(cur, array[i::text,'marca'], to_jsonb(lower(trim(p_value))));
    when 'set_name'  then cur := jsonb_set(cur, array[i::text,'nome'],  to_jsonb(lower(trim(p_value))));
    else return json_build_object('ok', false, 'erro', 'acao_desconhecida');
  end case;

  update receipt_drafts set items = cur, updated_at = now() where chat_id = p_chat_id;
  return mercado_draft_get(p_chat_id);
end $$;

-- ============ 7. GATE 2: CONFIRMAR -> GRAVA TUDO EM LOTE (atomico) ============
-- Le os itens do proprio rascunho (dado exato revisado), aplica um a um reusando
-- mercado_apply_purchase, limpa o rascunho e devolve o resumo. Se algo falhar,
-- a transacao inteira volta atras (funcao roda na transacao do chamador).
create or replace function mercado_apply_receipt(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare h uuid; it jsonb; r json;
        total numeric := 0; economia numeric := 0; n int := 0; novos int := 0;
        item_name text; qtd numeric; preco numeric;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  for it in select * from jsonb_array_elements(
      coalesce((select items from receipt_drafts where chat_id = p_chat_id), '[]'::jsonb))
  loop
    item_name := lower(trim(coalesce(it->>'nome','')));
    if item_name = '' then continue; end if;
    qtd   := coalesce(nullif(replace(it->>'qtd',   ',', '.'), '')::numeric, 1);
    preco := coalesce(nullif(replace(it->>'preco', ',', '.'), '')::numeric, 0);

    perform 1 from products where household_id = h and name = item_name;
    if not found then novos := novos + 1; end if;

    r := mercado_apply_purchase(p_chat_id, item_name, nullif(it->>'marca',''),
           preco, qtd, coalesce(nullif(it->>'unidade',''), 'un'));

    n := n + 1;
    total := total + preco * qtd;
    economia := economia + coalesce((r->>'economia')::numeric, 0);
  end loop;

  delete from receipt_drafts where chat_id = p_chat_id;

  return json_build_object('ok', true, 'itens', n, 'novos', novos,
    'total', round(total, 2), 'economia', round(economia, 2));
end $$;

-- ============ 8. CANCELAR / LIMPEZA ============
create or replace function mercado_draft_cancel(p_chat_id bigint)
returns json language plpgsql security definer set search_path = public as $$
begin
  delete from receipt_drafts where chat_id = p_chat_id;
  return json_build_object('ok', true);
end $$;

-- Rascunhos abandonados morrem em 24h (chamar no job diario ou num Schedule do n8n).
create or replace function mercado_draft_cleanup()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from receipt_drafts where updated_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ 9. PERMISSOES (tudo via n8n = service_role) ============
revoke execute on all functions in schema public from public, anon;
grant execute on function
  mercado_apply_purchase(bigint, text, text, numeric, numeric, text),
  mercado_draft_add_photo(bigint, text),
  mercado_draft_get(bigint),
  mercado_draft_set_items(bigint, jsonb),
  mercado_draft_edit(bigint, text, int, text),
  mercado_apply_receipt(bigint),
  mercado_draft_cancel(bigint),
  mercado_draft_cleanup()
  to service_role;

-- ============ 10. SMOKE TEST (rode manualmente; usa um chat_id de teste e apaga no fim) ============
-- do $$
-- declare cid bigint := 999999001; fam json; g json; ap json;
-- begin
--   fam := mercado_create_family(cid, 'Casa Teste 0005', 'Tester');
--   perform mercado_draft_add_photo(cid, 'file_abc');
--   perform mercado_draft_add_photo(cid, 'file_def');   -- 2 fotos, status coletando
--   perform mercado_draft_set_items(cid,
--     '[{"nome":"arroz","marca":"tio joao","qtd":2,"preco":5.49,"unidade":"un"},
--       {"nome":"feijao","marca":"","qtd":1,"preco":8.90,"unidade":"un"}]'::jsonb);
--   perform mercado_draft_edit(cid, 'set_qty', 2, '3');  -- feijao vira 3
--   g  := mercado_draft_get(cid);
--   ap := mercado_apply_receipt(cid);
--   assert (ap->>'itens')::int = 2, 'esperava 2 itens aplicados';
--   assert (ap->>'total')::numeric = round(2*5.49 + 3*8.90, 2), 'total errado';
--   assert (select current_stock from products p join household_members m on m.household_id=p.household_id
--           where m.telegram_chat_id=cid and p.name='feijao') = 3, 'estoque feijao errado';
--   assert (select par_level from products p join household_members m on m.household_id=p.household_id
--           where m.telegram_chat_id=cid and p.name='arroz') = 2, 'par_level arroz deveria ser 2';
--   assert (select count(*) from receipt_drafts where chat_id=cid) = 0, 'rascunho deveria ter sido limpo';
--   -- limpeza do teste
--   delete from households where id in (select household_id from household_members where telegram_chat_id=cid);
--   delete from household_members where telegram_chat_id=cid;
--   raise notice 'SMOKE TEST 0005 OK';
-- end $$;
