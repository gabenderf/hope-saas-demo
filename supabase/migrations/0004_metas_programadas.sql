-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0004 · Metas programadas por dia
--
-- A liderança deixa a meta global de amanhã (ou do dia 13/10) definida
-- antes. À 00:05 de São Paulo o pg_cron copia a do dia para
-- configuracoes_gerais.meta_horaria_global, que é o que a extensão e o
-- painel já leem: nenhum dos dois precisa mudar.
--
-- valor null = "sem meta global neste dia" (volta a valer a individual).
-- Espelha GoalScheduleEntry em src/data/types.ts.
--
-- ROLLBACK:
--   select cron.unschedule('aplicar-meta-programada');
--   drop function if exists app.aplicar_meta_programada();
--   drop table if exists public.metas_programadas;
-- ====================================================================

create table if not exists public.metas_programadas (
  dia           date primary key,
  valor         integer check (valor is null or valor between 1 and 300),
  nota          text check (nota is null or char_length(nota) <= 200),
  criado_por    uuid not null default auth.uid() references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

revoke all on public.metas_programadas from anon;
grant select, insert, update, delete on public.metas_programadas to authenticated;
grant select, insert, update, delete on public.metas_programadas to service_role;  -- ver 0001: sem acesso automático

alter table public.metas_programadas enable row level security;

drop policy if exists metas_programadas_select on public.metas_programadas;
create policy metas_programadas_select on public.metas_programadas for select to authenticated
  using ((select app.tem_permissao('expedicao.ver')) or (select app.tem_permissao('tv.ver')));

-- Só dia de hoje em diante (fuso de São Paulo); passado é histórico.
drop policy if exists metas_programadas_write on public.metas_programadas;
create policy metas_programadas_write on public.metas_programadas for all to authenticated
  using (
    (select app.tem_permissao('expedicao.metas.editar')) and (select app.eh_pessoa_aal2())
    and dia >= (now() at time zone 'America/Sao_Paulo')::date
  )
  with check (
    (select app.tem_permissao('expedicao.metas.editar')) and (select app.eh_pessoa_aal2())
    and dia >= (now() at time zone 'America/Sao_Paulo')::date
    and dia <= (now() at time zone 'America/Sao_Paulo')::date + 120
  );

drop trigger if exists trg_metas_programadas_atualizado_em on public.metas_programadas;
create trigger trg_metas_programadas_atualizado_em before update on public.metas_programadas
  for each row execute function app.tocar_atualizado_em();

drop trigger if exists trg_auditoria on public.metas_programadas;
create trigger trg_auditoria after insert or update or delete on public.metas_programadas
  for each row execute function app.registrar_auditoria('dia', 'config');

-- --------------------------------------------------------------------
-- Aplicação diária. Auditada como "Sistema" pelo trigger de
-- configuracoes_gerais (auth.uid() é null no cron).
-- --------------------------------------------------------------------
create or replace function app.aplicar_meta_programada()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_meta public.metas_programadas%rowtype;
begin
  select * into v_meta from public.metas_programadas where dia = v_hoje;
  if not found then
    return;  -- sem programação: a meta global de ontem continua como estava
  end if;
  update public.configuracoes_gerais
     set meta_horaria_global = v_meta.valor,
         atualizado_em = now()
   where id = 1;
end;
$$;

revoke all on function app.aplicar_meta_programada() from public, anon, authenticated;

-- Exige a extensão pg_cron (Dashboard > Database > Extensions).
-- 03:05 UTC = 00:05 em São Paulo (sem horário de verão desde 2019).
-- select cron.schedule('aplicar-meta-programada', '5 3 * * *', $$select app.aplicar_meta_programada()$$);
