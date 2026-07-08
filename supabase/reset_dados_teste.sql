-- reset_dados_teste.sql
-- Zera TODOS os dados de teste para comecar do zero. Roda no SQL Editor do Supabase.
-- MANTEM as contas de login (auth.users). Apaga familias, vinculos e dados.
-- Depois: logar no app, criar familia nova, vincular o Telegram e testar do zero.

delete from receipt_drafts;
delete from purchases;
delete from shopping_list;
delete from products;
delete from budgets;
delete from household_members;
delete from households;
delete from users;   -- tabela antiga (pre-multitenant), se existir algo
