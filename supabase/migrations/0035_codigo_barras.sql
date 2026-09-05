-- Mercado_app: codigo de barras -> item no carrinho.
-- Rode DEPOIS de 0034.
--
-- Por que existe: dentro do mercado, digitar o nome do produto e a parte cara da
-- entrada de dados (regra 2 da secao 0.1 do tarefas.md: todo campo nasce preenchido).
-- A embalagem ja carrega a identidade do produto no codigo de barras. Lendo o codigo,
-- o app sabe QUAL item e, e a pessoa so confirma a quantidade.
--
-- O catalogo e da casa, nao global: "Leite" para uma familia e "leite integral" para
-- outra, e o nome canonico do produto ja e por household (products.name e unique por
-- casa). Entao product_barcodes tambem e por casa e aprende sozinho: da primeira vez
-- a pessoa digita o nome uma unica vez, e o codigo fica amarrado aquele produto.
-- ponytail: sem base publica de EAN (Open Food Facts / Cosmos) nesta rodada. Se o
-- "digitar o nome na primeira leitura" incomodar, o upgrade e consultar a base por
-- fora e usar a resposta so como sugestao de nome, mantendo esta tabela como verdade.

-- ============ TABELA ============
create table if not exists product_barcodes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  barcode      text not null,                                  -- so digitos (EAN-8/13, UPC, ITF-14)
  product_id   uuid references products(id) on delete set null,
  item_name    text not null,                                  -- nome canonico, minusculo
  unit         text not null default 'un',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, barcode)
);
create index if not exists idx_barcodes_house on product_barcodes (household_id);

alter table product_barcodes enable row level security;
-- Sem policies, como shopping_trips/trip_items (0012): acesso so pelas funcoes
-- SECURITY DEFINER abaixo.

-- ============ NORMALIZACAO ============
-- O leitor da camera devolve o codigo cru; teclado de celular deixa passar espaco e
-- hifen. Guardar e comparar sempre so pelos digitos evita o mesmo produto entrar duas
-- vezes so por causa de formatacao.
create or replace function mercado_barcode_norm(p_code text)
returns text language sql immutable as $fn$
  select nullif(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), '')
$fn$;

