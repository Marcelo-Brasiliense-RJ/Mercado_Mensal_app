-- Mercado_app: lista "Não precisa agora".
-- Rode DEPOIS de 0052.
--
-- Por que existe: ditando a lista, a casa diz tambem o que NAO precisa ("nao precisa
-- comprar macarrao, ja tem muito"). Ignorar isso perde informacao: o item acaba no
-- carrinho mesmo com excesso em casa. Aqui fica guardado, e o app avisa se alguem por
-- o item no carrinho.
--
-- Diferente do "Nao compro" (0045, promo_evitar): aquele e marca ruim, para sempre, e
-- esconde as ofertas. Este e temporario e nao esconde nada.
--
-- Sai sozinho quando o estoque BAIXAR: abaixo do que havia quando foi marcado e abaixo
-- do nivel normal (quando a casa tem um). Ou a mao. Item sem produto no estoque so sai
-- a mao.

create table if not exists nao_precisa (
  id              bigserial primary key,
  household_id    uuid not null references households(id) on delete cascade,
  nome            text not null,               -- minusculo, como products.name
  estoque_marcado numeric not null default 0,  -- estoque na hora em que foi marcado
  criado_em       timestamptz not null default now(),
  unique (household_id, nome)
);
alter table nao_precisa enable row level security;
revoke all on nao_precisa from anon, authenticated;
-- Sem policies, como promo_evitar (0045): acesso so pelas funcoes abaixo.

-- ============ LER ============
-- Limpa antes o que saiu sozinho, por isso e volatile (nao stable).
create or replace function mercado_nao_precisa_web()
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  delete from nao_precisa n
   using products p
   where n.household_id = h and p.household_id = h and p.name = n.nome
     and p.current_stock < n.estoque_marcado
     and (p.par_level <= 0 or p.current_stock < p.par_level);

  return json_build_object('ok', true, 'itens', coalesce((
    select json_agg(json_build_object(
             'id', n.id, 'nome', n.nome,
             'estoque', p.current_stock, 'unidade', p.unit) order by n.criado_em desc)
      from nao_precisa n
      left join products p on p.household_id = h and p.name = n.nome
     where n.household_id = h), '[]'::json));
end $fn$;

-- ============ MARCAR ============
-- Marcar de novo o mesmo item renova a data e o estoque de referencia.
create or replace function mercado_nao_precisa_add_web(p_nome text)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; n text; i bigint;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  n := lower(trim(coalesce(p_nome, '')));
  if n = '' then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;

  insert into nao_precisa (household_id, nome, estoque_marcado)
    values (h, n, coalesce((select current_stock from products where household_id = h and name = n), 0))
    on conflict (household_id, nome)
      do update set criado_em = now(), estoque_marcado = excluded.estoque_marcado
    returning id into i;
  return json_build_object('ok', true, 'id', i);
end $fn$;

-- ============ TIRAR ============
create or replace function mercado_nao_precisa_remover_web(p_id bigint)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from nao_precisa where id = p_id and household_id = h;
  return json_build_object('ok', true);
end $fn$;

revoke execute on function mercado_nao_precisa_web(), mercado_nao_precisa_add_web(text),
  mercado_nao_precisa_remover_web(bigint) from public, anon;
grant execute on function mercado_nao_precisa_web(), mercado_nao_precisa_add_web(text),
  mercado_nao_precisa_remover_web(bigint) to authenticated;

-- ============ VERIFICACAO ============
-- As funcoes dependem de auth.uid() (sessao web), que nao da para fabricar aqui sem
-- sujar o auth do projeto (mesma nota da 0021). Confere a estrutura.
do $check$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('mercado_nao_precisa_web', 'mercado_nao_precisa_add_web', 'mercado_nao_precisa_remover_web');
  assert n = 3, format('esperava 3 funcoes do nao_precisa, tem %s', n);
  assert (select relrowsecurity from pg_class where oid = 'public.nao_precisa'::regclass),
    'nao_precisa precisa de RLS ligada';
  raise notice 'NAO PRECISA 0053 OK';
end $check$;
