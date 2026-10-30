-- Mercado_app: desfaz o estrago da "0037_foto_produto.sql" aplicada em 2026-10-30.
-- Rode DEPOIS de 0051. Pode rodar mais de uma vez.
--
-- O que aconteceu: aquele SQL foi escrito a partir de uma copia velha do repositorio
-- (parada no PR #7) e recriou mercado_stock_web com o corpo da 0008, que devolve
-- 'category' vazio. Com isso o Estoque perdeu a categoria escolhida pela casa (0048).
-- Nenhum dado foi apagado: products.categoria continua la; so a leitura voltou atras.
-- Aqui a leitura volta exatamente a da 0048.
--
-- A coluna products.image_url criada por aquele SQL fica: esta vazia, nao atrapalha,
-- e derrubar coluna e a unica operacao destrutiva possivel aqui. Para remover:
--   alter table products drop column if exists image_url;

create or replace function mercado_stock_web()
returns json language sql stable security definer set search_path = public as $$
  with h as (
    select household_id from household_members where auth_user_id = auth.uid() limit 1
  ),
  precos as (
    select product_id,
           (array_agg(unit_price order by purchased_at desc))[1] as price_last,
           avg(unit_price) as price_avg
    from purchases where product_id is not null
    group by product_id
  )
  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'name', p.name,
    'category', coalesce(p.categoria, ''),
    'unit', p.unit,
    'current', p.current_stock,
    'normal', p.par_level,
    'priceLast', pr.price_last,
    'priceAvg', pr.price_avg,
    'trend', case when coalesce(pr.price_avg,0) > 0
                  then round(((pr.price_last - pr.price_avg) / pr.price_avg)::numeric, 2)
                  else 0 end
  ) order by p.name), '[]'::json)
  from products p
  join h on p.household_id = h.household_id
  left join precos pr on pr.product_id = p.id
$$;
grant execute on function mercado_stock_web() to authenticated;

-- Funcao criada por aquele SQL e que nenhuma tela do app chama.
drop function if exists mercado_product_foto_web(uuid, text);

do $check$
begin
  assert position('coalesce(p.categoria' in pg_get_functiondef('mercado_stock_web()'::regprocedure)) > 0,
    'mercado_stock_web deveria devolver a categoria da 0048';
  assert not exists (select 1 from pg_proc where proname = 'mercado_product_foto_web'),
    'mercado_product_foto_web deveria ter saido';
  raise notice 'CONSERTO 0052 OK: Estoque volta a mostrar a categoria';
end $check$;
