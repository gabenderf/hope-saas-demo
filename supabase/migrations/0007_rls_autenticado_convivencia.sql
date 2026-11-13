-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0007 · RLS para usuários AUTENTICADOS nas tabelas existentes
--        (fase de CONVIVÊNCIA: as policies `anon_*` antigas continuam)
--
-- Este arquivo só ACRESCENTA policies `to authenticated`. Nada que roda
-- hoje com a anon key quebra: dashboard antigo, extensão e coletor
-- seguem funcionando como estão. O corte do anônimo é a 0008, rodada só
-- depois que extensão e coletor estiverem com credencial própria.
--
-- Quem é quem (app.tem_permissao, ver 0001):
--   pessoa      expedicao.ver / metas.editar / operadores.gerenciar / previsao.configurar
--   TV          tv.ver (só leitura do que o Modo TV mostra)
--   bancada     bancada.registrar  (extensão do UpSeller, uma conta por máquina)
--   coletor     coletor.registrar  (coletor-fila, máquina da liderança)
--
-- ⚠️ COLUNAS NOVAS em tabelas existentes (aditivas, nullable, ninguém
-- precisa mandar; o default preenche com quem gravou):
--   pedidos_separados.registrado_por uuid default auth.uid()
--   logs_acesso.registrado_por       uuid default auth.uid()
--   fila_snapshots.registrado_por    uuid default auth.uid()
-- Com a anon key elas ficam null (não há usuário). Servem para saber QUAL
-- máquina gravou cada bipagem, o que hoje é impossível.
--
-- ROLLBACK: rodar o bloco "desfazer" no fim deste arquivo.
-- ====================================================================

alter table public.pedidos_separados add column if not exists registrado_por uuid default auth.uid();
alter table public.logs_acesso       add column if not exists registrado_por uuid default auth.uid();
alter table public.fila_snapshots    add column if not exists registrado_por uuid default auth.uid();

grant select, insert, update on public.operadores_metas    to authenticated;
grant select, insert         on public.pedidos_separados   to authenticated;
grant select, insert         on public.logs_acesso         to authenticated;
grant select, update         on public.configuracoes_gerais to authenticated;
grant select, insert         on public.fila_snapshots      to authenticated;
grant select, insert         on public.fila_snapshot_itens to authenticated;
grant select, insert, update on public.previsao_dia        to authenticated;
grant select, update         on public.config_previsao     to authenticated;
grant select, insert, update, delete on public.familias_embalagem to authenticated;
grant select on public.fila_do_dia, public.fila_pendente, public.demanda_sku_dia to authenticated;
-- Sequences das tabelas com BIGSERIAL (INSERT precisa).
grant usage on sequence public.pedidos_separados_id_registro_seq, public.logs_acesso_id_log_seq,
  public.fila_snapshots_id_seq, public.fila_snapshot_itens_id_seq to authenticated;
-- Nome de fila_snapshot_itens_id_seq conferido na produção em 10/11/2026 (antes era um lembrete
-- "conferir e acrescentar"; sem ele o coletor pareado falharia ao inserir itens).

-- --------------------------------------------------------------------
-- operadores_metas
-- --------------------------------------------------------------------
drop policy if exists auth_operadores_select on public.operadores_metas;
create policy auth_operadores_select on public.operadores_metas for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or (select app.tem_permissao('bancada.registrar'))   -- GET_OPERATOR na hora do login na bancada
  );

-- Pessoa: cadastro pelo painel. Bancada: CREATE_OPERATOR da extensão, sempre ativo e com meta sã.
drop policy if exists auth_operadores_insert on public.operadores_metas;
create policy auth_operadores_insert on public.operadores_metas for insert to authenticated
  with check (
    ((select app.tem_permissao('expedicao.operadores.gerenciar')) and (select app.eh_pessoa_aal2()))
    or ((select app.tem_permissao('bancada.registrar')) and status = 'ativo' and meta_horaria between 1 and 300)
  );

drop policy if exists auth_operadores_update on public.operadores_metas;
create policy auth_operadores_update on public.operadores_metas for update to authenticated
  using (
    ((select app.tem_permissao('expedicao.operadores.gerenciar')) or (select app.tem_permissao('expedicao.metas.editar')))
    and (select app.eh_pessoa_aal2())
  )
  with check (
    ((select app.tem_permissao('expedicao.operadores.gerenciar')) or (select app.tem_permissao('expedicao.metas.editar')))
    and (select app.eh_pessoa_aal2())
    and meta_horaria between 1 and 300
    and status in ('ativo', 'inativo')
  );
