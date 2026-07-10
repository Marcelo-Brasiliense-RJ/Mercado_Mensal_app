-- Diagnostico do "gasto do mes". Rode no SQL Editor do Supabase.
-- Mostra, por household, o total de compras do mes corrente (mesma conta da
-- tela Economia: sum(unit_price * quantity) das purchases do mes).

select h.id as household_id,
       h.name,
       count(p.*)                                as compras_mes,
       coalesce(sum(p.unit_price * p.quantity),0) as gasto_mes,
       (select count(*) from products pr where pr.household_id = h.id) as produtos
from households h
left join purchases p
       on p.household_id = h.id
      and date_trunc('month', p.purchased_at) = date_trunc('month', current_date)
group by h.id, h.name
order by gasto_mes desc;

-- Quem esta amarrado a cada household (pra confirmar qual e o do usuario logado):
select hm.household_id, h.name, hm.auth_user_id, hm.role
from household_members hm
join households h on h.id = hm.household_id
order by h.name;
