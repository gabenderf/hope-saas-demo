-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0005 · Notificações e preferências
--
-- Espelha AppNotification / NotifyInput (src/features/notifications).
-- Cada pessoa só vê, marca como lida e apaga as PRÓPRIAS notificações.
-- Notificação para outra pessoa (ex.: alerta de "sem coleta de dados"
-- para toda a liderança) é criada no servidor (Edge Function ou pg_cron,
-- com service_role), nunca por um navegador escrevendo na caixa alheia.
--
-- ROLLBACK:
--   drop table if exists public.preferencias_notificacao;
--   drop table if exists public.notificacoes;
-- ====================================================================

create table if not exists public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  regra       text not null check (char_length(regra) between 1 and 60),
  severidade  text not null check (severidade in ('info', 'atencao', 'critico')),
  titulo      text not null check (char_length(titulo) between 1 and 140),
  corpo       text check (corpo is null or char_length(corpo) <= 500),
  -- só link interno: mesma regra do safeRedirectPath do front (uma barra, sem \)
  href        text check (href is null or (href ~ '^/[^/\\]' or href = '/') and href !~ '[\\[:cntrl:]]'),
  dedupe_key  text not null check (char_length(dedupe_key) between 1 and 120),
  criado_em   timestamptz not null default now(),
  lida_em     timestamptz
);

create index if not exists idx_notificacoes_user on public.notificacoes (user_id, criado_em desc);
create index if not exists idx_notificacoes_dedupe on public.notificacoes (user_id, dedupe_key, criado_em desc);

revoke all on public.notificacoes from anon, authenticated;
grant select, insert, delete on public.notificacoes to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;   -- só marcar como lida
-- Notificação para outra pessoa nasce no servidor, com service_role (ver o cabeçalho).
grant select, insert, update, delete on public.notificacoes to service_role;

alter table public.notificacoes enable row level security;

drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes for select to authenticated
  using (user_id = (select auth.uid()) and (select app.tem_permissao('notificacoes.configurar')));

drop policy if exists notificacoes_insert on public.notificacoes;
create policy notificacoes_insert on public.notificacoes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.tem_permissao('notificacoes.configurar')));

drop policy if exists notificacoes_update on public.notificacoes;
create policy notificacoes_update on public.notificacoes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notificacoes_delete on public.notificacoes;
create policy notificacoes_delete on public.notificacoes for delete to authenticated
  using (user_id = (select auth.uid()));

-- --------------------------------------------------------------------
create table if not exists public.preferencias_notificacao (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  regra        text not null check (char_length(regra) between 1 and 60),
  canal        text not null check (canal in ('app', 'email', 'push')),
  ativo        boolean not null default true,
  silencio_min integer not null default 30 check (silencio_min between 0 and 1440),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, regra, canal)
);

revoke all on public.preferencias_notificacao from anon;
grant select, insert, update, delete on public.preferencias_notificacao to authenticated;
grant select, insert, update, delete on public.preferencias_notificacao to service_role;

alter table public.preferencias_notificacao enable row level security;

drop policy if exists preferencias_proprias on public.preferencias_notificacao;
create policy preferencias_proprias on public.preferencias_notificacao for all to authenticated
  using (user_id = (select auth.uid()) and (select app.tem_permissao('notificacoes.configurar')))
  with check (user_id = (select auth.uid()) and (select app.tem_permissao('notificacoes.configurar')));

-- Retenção: 90 dias (pg_cron)
--   select cron.schedule('notificacoes-retencao', '15 7 * * *',
--     $$delete from public.notificacoes where criado_em < now() - interval '90 days'$$);