-- Sem DELETE para autenticado: o app novo desativa (status = 'inativo'). Exclusão de
-- operador com bipagens já falhava pela FK RESTRICT; sem bipagens, faça no SQL Editor.

-- --------------------------------------------------------------------
-- pedidos_separados (append-only: ninguém autenticado faz UPDATE/DELETE)
-- --------------------------------------------------------------------
drop policy if exists auth_pedidos_select on public.pedidos_separados;
create policy auth_pedidos_select on public.pedidos_separados for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or (select app.tem_permissao('coletor.registrar'))   -- fila_pendente cruza com o que já foi bipado
    -- bancada: só o recente (GET_OPERATOR_STATS do dia e o return=representation do POST)
    or ((select app.tem_permissao('bancada.registrar')) and data_hora >= now() - interval '36 hours')
  );

drop policy if exists auth_pedidos_insert on public.pedidos_separados;
-- quantidade_pedidos = 1: é o que REGISTER_SCAN grava em toda bipagem.
-- A extensão também tem REGISTER_CHECKOUT (upseller-extension/background.js
-- ~117-123), que mandaria quantidade livre, mas ele NÃO é chamado em lugar
-- nenhum (docs/modelo-de-dados.md, seção 9). Se voltar a ser usado, esta
-- policy recusa a inserção: conferir antes do corte do anônimo (0008).
create policy auth_pedidos_insert on public.pedidos_separados for insert to authenticated
  with check (
    (select app.tem_permissao('bancada.registrar'))
    and registrado_por = (select auth.uid())
    and quantidade_pedidos = 1
    and data_hora between now() - interval '5 minutes' and now() + interval '1 minute'
  );

-- --------------------------------------------------------------------
-- logs_acesso (append-only)
-- --------------------------------------------------------------------
drop policy if exists auth_logs_select on public.logs_acesso;
create policy auth_logs_select on public.logs_acesso for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or ((select app.tem_permissao('bancada.registrar')) and data_hora >= now() - interval '36 hours')
  );

drop policy if exists auth_logs_insert on public.logs_acesso;
create policy auth_logs_insert on public.logs_acesso for insert to authenticated
  with check (
    (select app.tem_permissao('bancada.registrar'))
    and registrado_por = (select auth.uid())
    and data_hora between now() - interval '5 minutes' and now() + interval '1 minute'
  );

-- --------------------------------------------------------------------
-- configuracoes_gerais (linha única)
-- --------------------------------------------------------------------
drop policy if exists auth_config_select on public.configuracoes_gerais;
create policy auth_config_select on public.configuracoes_gerais for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or (select app.tem_permissao('bancada.registrar'))   -- GET_GLOBAL_META a cada 60 s
  );

drop policy if exists auth_config_update on public.configuracoes_gerais;
create policy auth_config_update on public.configuracoes_gerais for update to authenticated
  using ((select app.tem_permissao('expedicao.metas.editar')) and (select app.eh_pessoa_aal2()))
  with check (
    (select app.tem_permissao('expedicao.metas.editar')) and (select app.eh_pessoa_aal2())
    and (meta_horaria_global is null or meta_horaria_global between 1 and 300)
  );

-- --------------------------------------------------------------------
-- fila_snapshots / fila_snapshot_itens (append-only, gravados pelo coletor)
-- --------------------------------------------------------------------
drop policy if exists auth_fila_snapshots_select on public.fila_snapshots;
create policy auth_fila_snapshots_select on public.fila_snapshots for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))              -- vigia "última coleta de dados"
    or (select app.tem_permissao('coletor.registrar'))
  );

drop policy if exists auth_fila_snapshots_insert on public.fila_snapshots;
create policy auth_fila_snapshots_insert on public.fila_snapshots for insert to authenticated
  with check ((select app.tem_permissao('coletor.registrar')) and registrado_por = (select auth.uid()));

-- Itens têm loja, rastreio e conteúdo do pedido: a TV não lê.
drop policy if exists auth_fila_itens_select on public.fila_snapshot_itens;
create policy auth_fila_itens_select on public.fila_snapshot_itens for select to authenticated
  using ((select app.tem_permissao('expedicao.ver')) or (select app.tem_permissao('coletor.registrar')));

drop policy if exists auth_fila_itens_insert on public.fila_snapshot_itens;
create policy auth_fila_itens_insert on public.fila_snapshot_itens for insert to authenticated
  with check (
    (select app.tem_permissao('coletor.registrar'))
    and exists (select 1 from public.fila_snapshots s
                where s.id = snapshot_id and s.registrado_por = (select auth.uid()))
  );

