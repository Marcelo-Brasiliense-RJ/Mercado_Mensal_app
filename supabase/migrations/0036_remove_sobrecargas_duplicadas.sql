-- Mercado_app: remove sobrecargas duplicadas criadas por engano. Rode DEPOIS de 0035.
--
-- O QUE ACONTECEU
-- Em 2026-10-09 foram aplicadas no banco, a partir de uma branch divergente
-- (spec/historico-editavel-por-mes, commit ffc38aa), duas migrations numeradas
-- 0035 e 0036 que NAO sao as que o app publicado usa. O main tem outra 0035
-- (0035_codigo_barras.sql). Resultado: funcoes duplicadas e funcoes orfas.
--
-- POR QUE PRECISA SAIR
-- O app chama mercado_economia_web() e mercado_compras_web() SEM argumento
-- (web/src/lib/store.tsx). Com duas assinaturas no banco -- a antiga sem
-- parametro e a nova com p_mes default -- o PostgREST pode nao resolver qual
-- usar e devolver "function is not unique". E exatamente o defeito que a
-- 0006_fix_resolve_household.sql teve de consertar neste mesmo projeto.
--
-- As quatro primeiras sao sobrecargas que duplicam funcao em uso.
-- As cinco ultimas sao orfas: nenhum arquivo do app chama qualquer uma delas.
-- Nada aqui apaga dado: sao apenas definicoes de funcao.

drop function if exists mercado_compras_web(date);
drop function if exists mercado_economia_web(date);
drop function if exists mercado_compra_add_web(text, numeric, numeric, text, timestamptz);
drop function if exists mercado_compra_update_web(uuid, numeric, numeric, text);

drop function if exists mercado_barcode_lookup_web(text);
drop function if exists mercado_barcode_bind_web(uuid, text);
drop function if exists mercado_trip_add_by_barcode_web(text, numeric, numeric);
drop function if exists mercado_chat_parse_web(text);
drop function if exists mercado_chat_parse_h(uuid, text);

-- A coluna products.barcode, criada pela mesma leva, fica onde esta de proposito:
-- esta vazia e nao atrapalha, e derrubar coluna e a unica operacao destrutiva de
-- verdade deste conjunto. O catalogo de codigos em uso e a tabela product_barcodes
-- (0035_codigo_barras.sql). Para remover a coluna depois:
--   alter table products drop column if exists barcode;

-- ============ VERIFICACAO ============
do $check$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'mercado_economia_web';
  assert n = 1, format('mercado_economia_web deveria ter 1 assinatura, tem %s', n);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'mercado_compras_web';
  assert n = 1, format('mercado_compras_web deveria ter 1 assinatura, tem %s', n);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('mercado_barcode_find_web', 'mercado_barcode_add_web');
  assert n = 2, format('o leitor de codigo precisa das 2 funcoes do main, tem %s', n);

  raise notice 'LIMPEZA 0036 OK: sem duplicata, leitor de codigo intacto';
end $check$;
