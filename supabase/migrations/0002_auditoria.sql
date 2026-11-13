-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0002 · Auditoria por trigger
--
-- O histórico de alterações é escrito PELO BANCO, no mesmo commit da
-- alteração. O cliente não grava auditoria e não consegue pular: mesmo
-- quem tiver a chave e chamar a API direto deixa rastro com o próprio
-- usuário. É a fonte da tela "Histórico" (AuditEntry em src/data/types.ts).
--
-- Ninguém (anon, authenticated) tem INSERT/UPDATE/DELETE nesta tabela.
-- Só a função do trigger (SECURITY DEFINER, dono postgres) escreve.
--
-- Os triggers das tabelas novas (metas_programadas, dispositivos) ficam
-- nas migrações delas (0004, 0006). Os das tabelas existentes, aqui.
--
-- ROLLBACK:
--   drop trigger if exists trg_auditoria on public.operadores_metas;
--   drop trigger if exists trg_auditoria on public.configuracoes_gerais;
--   drop trigger if exists trg_auditoria on public.config_previsao;
--   drop trigger if exists trg_auditoria on public.familias_embalagem;
--   drop trigger if exists trg_auditoria on public.membros;
--   drop trigger if exists trg_auditoria on public.membros_modulos;
--   drop function if exists app.registrar_auditoria();
--   -- a tabela auditoria NÃO deve ser apagada (é evidência); renomeie se preciso.
-- ====================================================================

create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  ator_id     uuid,                 -- null = sistema (cron, SQL Editor)
  ator_nome   text not null,
  ator_tipo   text not null check (ator_tipo in ('pessoa', 'dispositivo', 'sistema')),
  acao        text not null,        -- mesmo vocabulário de AuditAction no front
  tabela      text not null,
  operacao    text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  alvo_tipo   text not null check (alvo_tipo in ('operador', 'usuario', 'config', 'dispositivo')),
  alvo_id     text not null,
  antes       jsonb,
  depois      jsonb,
  -- ip e user-agent vindos do PostgREST; servem para investigação, não para regra
  origem      jsonb
);

create index if not exists idx_auditoria_em on public.auditoria (em desc);
create index if not exists idx_auditoria_alvo on public.auditoria (alvo_tipo, alvo_id, em desc);
create index if not exists idx_auditoria_ator on public.auditoria (ator_id, em desc);

revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
-- service_role só lê: nem com a secret key dá para apagar ou reescrever o histórico.
grant select on public.auditoria to service_role;

alter table public.auditoria enable row level security;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated
  using ((select app.tem_permissao('auditoria.ver')));

-- --------------------------------------------------------------------
-- Trigger genérico.
--   TG_ARGV[0] = coluna que identifica o alvo
--   TG_ARGV[1] = tipo do alvo (operador | usuario | config | dispositivo)
-- --------------------------------------------------------------------
create or replace function app.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_uid     uuid := auth.uid();
  v_nome    text;
  v_tipo    text;
  v_acao    text;
  v_headers jsonb;
begin
  -- UPDATE que não mudou nada não é evento.
  if tg_op = 'UPDATE' and (v_old - 'atualizado_em') = (v_new - 'atualizado_em') then
    return null;
  end if;

  if v_uid is null then
    v_nome := 'Sistema (' || current_user || ')';
    v_tipo := 'sistema';
  else
    select m.nome, m.tipo into v_nome, v_tipo from public.membros m where m.user_id = v_uid;
    if not found then
      v_nome := 'Conta sem perfil';
      v_tipo := 'pessoa';
    end if;
  end if;

  v_acao := case tg_table_name
    when 'configuracoes_gerais' then
      case when (v_new ->> 'meta_horaria_global') is null then 'meta-global.remover' else 'meta-global.definir' end
    when 'operadores_metas' then
      case
        when tg_op = 'INSERT' then 'operador.criar'
        when tg_op = 'DELETE' then 'operador.excluir'
        when (v_old ->> 'status') is distinct from (v_new ->> 'status') then 'operador.cadastro'
        when (v_old - 'meta_horaria') = (v_new - 'meta_horaria') then 'meta-individual.definir'
        else 'operador.editar'
      end
    when 'config_previsao' then
      case when (v_old ->> 'equipe_padrao') is distinct from (v_new ->> 'equipe_padrao')
           then 'previsao.equipe' else 'previsao.configurar' end
    when 'familias_embalagem' then 'previsao.embalagem'
    when 'membros' then
      case
        when tg_op = 'INSERT' then 'usuario.convidar'
        when (v_old ->> 'status') is distinct from (v_new ->> 'status') then 'usuario.status'
        else 'usuario.perfil'
      end
    when 'membros_modulos' then 'usuario.perfil'
    when 'metas_programadas' then 'meta-programada.definir'
    when 'dispositivos' then
      case when tg_op = 'INSERT' then 'dispositivo.parear'
           when (v_new ->> 'status') = 'revogado' then 'dispositivo.revogar'
           else 'dispositivo.editar' end
    else lower(tg_table_name) || '.' || lower(tg_op)
  end;

  -- Só rótulo, não regra: o front manda x-hope-acao: desfazer quando a
  -- gravação é o "desfazer" de um toast. Qualquer outro valor é ignorado.
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  if coalesce(v_headers ->> 'x-hope-acao', '') = 'desfazer' then
    v_acao := 'desfazer';
  end if;

  insert into public.auditoria (ator_id, ator_nome, ator_tipo, acao, tabela, operacao, alvo_tipo, alvo_id, antes, depois, origem)
  values (
    v_uid, v_nome, v_tipo, v_acao, tg_table_name, tg_op, tg_argv[1],
    coalesce(v_row ->> tg_argv[0], '?'),
    v_old, v_new,
    jsonb_strip_nulls(jsonb_build_object(
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(v_headers ->> 'user-agent', 300),
      'sessao', auth.jwt() ->> 'session_id'
    ))
  );
  return null;
end;
$$;

revoke all on function app.registrar_auditoria() from public, anon, authenticated;

-- Tabelas existentes (nenhuma coluna nova nelas: só trigger).
drop trigger if exists trg_auditoria on public.operadores_metas;
create trigger trg_auditoria after insert or update or delete on public.operadores_metas
  for each row execute function app.registrar_auditoria('id_operador', 'operador');

drop trigger if exists trg_auditoria on public.configuracoes_gerais;
create trigger trg_auditoria after update on public.configuracoes_gerais
  for each row execute function app.registrar_auditoria('id', 'config');

drop trigger if exists trg_auditoria on public.config_previsao;
create trigger trg_auditoria after update on public.config_previsao
  for each row execute function app.registrar_auditoria('id', 'config');

drop trigger if exists trg_auditoria on public.familias_embalagem;
create trigger trg_auditoria after insert or update or delete on public.familias_embalagem
  for each row execute function app.registrar_auditoria('familia', 'config');

drop trigger if exists trg_auditoria on public.membros;
create trigger trg_auditoria after insert or update or delete on public.membros
  for each row execute function app.registrar_auditoria('user_id', 'usuario');

drop trigger if exists trg_auditoria on public.membros_modulos;
create trigger trg_auditoria after insert or update or delete on public.membros_modulos
  for each row execute function app.registrar_auditoria('user_id', 'usuario');

-- --------------------------------------------------------------------
-- Retenção: 2 anos (ver LGPD no docs/seguranca.md). Rodar pelo pg_cron:
--   select cron.schedule('auditoria-retencao', '30 6 1 * *',
--     $$delete from public.auditoria where em < now() - interval '2 years'$$);
-- --------------------------------------------------------------------
