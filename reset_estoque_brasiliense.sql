-- Reset do estado da familia Brasiliense antes de reaplicar o seed.
-- Motivo: o "gasto do mes" somava compras de teste (QR/OCR) alem do seed, e o
-- current_stock ja tinha acumulado essas cargas. Nao da pra distinguir com
-- seguranca linha de teste de linha do seed (nenhuma tem etiqueta), entao o
-- caminho confiavel e zerar e reaplicar.
--
-- Ordem de delete respeita as FKs (purchases/shopping_list/receipts -> products).
-- Escopo TRAVADO na Brasiliense. NAO mexe em outras familias.
--
-- Passo 1: rode este arquivo.  Passo 2: rode seed_estoque_brasiliense.sql.
-- Depois, gasto do mes = R$ 1.550,13 e o estoque reflete so o seed.

do $$
declare
  h uuid;
  d int;
begin
  select id into h from households where lower(name) like '%brasiliense%' limit 1;
  if h is null then
    raise exception 'familia Brasiliense nao encontrada em households.name';
  end if;

  delete from purchases     where household_id = h;  get diagnostics d = row_count;
  raise notice 'purchases apagadas: %', d;
  delete from shopping_list  where household_id = h;  get diagnostics d = row_count;
  raise notice 'shopping_list apagada: %', d;
  delete from receipts       where household_id = h;  get diagnostics d = row_count;
  raise notice 'receipts apagadas: %', d;
  delete from products       where household_id = h;  get diagnostics d = row_count;
  raise notice 'products apagados: %', d;

  raise notice 'Reset OK para household %. Agora rode seed_estoque_brasiliense.sql', h;
end $$;
