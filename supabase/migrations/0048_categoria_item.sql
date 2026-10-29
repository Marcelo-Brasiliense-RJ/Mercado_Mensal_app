-- Mercado_app: a categoria (corredor) do item passa a poder ser escolhida pela casa.
-- Rode DEPOIS de 0047.
--
-- Por que existe: a categoria era so deduzida do nome (web/src/lib/categorias.ts) e o
-- que a tabela nao conhecia caia em "Outros" (adocante, alcool, antisseptico...). Agora
-- a casa corrige com um toque e a correcao vale para sempre. Sem escolha, segue o
-- palpite pelo nome, como antes.

alter table products add column if not exists categoria text;

-- Mesmas categorias dos encartes (web/src/lib/ofertas.ts, CORREDOR).
create or replace function mercado_categoria_valida(c text)
returns boolean language sql immutable as $fn$
  select c in ('Hortifruti', 'Padaria', 'Carnes', 'Frios e Laticínios', 'Congelados', 'Mercearia',
               'Doces e Biscoitos', 'Bebidas', 'Limpeza', 'Perfumaria e Higiene', 'Bebê', 'Pet',
               'Utilidades', 'Outros');
$fn$;

-- A leitura do estoque (0008) passa a devolver a categoria escolhida ('' = deduzir).
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

-- p_categoria null ou '': volta ao palpite pelo nome.
create or replace function mercado_stock_categoria_web(p_id uuid, p_categoria text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; c text := nullif(trim(coalesce(p_categoria, '')), '');
begin
  if c is not null and not mercado_categoria_valida(c) then
    return json_build_object('ok', false, 'erro', 'categoria_invalida');
  end if;
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  update products set categoria = c, updated_at = now() where id = p_id and household_id = h;
  if not found then return json_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return json_build_object('ok', true);
end $fn$;

revoke execute on function mercado_stock_categoria_web(uuid, text) from public, anon;
grant execute on function mercado_stock_categoria_web(uuid, text) to authenticated;

-- ============ SELF-TEST ============
do $test$
begin
  assert mercado_categoria_valida('Limpeza') and mercado_categoria_valida('Perfumaria e Higiene'), 'categoria conhecida';
  assert not mercado_categoria_valida('Qualquer coisa'), 'categoria inventada';
  assert (mercado_stock_categoria_web(gen_random_uuid(), 'Inventada')->>'erro') = 'categoria_invalida', 'valida antes de gravar';
  raise notice 'SELF-TEST 0048 (categoria do item) OK';
end $test$;
