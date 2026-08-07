-- Mercado_app: preferencias por pessoa, comecando por emoji nas listas.
-- Rode DEPOIS de 0028.
--
-- Pedido do dono, dito por audio depois de ver a lista de compras: "agora coloque
-- emoji dos itens". (O Whisper transcreveu isso como "mochocondula das comidas",
-- o que virou de quebra um bom exemplo de por que o bot deve perguntar em vez de
-- adivinhar quando o nome nao faz sentido.)
--
-- Guardado POR PESSOA, nao por casa: quem divide a despensa pode querer coisas
-- diferentes, e household_members ja tem uma linha por membro. Coluna jsonb em vez
-- de tabela nova porque preferencia e um punhado de chaves curtas por pessoa.
-- ponytail: jsonb solto, sem tabela de dominio. Se as chaves passarem de uma
-- duzia, ou precisarem de validacao cruzada, ai sim vira tabela.

alter table household_members
  add column if not exists prefs jsonb not null default '{}'::jsonb;

-- ============ EMOJI POR ITEM ============
-- Tabela literal de palavra-chave, no mesmo espirito do unitFor do front: sem IA,
-- sem dependencia, cobrindo o que aparece numa compra de mes brasileira. O que nao
-- casar cai no marcador neutro, entao a lista nunca fica com emoji errado.
-- Os nomes chegam em minusculo; as variacoes com e sem acento estao no proprio regex
-- porque nao da para contar com a extensao unaccent instalada.
create or replace function mercado_emoji(p_nome text)
returns text language sql immutable set search_path = public as $fn$
  select case
    when p_nome ~ 'arroz'                                             then '🍚'
    when p_nome ~ 'feij(a|ã)o'                                        then '🫘'
    when p_nome ~ '(macarr(a|ã)o|miojo|espaguete|talharim)'           then '🍝'
    when p_nome ~ '(farinha|fub(a|á)|aveia)'                          then '🌾'
    when p_nome ~ 'leite'                                             then '🥛'
    when p_nome ~ 'queijo'                                            then '🧀'
    when p_nome ~ '(manteiga|margarina|requeij(a|ã)o)'                then '🧈'
    when p_nome ~ 'iogurte'                                           then '🥣'
    when p_nome ~ 'ovo'                                               then '🥚'
    when p_nome ~ '(frango|asinha|sobrecoxa|coxa|peito de)'           then '🍗'
    when p_nome ~ '(carne|bife|costela|linguic|linguiç|salsich|presunto|mortadela|bacon|pernil|alcatra|patinho)' then '🥩'
    when p_nome ~ '(peixe|sardinha|atum|til(a|á)pia|salm(a|ã)o)'      then '🐟'
    when p_nome ~ '(p(a|ã)o|torrada)'                                 then '🍞'
    when p_nome ~ '(biscoito|bolacha|wafer|maisena|trakinas|clube social)' then '🍪'
    when p_nome ~ '(chocolate|mousse|brigadeiro|achocolatado|nescau)' then '🍫'
    when p_nome ~ '(salgadinho|chips|torcida|skiny|pipoca|farofa)'    then '🍿'
    when p_nome ~ 'caf(e|é)'                                          then '☕'
    when p_nome ~ 'a(c|ç)(u|ú)car'                                    then '🍬'
    when p_nome ~ '^sal($| )'                                         then '🧂'
    when p_nome ~ '(tempero|or(e|é)gano|piment|coentro|salsa|alga)'   then '🌿'
    when p_nome ~ '(azeite|(o|ó)leo|vinagre)'                         then '🫒'
    when p_nome ~ '(batata|mandioca|inhame)'                          then '🥔'
    when p_nome ~ 'tomate'                                            then '🍅'
    when p_nome ~ 'cebola'                                            then '🧅'
    when p_nome ~ 'alho'                                              then '🧄'
    when p_nome ~ 'cenoura'                                           then '🥕'
    when p_nome ~ 'banana'                                            then '🍌'
    when p_nome ~ '(ma(c|ç)(a|ã)|pera)'                               then '🍎'
    when p_nome ~ '(laranja|lim(a|ã)o|tangerina|mexerica)'            then '🍊'
    when p_nome ~ '(refrigerante|coca|guaran(a|á)|soda)'              then '🥤'
    when p_nome ~ 'suco'                                              then '🧃'
    when p_nome ~ 'cerveja'                                           then '🍺'
    when p_nome ~ '(vinho|espumante)'                                 then '🍷'
    when p_nome ~ '(a|á)gua'                                          then '💧'
    when p_nome ~ 'papel (higi(e|ê)nico|toalha)'                      then '🧻'
    when p_nome ~ '(sab(a|ã)o|sabonete|detergente|amaciante|lava)'    then '🧼'
    when p_nome ~ '(desinfetante|cloro|alvejante|lisoforme|(a|á)lcool|vanish|bom ar)' then '🧴'
    when p_nome ~ '(shampoo|xampu|condicionador|creme dental|pasta de dente|escova)'  then '🪥'
    when p_nome ~ '(absorvente|fralda)'                               then '🧷'
    when p_nome ~ '(sacola|lixo|saco de)'                             then '🗑️'
    when p_nome ~ '(repelente|sbp|inseticida)'                        then '🦟'
    else '•'
  end
