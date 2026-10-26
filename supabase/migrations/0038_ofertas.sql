-- Mercado_app: ofertas dos mercados dentro do app (aba Ofertas).
-- Rode DEPOIS de 0037.
--
-- Por que existe: o monitor (promocoes/coletor) le os encartes dos mercados da regiao e
-- publica aqui. A aba Ofertas cruza com o que a casa precisa (0037) e mostra so o que
-- importa: o mais barato de cada item que falta e onde comprar.
--
-- Oferta e publica, nao e da casa: uma linha serve a todas as familias. Por isso a tabela
-- nao tem household_id. RLS ligado e sem policy: ninguem le direto, so pelas RPCs.
--
-- A foto (miniatura webp em data URI, ~3 KB) fica numa coluna, mas a lista nao traz a
-- foto: a tela pede uma por vez pela rota /api/oferta-foto, que o navegador guarda em cache.
-- ponytail: foto em coluna text em vez do Storage. Com ~3 mil ofertas da ~10 MB; se a regiao
-- crescer muito, o upgrade e mover para um bucket publico e guardar so a URL.

-- ============ TABELA ============
create table if not exists promo_ofertas (
  id          bigserial primary key,
  mercado     text not null,          -- mundial | guanabara | supermarket | superbom ...
  produto     text not null,
  marca       text not null default '',
  tamanho     text not null default '',
  categoria   text not null default 'Outros',
  preco_por   numeric not null check (preco_por > 0),
  preco_de    numeric,
  condicao    text,                   -- "No App Mundial Total", "Com CPF no caixa", "Leve 3 pague 2"
  inicio      timestamptz,
  fim         timestamptz,            -- null: preco do site, vale enquanto a coleta for recente
  foto        text,                   -- data:image/webp;base64,...
  coletado_em timestamptz not null default now()
);
create index if not exists idx_promo_mercado on promo_ofertas (mercado);
alter table promo_ofertas enable row level security;
revoke all on promo_ofertas from anon, authenticated;

-- ============ PUBLICAR (monitor, service_role) ============
-- Troca a foto inteira de um mercado de uma vez: apaga o que havia e grava a coleta nova.
-- So entra oferta aprovada (o monitor manda as "revisar" de fora).
create or replace function mercado_promo_publicar_h(p_mercado text, p_ofertas json)
returns json language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if coalesce(trim(p_mercado), '') = '' then
    return json_build_object('ok', false, 'erro', 'mercado_vazio');
  end if;
  delete from promo_ofertas where mercado = p_mercado;
  insert into promo_ofertas (mercado, produto, marca, tamanho, categoria, preco_por, preco_de,
                             condicao, inicio, fim, foto)
  select p_mercado, o->>'produto', coalesce(o->>'marca', ''), coalesce(o->>'tamanho', ''),
         coalesce(nullif(o->>'categoria', ''), 'Outros'), (o->>'preco_por')::numeric,
         nullif(o->>'preco_de', '')::numeric, nullif(o->>'condicao', ''),
         nullif(o->>'inicio', '')::timestamptz, nullif(o->>'fim', '')::timestamptz, nullif(o->>'foto', '')
    from json_array_elements(coalesce(p_ofertas, '[]'::json)) o
   where coalesce(o->>'produto', '') <> '' and coalesce((o->>'preco_por')::numeric, 0) > 0;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'mercado', p_mercado, 'gravadas', n);
end $fn$;

-- ============ LER (app) ============
-- Vigente = dentro da validade, ou sem validade e coletada ha menos de 8 dias.
create or replace function mercado_promo_vigentes()
returns setof promo_ofertas language sql stable security definer set search_path = public as $fn$
  select * from promo_ofertas
   where (fim is not null and fim > now())
      or (fim is null and coletado_em > now() - interval '8 days');
$fn$;

create or replace function mercado_ofertas_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object(
    'ok', true,
    'lista', mercado_promo_lista_h(h),
    'atualizado_em', (select max(coletado_em) from promo_ofertas),
    'ofertas', coalesce((
      select json_agg(json_build_object(
               'id', v.id, 'mercado', v.mercado, 'produto', v.produto, 'marca', v.marca,
               'tamanho', v.tamanho, 'categoria', v.categoria, 'preco_por', v.preco_por,
               'preco_de', v.preco_de, 'condicao', v.condicao, 'fim', v.fim,
               'tem_foto', v.foto is not null))
        from mercado_promo_vigentes() v), '[]'::json));
end $fn$;

-- Foto de uma oferta. Qualquer pessoa logada pode ver: e a mesma foto do encarte publico.
create or replace function mercado_oferta_foto_web(p_id bigint)
returns text language sql stable security definer set search_path = public as $fn$
  select foto from promo_ofertas where id = p_id and auth.uid() is not null;
$fn$;

-- ============ PERMISSOES ============
revoke execute on function mercado_promo_publicar_h(text, json) from public, anon, authenticated;
grant execute on function mercado_promo_publicar_h(text, json) to service_role;
revoke execute on function mercado_promo_vigentes() from public, anon, authenticated;
revoke execute on function mercado_ofertas_web(), mercado_oferta_foto_web(bigint) from public, anon;
grant execute on function mercado_ofertas_web(), mercado_oferta_foto_web(bigint) to authenticated;

-- ============ SELF-TEST (padrao 0007; so mexe no mercado de teste) ============
do $test$
declare r json; n int;
begin
  delete from promo_ofertas where mercado = 'teste-0038';

  r := mercado_promo_publicar_h('teste-0038', json_build_array(
    json_build_object('produto', 'Arroz Rei do Sul', 'tamanho', '5kg', 'preco_por', 14.95,
                      'fim', (now() + interval '2 days')::text, 'foto', 'data:image/webp;base64,AA'),
    json_build_object('produto', 'Leite Italac', 'preco_por', 4.47, 'preco_de', 5.99,
                      'fim', (now() - interval '1 day')::text),          -- vencida
    json_build_object('produto', 'Cafe Pilao 500g', 'preco_por', 17.98),  -- site: sem validade
    json_build_object('produto', 'Sem preco', 'preco_por', 0)));         -- descartada
  assert (r->>'ok')::boolean and (r->>'gravadas')::int = 3, format('deveria gravar 3, veio %s', r);

  select count(*) into n from mercado_promo_vigentes() where mercado = 'teste-0038';
  assert n = 2, format('vigentes: arroz (na validade) e cafe (coleta recente), veio %s', n);

  -- republicar troca tudo do mercado, nao soma
  r := mercado_promo_publicar_h('teste-0038', json_build_array(json_build_object('produto', 'Feijao', 'preco_por', 3.99)));
  select count(*) into n from promo_ofertas where mercado = 'teste-0038';
  assert n = 1, format('republicar deveria substituir, ficaram %s', n);

  r := mercado_promo_publicar_h('  ', '[]');
  assert not (r->>'ok')::boolean and r->>'erro' = 'mercado_vazio', 'mercado vazio deveria falhar';

  -- sem sessao (SQL Editor) a porta web nao acha familia e a foto nao sai
  r := mercado_ofertas_web();
  assert not (r->>'ok')::boolean and r->>'erro' = 'sem_familia', format('sem sessao: %s', r);
  assert mercado_oferta_foto_web((select id from promo_ofertas where mercado = 'teste-0038' limit 1)) is null,
    'foto sem sessao deveria ser null';

  delete from promo_ofertas where mercado = 'teste-0038';
  raise notice 'SELF-TEST 0038 (ofertas) OK';
end $test$;