-- ============ CONSULTAR ============
-- Devolve o que a tela precisa para ja nascer preenchida: nome, unidade, ultimo preco
-- pago e a situacao do estoque. 'encontrado' false nao e erro: e a primeira leitura
-- daquele codigo, e a tela pede o nome uma unica vez.
create or replace function mercado_barcode_find_h(h uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $fn$
declare code text; b record; pid uuid; nome text; un text;
        estoque numeric; nivel numeric; preco numeric;
begin
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  code := mercado_barcode_norm(p_code);
  if code is null then return json_build_object('ok', false, 'erro', 'codigo_invalido'); end if;

  select * into b from product_barcodes where household_id = h and barcode = code;
  if not found then
    return json_build_object('ok', true, 'encontrado', false, 'codigo', code);
  end if;

  nome := b.item_name;
  un   := b.unit;
  -- O vinculo pode ter sido criado antes do produto existir (item novo, ainda sem
  -- compra fechada), entao o product_id e reconferido pelo nome a cada consulta.
  pid := b.product_id;
  if pid is null then
    select id into pid from products where household_id = h and name = nome;
  end if;

  select current_stock, par_level, unit into estoque, nivel, un
    from products where id = pid;

  select unit_price into preco from purchases
    where product_id = pid order by purchased_at desc limit 1;

  return json_build_object(
    'ok', true, 'encontrado', true, 'codigo', code,
    'nome', nome, 'unidade', coalesce(un, b.unit, 'un'),
    'preco', preco,
    'estoque_atual', coalesce(estoque, 0), 'nivel_normal', coalesce(nivel, 0));
end $fn$;
revoke execute on function mercado_barcode_find_h(uuid, text) from public, anon, authenticated, service_role;

create or replace function mercado_barcode_find_web(p_code text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_barcode_find_h(h, p_code);
end $fn$;

-- ============ PEGAR PELO CODIGO ============
-- Uma chamada so: resolve o codigo, poe no carrinho (mercado_trip_add_h, a MESMA
-- funcao do botao "Peguei" e do bot) e, se deu certo, grava/atualiza o vinculo.
-- Gravar depois do sucesso e proposital: codigo nao fica amarrado a item que o
-- carrinho recusou (sem preco, por exemplo).
create or replace function mercado_barcode_add_h(
  h uuid, p_code text, p_name text default null, p_price numeric default null,
  p_qty numeric default 1, p_unit text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare code text; nome text; un text; pid uuid; r json; novo boolean := false;
begin
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  code := mercado_barcode_norm(p_code);
  if code is null then return json_build_object('ok', false, 'erro', 'codigo_invalido'); end if;

  nome := lower(trim(coalesce(p_name, '')));
  if nome = '' then
    -- Sem nome informado, so da para seguir se o codigo ja e conhecido.
    select item_name, unit into nome, un from product_barcodes
      where household_id = h and barcode = code;
    if nome is null then
      return json_build_object('ok', false, 'erro', 'codigo_desconhecido', 'codigo', code);
    end if;
  else
    novo := not exists (select 1 from product_barcodes
                          where household_id = h and barcode = code and item_name = nome);
  end if;

  un := coalesce(nullif(trim(coalesce(p_unit, '')), ''), un, 'un');

  r := mercado_trip_add_h(h, nome, p_price, coalesce(p_qty, 1), un);
  if not (r->>'ok')::boolean then
    return (r::jsonb || jsonb_build_object('codigo', code, 'nome', nome))::json;
  end if;

  select id into pid from products where household_id = h and name = nome;

  insert into product_barcodes (household_id, barcode, product_id, item_name, unit)
    values (h, code, pid, nome, un)
    on conflict (household_id, barcode) do update
      set item_name = excluded.item_name,
          unit      = excluded.unit,
          -- Produto so existe depois da primeira compra fechada; nao apaga o que ja
          -- estava vinculado quando a consulta desta vez veio sem id.
          product_id = coalesce(excluded.product_id, product_barcodes.product_id),
          updated_at = now();

  return (r::jsonb || jsonb_build_object('codigo', code, 'nome', nome, 'vinculo_novo', novo))::json;
end $fn$;
revoke execute on function mercado_barcode_add_h(uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated, service_role;

create or replace function mercado_barcode_add_web(
  p_code text, p_name text default null, p_price numeric default null,
  p_qty numeric default 1, p_unit text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return mercado_barcode_add_h(h, p_code, p_name, p_price, p_qty, p_unit);
end $fn$;

-- ============ PERMISSOES ============
revoke execute on function
  mercado_barcode_find_web(text),
  mercado_barcode_add_web(text, text, numeric, numeric, text)
  from public, anon;
grant execute on function
  mercado_barcode_find_web(text),
  mercado_barcode_add_web(text, text, numeric, numeric, text)
  to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
-- Como em 0026, o caminho autenticado nao e testavel em SQL (auth_user_id tem FK para
-- auth.users). O que este bloco prova e o miolo compartilhado pelas duas portas.
do $test$
declare cid bigint := 999999035; h uuid; r json; n int;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0035', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  -- normalizacao: espaco e hifen somem, nao-digito puro vira null
  assert mercado_barcode_norm(' 789-1234 567890 ') = '7891234567890', 'norm deveria deixar so digitos';
  assert mercado_barcode_norm('abc') is null,                         'codigo sem digito deveria virar null';

  -- codigo nunca lido: consulta responde ok com encontrado=false (nao e erro)
  r := mercado_barcode_find_h(h, '7891234567890');
  assert (r->>'ok')::boolean and not (r->>'encontrado')::boolean,
    'codigo novo deveria voltar ok com encontrado=false';

  -- pegar sem nome, com codigo desconhecido: a tela precisa saber que tem que perguntar
  r := mercado_barcode_add_h(h, '7891234567890', null, 10.00, 1, 'un');
  assert not (r->>'ok')::boolean and r->>'erro' = 'codigo_desconhecido',
    'codigo desconhecido sem nome deveria devolver codigo_desconhecido';

  -- primeira leitura: nome informado uma vez, item entra no carrinho e o vinculo nasce
  r := mercado_barcode_add_h(h, '789-1234 567890', 'Leite', 5.49, 2, 'L');
  assert (r->>'ok')::boolean,                     format('deveria entrar no carrinho, veio %s', r);
  assert (r->>'nome') = 'leite',                  'nome deveria ser gravado em minusculo';
  assert (r->>'codigo') = '7891234567890',        'codigo deveria voltar normalizado';
  assert (r->>'vinculo_novo')::boolean,           'primeira leitura deveria marcar vinculo novo';
  assert (r->>'total_parcial')::numeric = 10.98,  format('2 x 5,49 = 10,98, veio %s', r->>'total_parcial');
  select count(*) into n from product_barcodes where household_id = h;
  assert n = 1, format('deveria existir 1 vinculo, veio %s', n);

  -- segunda leitura: o codigo ja se identifica sozinho
  r := mercado_barcode_find_h(h, '7891234567890');
  assert (r->>'encontrado')::boolean and (r->>'nome') = 'leite', 'codigo ja lido deveria se identificar';

  -- e da para pegar so com o codigo e a quantidade
  r := mercado_barcode_add_h(h, '7891234567890', null, 5.49, 1, null);
  assert (r->>'ok')::boolean and (r->>'nome') = 'leite', 'codigo conhecido deveria dispensar o nome';
  assert not (r->>'vinculo_novo')::boolean,              'releitura do mesmo item nao e vinculo novo';

  -- codigo lido errado (produto trocado): informar o nome certo corrige o vinculo,
  -- sem criar uma segunda linha para o mesmo codigo
  r := mercado_barcode_add_h(h, '7891234567890', 'leite desnatado', 6.00, 1, 'L');
  assert (r->>'ok')::boolean, 'corrigir o nome do vinculo deveria funcionar';
  select count(*) into n from product_barcodes where household_id = h and barcode = '7891234567890';
  assert n = 1, format('um codigo tem que ter um vinculo so, veio %s', n);
  assert (select item_name from product_barcodes where household_id = h and barcode = '7891234567890')
         = 'leite desnatado', 'vinculo deveria apontar para o nome corrigido';

  -- item sem preco e sem historico continua barrado pelo carrinho (regra da 0026),
  -- e nesse caso o vinculo NAO pode ser gravado
  r := mercado_barcode_add_h(h, '7899999999999', 'quinoa', null, 1, 'kg');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_preco', 'sem preco deveria vir do trip_add';
  assert not exists (select 1 from product_barcodes where household_id = h and barcode = '7899999999999'),
    'carrinho recusou o item, entao o vinculo nao pode ter sido gravado';

  -- codigo invalido nao vira lixo
  r := mercado_barcode_add_h(h, 'sem digito', 'arroz', 20, 1, 'kg');
  assert not (r->>'ok')::boolean and r->>'erro' = 'codigo_invalido', 'codigo sem digito deveria ser recusado';

  -- casa nao resolvida nao estoura
  r := mercado_barcode_find_h(null, '7891234567890');
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', 'sem casa deveria ser sem_familia';

  -- carrinho: 3 itens entraram (leite na 1a leitura, leite na 2a, leite desnatado)
  select count(*) into n from trip_items ti join shopping_trips s on s.id = ti.trip_id
    where s.household_id = h and s.status = 'open';
  assert n = 3, format('carrinho deveria ter 3 itens, veio %s', n);

  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0035 (codigo de barras) OK';
end $test$;
