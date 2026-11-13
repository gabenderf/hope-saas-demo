-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0008 · CORTE do acesso anônimo
--
-- ⚠️ IRREVERSÍVEL NA PRÁTICA para quem ainda usa a anon key. Depois disto:
--   - o dashboard antigo (../../../../dashboard-expedicao/index.html) para de carregar dados e de logar;
--   - extensão de bancada que ainda não foi pareada para de registrar bipagens;
--   - coletor-fila que ainda não foi pareado para de gravar a fila.
--
-- Só rodar quando o checklist da fase 5 do docs/seguranca.md estiver todo
-- marcado (todas as bancadas pareadas, coletor pareado, SaaS em uso, dashboard
-- antigo aposentado) e FORA do horário de expedição.
--
-- ROLLBACK DE EMERGÊNCIA: reexecutar as seções 5 e 6 de
-- ../../../upseller-extension/database.sql e a seção 7 de
-- ../../../previsao-expedicao/schema.sql (recriam as policies anon_*). A senha
-- dos usuarios_painel continua lá (renomeada), ver abaixo.
-- ====================================================================

begin;

-- 1. Policies anônimas antigas (nomes exatos dos .sql de origem)
drop policy if exists "anon_select_operadores" on public.operadores_metas;
drop policy if exists "anon_insert_operadores" on public.operadores_metas;
drop policy if exists "anon_update_operadores" on public.operadores_metas;
drop policy if exists "anon_delete_operadores" on public.operadores_metas;
drop policy if exists "anon_select_pedidos" on public.pedidos_separados;
drop policy if exists "anon_insert_pedidos" on public.pedidos_separados;
drop policy if exists "anon_select_logs" on public.logs_acesso;
drop policy if exists "anon_insert_logs" on public.logs_acesso;
drop policy if exists "anon_select_config" on public.configuracoes_gerais;
drop policy if exists "anon_update_config" on public.configuracoes_gerais;
drop policy if exists "anon_select_fila_snapshots" on public.fila_snapshots;
drop policy if exists "anon_insert_fila_snapshots" on public.fila_snapshots;
drop policy if exists "anon_select_fila_itens" on public.fila_snapshot_itens;
drop policy if exists "anon_insert_fila_itens" on public.fila_snapshot_itens;
drop policy if exists "anon_select_previsao_dia" on public.previsao_dia;
drop policy if exists "anon_insert_previsao_dia" on public.previsao_dia;
drop policy if exists "anon_update_previsao_dia" on public.previsao_dia;
drop policy if exists "anon_select_config_previsao" on public.config_previsao;
drop policy if exists "anon_update_config_previsao" on public.config_previsao;
drop policy if exists "anon_select_familias" on public.familias_embalagem;
drop policy if exists "anon_insert_familias" on public.familias_embalagem;
drop policy if exists "anon_update_familias" on public.familias_embalagem;
drop policy if exists "anon_delete_familias" on public.familias_embalagem;
drop policy if exists "anon_select_usuarios" on public.usuarios_painel;
drop policy if exists "anon_insert_usuarios" on public.usuarios_painel;
drop policy if exists "anon_delete_usuarios" on public.usuarios_painel;

-- 2. GRANTs: anon não enxerga nada do schema public.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
-- Tabela nova não nasce aberta para o anon (o padrão do Supabase é GRANT ALL).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 3. Login antigo (verificar_login_painel + usuarios_painel)
-- O bypass do "gabriel" vive no app.js do dashboard antigo e morre junto com ele;
-- o app novo nunca teve. A função de login some aqui.
drop function if exists public.verificar_login_painel(text, text);

-- A tabela fica 30 dias renomeada e sem acesso nenhum (nem authenticated),
-- caso alguém precise conferir quem existia. Depois: drop table.
revoke all on public.usuarios_painel from anon, authenticated;
alter table if exists public.usuarios_painel rename to usuarios_painel_legado;
comment on table public.usuarios_painel_legado is
  'Login do dashboard antigo, desativado no corte (0008). Apagar 30 dias depois: drop table public.usuarios_painel_legado;';

commit;

-- 4. Depois do corte, conferir (deve voltar zero linhas):
--   select schemaname, tablename, policyname, roles
--   from pg_policies where 'anon' = any(roles);
--   select table_name, privilege_type from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public';