$fn$;

-- ============ GRAVAR A PREFERENCIA ============
-- Chave restrita de proposito: chave livre viraria lixo acumulado sem ninguem ler.
create or replace function mercado_pref_set(p_chat_id bigint, p_chave text, p_valor text)
returns json language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  p_chave := lower(trim(coalesce(p_chave, '')));
  if p_chave <> 'emoji' then
    return json_build_object('ok', false, 'erro', 'preferencia_desconhecida', 'chave', p_chave);
  end if;

  update household_members
    set prefs = prefs || jsonb_build_object(p_chave, (lower(coalesce(p_valor,'')) in ('true','sim','1','on','ligado')))
    where telegram_chat_id = p_chat_id;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('ok', false, 'erro', 'sem_familia'); end if;

  return json_build_object('ok', true, 'chave', p_chave,
    'ligado', (select (prefs->>p_chave)::boolean from household_members where telegram_chat_id = p_chat_id),
    'text', case when (select (prefs->>p_chave)::boolean from household_members where telegram_chat_id = p_chat_id)
                 then '👍 Pronto, agora mando as listas com emoji.'
                 else '👍 Pronto, tirei os emoji das listas.' end);
end $fn$;

-- ============ CONSULTA PASSA A RESPEITAR A PREFERENCIA ============
-- Mesma funcao de 0028; a unica mudanca e o marcador de cada linha, que deixa de ser
-- '•' fixo e passa por mercado_emoji quando a pessoa pediu emoji.
create or replace function mercado_consulta_texto(p_chat_id bigint, p_tipo text)
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  h uuid; linhas text; n int; gasto numeric; orc numeric; txt text;
  linhas_lista text; n_lista int; usa_emoji boolean;
begin
  h := mercado_resolve_household(p_chat_id);
  if h is null then
    return json_build_object('ok', false, 'erro', 'sem_familia',
      'text', 'Você ainda não entrou numa família. Me diga "criar família" com um nome, ou "entrar" com o código de convite.');
  end if;

  select coalesce((prefs->>'emoji')::boolean, false) into usa_emoji
    from household_members where telegram_chat_id = p_chat_id limit 1;
  usa_emoji := coalesce(usa_emoji, false);

  p_tipo := lower(trim(coalesce(p_tipo, 'estoque')));

  if p_tipo = 'economia' then
    select coalesce(sum(unit_price * quantity), 0) into gasto
      from purchases
      where household_id = h
        and date_trunc('month', purchased_at) = date_trunc('month', current_date);
    select amount into orc from budgets
      where household_id = h and month = date_trunc('month', current_date)::date limit 1;
    txt := '💰 Economia do mês' || chr(10)
        || 'Gasto: R$ ' || replace(to_char(gasto, 'FM999999990.00'), '.', ',');
    if orc is not null and orc > 0 then
      txt := txt || chr(10) || 'Orçamento: R$ ' || replace(to_char(orc, 'FM999999990.00'), '.', ',');
      if gasto > orc then
        txt := txt || chr(10) || 'Você passou R$ ' || replace(to_char(gasto - orc, 'FM999999990.00'), '.', ',') || ' do orçamento.';
      else
        txt := txt || chr(10) || 'Ainda dá pra gastar R$ ' || replace(to_char(orc - gasto, 'FM999999990.00'), '.', ',') || '.';
      end if;
    end if;
    return json_build_object('ok', true, 'text', txt);
  end if;

  if p_tipo = 'faltando' then
    select string_agg(case when usa_emoji then mercado_emoji(item_name) else '•' end
                        || ' ' || initcap(item_name)
                        || case when coalesce(desired_quantity, 0) > 0
                                then ' (' || mercado_fmt_num(desired_quantity) || ' ' || coalesce(unit, 'un') || ')'
                                else '' end, chr(10)
                        order by item_name),
           count(*)
      into linhas, n
      from shopping_list
      where household_id = h and status = 'pending';
    if coalesce(n, 0) = 0 then
      return json_build_object('ok', true,
        'text', '🛒 Sua lista de compras está vazia. Me diga o que está faltando que eu anoto.');
    end if;
    return json_build_object('ok', true,
      'text', '🛒 Lista de compras (' || n || '):' || chr(10) || linhas);
  end if;

  if p_tipo <> 'estoque' then
    select string_agg(case when usa_emoji then mercado_emoji(name) else '•' end
                        || ' ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
                        order by name), count(*)
      into linhas, n
      from products where household_id = h and name ilike '%' || p_tipo || '%';

    select string_agg(case when usa_emoji then mercado_emoji(item_name) else '•' end
                        || ' ' || initcap(item_name)
                        || case when coalesce(desired_quantity, 0) > 0
                                then ' (' || mercado_fmt_num(desired_quantity) || ' ' || coalesce(unit, 'un') || ')'
                                else '' end, chr(10)
                        order by item_name), count(*)
      into linhas_lista, n_lista
      from shopping_list
      where household_id = h and status = 'pending' and item_name ilike '%' || p_tipo || '%';

    if coalesce(n, 0) = 0 and coalesce(n_lista, 0) = 0 then
      return json_build_object('ok', true,
        'text', initcap(p_tipo) || ' não está no seu estoque nem na lista de compras.');
    end if;

    txt := '🔎 ' || initcap(p_tipo);
    txt := txt || chr(10) || chr(10) || '📦 Em casa:' || chr(10)
        || coalesce(linhas, '• nada cadastrado');
    txt := txt || chr(10) || chr(10) || '🛒 Na lista:' || chr(10)
        || coalesce(linhas_lista, '• não está na lista');
    return json_build_object('ok', true, 'text', txt);
  end if;

  select string_agg(case when usa_emoji then mercado_emoji(name) else '•' end
                      || ' ' || initcap(name) || ': ' || mercado_fmt_num(current_stock) || ' ' || unit, chr(10)
                      order by name),
         count(*)
    into linhas, n
    from products
    where household_id = h and current_stock > 0;
  if coalesce(n, 0) = 0 then
    return json_build_object('ok', true, 'text', '📦 Seu estoque está vazio. Registre uma compra que eu começo a acompanhar.');
  end if;
  if length(linhas) > 3500 then
    linhas := left(linhas, 3500) || chr(10) || '… (lista grande, veja tudo no app)';
  end if;
  return json_build_object('ok', true,
    'text', '📦 Estoque (' || n || ' itens):' || chr(10) || linhas);