-- --------------------------------------------------------------------
-- previsao_dia (coletor publica e atualiza; liderança pode republicar)
-- --------------------------------------------------------------------
drop policy if exists auth_previsao_dia_select on public.previsao_dia;
create policy auth_previsao_dia_select on public.previsao_dia for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or (select app.tem_permissao('coletor.registrar'))
  );

drop policy if exists auth_previsao_dia_insert on public.previsao_dia;
create policy auth_previsao_dia_insert on public.previsao_dia for insert to authenticated
  with check ((select app.tem_permissao('coletor.registrar')));

drop policy if exists auth_previsao_dia_update on public.previsao_dia;
create policy auth_previsao_dia_update on public.previsao_dia for update to authenticated
  using (
    (select app.tem_permissao('coletor.registrar'))
    or ((select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2()))
  )
  with check (
    (select app.tem_permissao('coletor.registrar'))
    or ((select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2()))
  );
-- Lembrete: a meta do dia é congelada pelo coletor na primeira coleta de dados. Se for
-- preciso impedir o coletor de mexer em meta_* depois disso, é trigger (não policy).

-- --------------------------------------------------------------------
-- config_previsao (linha única)
-- --------------------------------------------------------------------
drop policy if exists auth_config_previsao_select on public.config_previsao;
create policy auth_config_previsao_select on public.config_previsao for select to authenticated
  using (
    (select app.tem_permissao('expedicao.ver'))
    or (select app.tem_permissao('tv.ver'))
    or (select app.tem_permissao('coletor.registrar'))
  );

drop policy if exists auth_config_previsao_update on public.config_previsao;
create policy auth_config_previsao_update on public.config_previsao for update to authenticated
  using ((select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2()))
  with check (
    (select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2())
    and equipe_padrao between 1 and 20
  );

-- --------------------------------------------------------------------
-- familias_embalagem
-- --------------------------------------------------------------------
drop policy if exists auth_familias_select on public.familias_embalagem;
create policy auth_familias_select on public.familias_embalagem for select to authenticated
  using ((select app.tem_permissao('expedicao.ver')));

drop policy if exists auth_familias_write on public.familias_embalagem;
create policy auth_familias_write on public.familias_embalagem for all to authenticated
  using ((select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2()))
  with check (
    (select app.tem_permissao('expedicao.previsao.configurar')) and (select app.eh_pessoa_aal2())
    and tamanho_embalagem between 1 and 10000
  );

-- --------------------------------------------------------------------
-- usuarios_painel: NENHUMA policy para authenticated. O app novo nunca lê
-- essa tabela. Ela some na 0008.
--
-- Views (fila_do_dia, fila_pendente, demanda_sku_dia) são security_invoker:
-- herdam as policies acima de quem consulta. Nada a fazer além do GRANT.
--
-- Realtime: postgres_changes respeita o RLS do JWT da assinatura. O
-- supabase-js já repassa o token novo a cada refresh.
-- --------------------------------------------------------------------

/* ---------- desfazer (rollback) ----------
drop policy if exists auth_operadores_select on public.operadores_metas;
drop policy if exists auth_operadores_insert on public.operadores_metas;
drop policy if exists auth_operadores_update on public.operadores_metas;
drop policy if exists auth_pedidos_select on public.pedidos_separados;
drop policy if exists auth_pedidos_insert on public.pedidos_separados;
drop policy if exists auth_logs_select on public.logs_acesso;
drop policy if exists auth_logs_insert on public.logs_acesso;
drop policy if exists auth_config_select on public.configuracoes_gerais;
drop policy if exists auth_config_update on public.configuracoes_gerais;
drop policy if exists auth_fila_snapshots_select on public.fila_snapshots;
drop policy if exists auth_fila_snapshots_insert on public.fila_snapshots;
drop policy if exists auth_fila_itens_select on public.fila_snapshot_itens;
drop policy if exists auth_fila_itens_insert on public.fila_snapshot_itens;
drop policy if exists auth_previsao_dia_select on public.previsao_dia;
drop policy if exists auth_previsao_dia_insert on public.previsao_dia;
drop policy if exists auth_previsao_dia_update on public.previsao_dia;
drop policy if exists auth_config_previsao_select on public.config_previsao;
drop policy if exists auth_config_previsao_update on public.config_previsao;
drop policy if exists auth_familias_select on public.familias_embalagem;
drop policy if exists auth_familias_write on public.familias_embalagem;
-- As colunas registrado_por podem ficar (nullable, ninguém lê). Para tirar:
-- alter table public.pedidos_separados drop column if exists registrado_por;
-- alter table public.logs_acesso drop column if exists registrado_por;
-- alter table public.fila_snapshots drop column if exists registrado_por;
------------------------------------------- */
