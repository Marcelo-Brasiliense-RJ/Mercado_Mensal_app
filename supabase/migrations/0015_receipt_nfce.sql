-- 0015_receipt_nfce.sql
-- Import de compra pela NFC-e (QR da nota, RJ) no app web.
-- Complementa a 0014 (OCR por foto via n8n): adiciona dedup pela chave de acesso
-- e uma SOBRECARGA de mercado_apply_receipt_web que recebe chave/emitente/total.
-- Reusa o helper mercado_apply_purchase_h(...) ja criado na 0014.
-- A versao mercado_apply_receipt_web(jsonb) da 0014 continua valendo para o OCR.

-- ============ Tabela de notas importadas (dedup + cache leve) ============
create table if not exists receipts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  chave        text not null,
  emitente     text,
  total        numeric,
  source       text not null default 'web',   -- web | telegram
  imported_at  timestamptz not null default now(),
  unique (household_id, chave)
);
alter table receipts enable row level security;
-- Sem policy: so RPCs security definer acessam.

-- ============ Sobrecarga com dedup pela chave ============
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

-- ============ Permissoes ============
revoke execute on function
  mercado_apply_receipt_web(jsonb, text, text, numeric) from public, anon;
grant execute on function
  mercado_apply_receipt_web(jsonb, text, text, numeric) to authenticated;

-- ============ SMOKE TEST (rode logado como usuario com familia) ============
-- select mercado_apply_receipt_web(
--   '[{"nome":"arroz","marca":"tio joao","qtd":2,"preco":5.49,"unidade":"un"}]'::jsonb,
--   'CHAVE_TESTE_0015', 'Mercado X', 10.98);
-- Esperado: {"ok":true,"itens":1,...}
-- select mercado_apply_receipt_web('[]'::jsonb, 'CHAVE_TESTE_0015');
-- Esperado: {"ok":false,"erro":"ja_importada"}