end $fn$;

revoke execute on function mercado_pref_set(bigint, text, text) from public, anon;
grant  execute on function mercado_pref_set(bigint, text, text) to service_role;
revoke execute on function mercado_consulta_texto(bigint, text) from public, anon;
grant  execute on function mercado_consulta_texto(bigint, text) to service_role;

-- ============ SELF-TEST ============
do $test$
declare cid bigint := 999999091; h uuid; r json; t text;
begin
  delete from households where id in (select household_id from household_members where telegram_chat_id = cid);
  delete from household_members where telegram_chat_id = cid;
  perform mercado_create_family(cid, 'Casa Teste 0029', 'Tester');
  select household_id into h from household_members where telegram_chat_id = cid;

  perform mercado_add_to_list(cid, 'arroz', 2, 'kg');
  perform mercado_add_to_list(cid, 'detergente', 1, 'un');
  -- Item sem emoji conhecido. Nome proposital sem nenhuma palavra-chave dentro:
  -- o primeiro teste usou "xisdopeixe", que casou com 'peixe' e virou peixinho.
  perform mercado_add_to_list(cid, 'zzteste', 1, 'un');

  -- por padrao, nada muda: continua com o marcador de sempre
  t := mercado_consulta_texto(cid, 'faltando')->>'text';
  assert t like '%• Arroz%', format('sem preferencia a lista deveria manter o bullet, veio: %s', t);
  assert t not like '%🍚%',  'sem preferencia nao pode vir emoji';

  -- liga a preferencia
  r := mercado_pref_set(cid, 'emoji', 'true');
  assert (r->>'ok')::boolean and (r->>'ligado')::boolean, 'deveria ligar o emoji';

  t := mercado_consulta_texto(cid, 'faltando')->>'text';
  assert t like '%🍚 Arroz%',      format('arroz deveria vir com emoji, veio: %s', t);
  assert t like '%🧼 Detergente%', format('detergente deveria vir com emoji, veio: %s', t);
  assert t like '%• Xisdopeixe%',  format('item desconhecido cai no marcador neutro, veio: %s', t);

  -- desliga
  r := mercado_pref_set(cid, 'emoji', 'nao');
  assert (r->>'ok')::boolean and not (r->>'ligado')::boolean, 'deveria desligar o emoji';
  t := mercado_consulta_texto(cid, 'faltando')->>'text';
  assert t not like '%🍚%', 'depois de desligar nao pode sobrar emoji';

  -- chave que nao existe e recusada, nao gravada em silencio
  r := mercado_pref_set(cid, 'cor_do_bot', 'azul');
  assert not (r->>'ok')::boolean and r->>'erro' = 'preferencia_desconhecida',
    'chave desconhecida deveria ser recusada';

  -- a preferencia e da PESSOA: outro chat na mesma casa nao herda
  perform mercado_pref_set(cid, 'emoji', 'true');
  insert into household_members (household_id, telegram_chat_id, name)
    values (h, 999999092, 'Outro');
  t := mercado_consulta_texto(999999092, 'faltando')->>'text';
  assert t not like '%🍚%', 'a preferencia de um membro nao pode vazar para o outro';

  delete from households where id = h;
  delete from household_members where telegram_chat_id in (cid, 999999092);
  raise notice 'SELF-TEST 0029 (preferencia de emoji por pessoa) OK';
end $test$;
