-- Mercado_app — rate limit reutilizavel (rota cara: transcricao Groq + LLM via n8n)
-- Rode DEPOIS de 0003. Padrao do projeto: RLS ligado sem policy (so service_role),
-- funcoes SECURITY DEFINER com search_path fixo.
--
-- Por que no banco e nao no app: a rota cara e o webhook do Telegram -> n8n, que nao
-- passa pelo Next.js. O Postgres ja e o ponto comum de todas as escritas, entao o
-- contador de abuso vive aqui e o n8n so consulta antes de chamar Groq/LLM.

-- ============ 1. CONTADOR POR BUCKET ============
create table if not exists rate_limit (
  bucket       text primary key,        -- ex.: 'ai:123456789' (chat_id) ou 'ip:1.2.3.4'
  window_start timestamptz not null,    -- inicio da janela atual
  count        int not null default 0
);
alter table rate_limit enable row level security;  -- sem policy: so service_role acessa

-- ============ 2. CONTA 1 HIT; ok=false quando estoura o limite na janela ============
-- Janela fixa: quando a janela expira, zera e recomeca.
-- ponytail: janela fixa (pode haver rajada na virada da janela). Se precisar de
-- suavizacao, trocar por janela deslizante (guardar timestamps). Basta para abuso.
create or replace function mercado_rate_limit(
  p_bucket text, p_max int, p_window interval default interval '1 minute')
returns json language plpgsql security definer set search_path = public as $$
declare c int; w timestamptz; now_ts timestamptz := now();
begin
  insert into rate_limit (bucket, window_start, count)
    values (p_bucket, now_ts, 1)
  on conflict (bucket) do update set
    -- as duas expressoes leem o window_start ANTIGO (pre-update), entao ficam coerentes
    window_start = case when rate_limit.window_start < now_ts - p_window then now_ts
                        else rate_limit.window_start end,
    count        = case when rate_limit.window_start < now_ts - p_window then 1
                        else rate_limit.count + 1 end
  returning count, window_start into c, w;

  if c > p_max then
    return json_build_object('ok', false, 'limite', p_max, 'restante', 0,
      'reset_em_s', ceil(extract(epoch from (w + p_window - now_ts))));
  end if;
  return json_build_object('ok', true, 'limite', p_max, 'restante', p_max - c,
    'reset_em_s', ceil(extract(epoch from (w + p_window - now_ts))));
end $$;

-- ============ 3. LIMPEZA (chamar no job diario, junto do mercado_draft_cleanup) ============
create or replace function mercado_rate_limit_cleanup()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from rate_limit where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ 4. PERMISSOES ============
revoke execute on function
  mercado_rate_limit(text, int, interval),
  mercado_rate_limit_cleanup()
  from public, anon;
grant execute on function
  mercado_rate_limit(text, int, interval),
  mercado_rate_limit_cleanup()
  to service_role;

-- ============ 5. SELF-TEST (roda na aplicacao; falha alto se a logica quebrar) ============
do $$
declare r json; b text := '__selftest__' || md5(clock_timestamp()::text);
begin
  delete from rate_limit where bucket = b;
  r := mercado_rate_limit(b, 2, interval '1 minute');
  assert (r->>'ok')::boolean,        'hit 1/2 deveria passar';
  r := mercado_rate_limit(b, 2, interval '1 minute');
  assert (r->>'ok')::boolean,        'hit 2/2 deveria passar';
  r := mercado_rate_limit(b, 2, interval '1 minute');
  assert not (r->>'ok')::boolean,    'hit 3/2 deveria estourar o limite';
  assert (r->>'restante') = '0',     'restante deveria ser 0 ao estourar';
  delete from rate_limit where bucket = b;
  raise notice 'SELF-TEST 0007 rate_limit OK';
end $$;
