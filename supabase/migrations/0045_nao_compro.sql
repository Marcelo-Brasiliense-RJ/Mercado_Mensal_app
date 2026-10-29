-- Mercado_app: lista "Não compro" (produtos ruins, de qualidade inferior).
-- Rode DEPOIS de 0044.
--
-- Por que existe: o app recomenda o mais barato, e o mais barato as vezes e justamente
-- a marca que a casa ja provou e nao quer mais. Marcado aqui, o produto sai das ofertas
-- e das recomendacoes, e ler o codigo dele no mercado mostra o aviso.
--
-- termo: palavras que identificam o produto, com a marca ("cafe pilao", "detergente
-- ype"); todas tem que estar no nome da oferta. barcode: quando marcado pela leitura,
-- casa exato com a embalagem.

create table if not exists promo_evitar (
  id           bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  termo        text not null,
  nome         text not null,
  barcode      text,
  motivo       text,
  foto         text,              -- miniatura (data URI) copiada da oferta, ou URL da loja
  criado_em    timestamptz not null default now(),
  unique (household_id, termo)
);
alter table promo_evitar enable row level security;
revoke all on promo_evitar from anon, authenticated;

create or replace function mercado_evitar_web()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  return json_build_object('ok', true, 'itens', coalesce((
    select json_agg(json_build_object('id', e.id, 'termo', e.termo, 'nome', e.nome, 'barcode', e.barcode,
                                      'motivo', e.motivo, 'foto', case when e.foto like 'http%' then e.foto end,
                                      'tem_foto', e.foto is not null) order by e.criado_em desc)
      from promo_evitar e where e.household_id = h), '[]'::json));
end $fn$;

create or replace function mercado_evitar_salvar_web(
  p_termo text, p_nome text, p_barcode text default null, p_motivo text default null,
  p_oferta bigint default null, p_foto text default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid; t text := lower(trim(coalesce(p_termo, ''))); f text; e promo_evitar;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  if length(t) < 2 then return json_build_object('ok', false, 'erro', 'sem_nome'); end if;
  select foto into f from promo_ofertas where id = p_oferta;
  insert into promo_evitar (household_id, termo, nome, barcode, motivo, foto)
  values (h, t, coalesce(nullif(trim(p_nome), ''), t), nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), ''),
          nullif(trim(coalesce(p_motivo, '')), ''), coalesce(f, case when p_foto like 'https://%' then p_foto end))
  on conflict (household_id, termo) do update
     set nome = excluded.nome, barcode = coalesce(excluded.barcode, promo_evitar.barcode),
         motivo = coalesce(excluded.motivo, promo_evitar.motivo), foto = coalesce(excluded.foto, promo_evitar.foto)
  returning * into e;
  return json_build_object('ok', true, 'id', e.id);
end $fn$;

create or replace function mercado_evitar_remover_web(p_id bigint)
returns json language plpgsql security definer set search_path = public as $fn$
declare h uuid;
begin
  select household_id into h from household_members where auth_user_id = auth.uid() limit 1;
  if h is null then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;
  delete from promo_evitar where id = p_id and household_id = h;
  return json_build_object('ok', true);
end $fn$;

create or replace function mercado_evitar_foto_web(p_id bigint)
returns text language sql stable security definer set search_path = public as $fn$
  select e.foto from promo_evitar e
    join household_members m on m.household_id = e.household_id and m.auth_user_id = auth.uid()
   where e.id = p_id and e.foto like 'data:%';
$fn$;

revoke execute on function mercado_evitar_web(), mercado_evitar_salvar_web(text, text, text, text, bigint, text),
  mercado_evitar_remover_web(bigint), mercado_evitar_foto_web(bigint) from public, anon;
grant execute on function mercado_evitar_web(), mercado_evitar_salvar_web(text, text, text, text, bigint, text),
  mercado_evitar_remover_web(bigint), mercado_evitar_foto_web(bigint) to authenticated;

-- ============ SELF-TEST (padrao 0007; casa de teste criada e apagada aqui) ============
do $test$
declare cid bigint := 999999046; h uuid;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0045', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;
  insert into promo_evitar (household_id, termo, nome) values (h, 'cafe marca x', 'Café Marca X');
  begin
    insert into promo_evitar (household_id, termo, nome) values (h, 'cafe marca x', 'de novo');
    assert false, 'termo repetido na mesma casa deveria falhar';
  exception when unique_violation then null;
  end;
  assert not (mercado_evitar_web()->>'ok')::boolean or auth.uid() is not null, 'sem sessao deveria falhar';
  delete from households where id = h;
  delete from household_members where telegram_chat_id = cid;
  raise notice 'SELF-TEST 0045 (nao compro) OK';
end $test$;
