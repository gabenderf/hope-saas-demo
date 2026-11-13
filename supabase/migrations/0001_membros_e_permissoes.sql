-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0001 · Membros, módulos e a função de permissão
--
-- Fonte da verdade de "quem pode o quê". O front tem a mesma matriz em
-- src/auth/types.ts (ROLE_PERMISSIONS); as duas precisam continuar iguais.
-- Se mudar uma, mude a outra no mesmo commit.
--
-- Idempotente: pode rodar de novo por cima.
--
-- ROLLBACK (só antes da fase 4 do docs/seguranca.md; depois disso as
-- policies dependem destas funções):
--   drop table if exists public.membros_modulos;
--   drop table if exists public.membros;
--   drop schema if exists app cascade;
-- ====================================================================

create schema if not exists app;
comment on schema app is 'Funções internas do Hope SaaS. NÃO expor no PostgREST (Settings > API > Exposed schemas).';

revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- --------------------------------------------------------------------
-- 1. membros: uma linha por conta do Supabase Auth que pode entrar.
--    Pessoa ou dispositivo (TV, bancada, coletor). Conta do Auth sem
--    linha aqui = "conta sem perfil": loga, mas não vê nada.
-- --------------------------------------------------------------------
create table if not exists public.membros (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  nome         text not null check (char_length(nome) between 1 and 120),
  tipo         text not null check (tipo in ('pessoa', 'dispositivo')),
  papel        text not null check (papel in ('admin', 'lideranca', 'leitura', 'tv', 'bancada', 'coletor')),
  status       text not null default 'ativo' check (status in ('ativo', 'desativado')),
  criado_em    timestamptz not null default now(),
  criado_por   uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  -- pessoa nunca recebe papel de máquina, máquina nunca recebe papel de pessoa
  constraint membros_papel_por_tipo check (
    (tipo = 'pessoa' and papel in ('admin', 'lideranca', 'leitura'))
    or (tipo = 'dispositivo' and papel in ('tv', 'bancada', 'coletor'))
  )
);

comment on table public.membros is
  'Quem pode entrar no Hope SaaS e com que papel geral. "Convidado" não é status: é a conta do Auth sem last_sign_in_at.';

-- --------------------------------------------------------------------
-- 2. membros_modulos: quais módulos a conta abre e, opcionalmente, com
--    papel menor que o geral naquele módulo (ex.: liderança na Expedição,
--    leitura na Conciliação). papel null = vale o papel geral.
-- --------------------------------------------------------------------
create table if not exists public.membros_modulos (
  user_id uuid not null references public.membros (user_id) on delete cascade,
  modulo  text not null check (modulo in ('expedicao', 'clientes', 'etiquetas', 'conciliacao')),
  papel   text check (papel in ('admin', 'lideranca', 'leitura', 'tv', 'bancada', 'coletor')),
  primary key (user_id, modulo)
);

-- Projeto antigo do Supabase dava GRANT ALL ao anon em tabela nova; o revoke cobre os dois casos.
revoke all on public.membros, public.membros_modulos from anon;
grant select on public.membros, public.membros_modulos to authenticated;
grant insert, update, delete on public.membros, public.membros_modulos to authenticated;
-- Desde 30/10/2026 tabela nova não ganha acesso sozinha, nem para o service_role. Ele ignora o
-- RLS, mas precisa de GRANT: as Edge Functions `usuarios` e `dispositivos` gravam aqui com a
-- secret key. Achado no projeto de teste em 06/11/2026: sem isto, convite e pareamento falhavam.
grant select, insert, update, delete on public.membros, public.membros_modulos to service_role;

-- --------------------------------------------------------------------
-- 3. Catálogo de permissões (espelho de src/auth/types.ts)
-- --------------------------------------------------------------------

-- Papel -> permissões. 'bancada.registrar' e 'coletor.registrar' só
-- existem aqui: são as credenciais de máquina, que nunca abrem o painel.
create or replace function app.papel_permissoes(p_papel text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_papel
    when 'admin' then array[
      'expedicao.ver', 'expedicao.exportar', 'expedicao.metas.editar',
      'expedicao.operadores.gerenciar', 'expedicao.previsao.configurar',
      'auditoria.ver', 'usuarios.gerenciar', 'dispositivos.gerenciar',
      'notificacoes.configurar', 'tv.ver']
    when 'lideranca' then array[
      'expedicao.ver', 'expedicao.exportar', 'expedicao.metas.editar',
      'expedicao.operadores.gerenciar', 'expedicao.previsao.configurar',
      'auditoria.ver', 'notificacoes.configurar', 'tv.ver']
    when 'leitura' then array[
      'expedicao.ver', 'expedicao.exportar', 'notificacoes.configurar', 'tv.ver']
    when 'tv' then array['tv.ver']
    when 'bancada' then array['bancada.registrar']
    when 'coletor' then array['coletor.registrar']
    else array[]::text[]
  end
$$;

-- Permissão -> módulo (espelho de PERMISSION_MODULE). null = permissão da conta.
create or replace function app.permissao_modulo(p_permissao text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_permissao like 'expedicao.%' then 'expedicao'
    when p_permissao = 'tv.ver' then 'expedicao'
    else null
  end
$$;

create or replace function app.papel_exige_mfa(p_papel text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_papel in ('admin', 'lideranca') $$;

-- Papel de módulo nunca passa do papel geral.
create or replace function app.menor_papel(p_modulo text, p_geral text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_modulo is null then p_geral
    when p_modulo = p_geral then p_geral
    when p_geral in ('tv', 'bancada', 'coletor') then p_geral
    when array_position(array['tv', 'leitura', 'lideranca', 'admin'], p_modulo)
       < array_position(array['tv', 'leitura', 'lideranca', 'admin'], p_geral) then p_modulo
    else p_geral
  end
$$;

-- --------------------------------------------------------------------
-- 4. Sessão ainda existe no servidor?
--
-- O JWT vale até expirar (10 min, ver docs). "Sair de todos os
-- dispositivos" e "revogar TV" apagam a linha em auth.sessions; com esta
-- checagem o acesso a DADOS acaba na hora, sem esperar o token expirar.
-- --------------------------------------------------------------------
create or replace function app.sessao_valida()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  )
$$;

-- --------------------------------------------------------------------
-- 5. A função usada em TODAS as policies.
--
-- Relê `membros` a cada consulta (não confia só no claim do JWT): desativar
-- alguém vale na próxima requisição. Nas policies, chame sempre como
-- `(select app.tem_permissao('...'))` para o Postgres avaliar uma vez por
-- consulta, não uma vez por linha.
-- --------------------------------------------------------------------
create or replace function app.tem_permissao(p_permissao text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_tipo   text;
  v_papel  text;
  v_status text;
  v_modulo text;
  v_papel_modulo text;
  v_aal    text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  if v_uid is null then
    return false;
  end if;

  if not app.sessao_valida() then
    return false;
  end if;

  select m.tipo, m.papel, m.status into v_tipo, v_papel, v_status
  from public.membros m
  where m.user_id = v_uid;

  if not found or v_status <> 'ativo' then
    return false;
  end if;

  -- Pessoa: sessão vale no máximo 12 h desde o login, mesmo com atividade.
  -- (O time-box do Supabase é global e derrubaria TV e bancada, por isso fica aqui.
  -- O front faz o mesmo pelo claim amr: src/auth/claims.ts.)
  if v_tipo = 'pessoa' and not exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.created_at > now() - interval '12 hours'
  ) then
    return false;
  end if;

  -- Dispositivo: precisa estar ativo e dentro da validade (tabela da 0006).
  if v_tipo = 'dispositivo' then
    if not exists (
      select 1 from public.dispositivos d
      where d.user_id = v_uid and d.status = 'ativo' and d.expira_em > now()
    ) then
      return false;
    end if;
  end if;

  -- MFA obrigatório: admin e liderança sem aal2 não leem nem gravam nada.
  if app.papel_exige_mfa(v_papel) and v_aal <> 'aal2' then
    return false;
  end if;

  v_modulo := app.permissao_modulo(p_permissao);
  if v_modulo is not null then
    select mm.papel into v_papel_modulo
    from public.membros_modulos mm
    where mm.user_id = v_uid and mm.modulo = v_modulo;
    if not found then
      return false;
    end if;
    v_papel := app.menor_papel(v_papel_modulo, v_papel);
  end if;

  return p_permissao = any (app.papel_permissoes(v_papel));
end;
$$;

-- Atalhos legíveis para as policies.
create or replace function app.eh_pessoa_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;

revoke all on function app.papel_permissoes(text), app.permissao_modulo(text), app.papel_exige_mfa(text),
  app.menor_papel(text, text), app.sessao_valida(), app.tem_permissao(text), app.eh_pessoa_aal2() from public, anon;
grant execute on function app.papel_permissoes(text), app.permissao_modulo(text), app.papel_exige_mfa(text),
  app.menor_papel(text, text), app.sessao_valida(), app.tem_permissao(text), app.eh_pessoa_aal2() to authenticated;

-- --------------------------------------------------------------------
-- 6. RLS de membros e membros_modulos
--
-- Todo mundo lê a PRÓPRIA linha (a tela de configurações mostra o perfil).
-- Só quem gerencia usuários lê e grava as outras. Ninguém altera a si
-- mesmo (um admin não se rebaixa nem se desativa sem querer, e uma conta
-- roubada não se promove).
-- --------------------------------------------------------------------
alter table public.membros enable row level security;
alter table public.membros_modulos enable row level security;

drop policy if exists membros_select on public.membros;
create policy membros_select on public.membros for select to authenticated
  using (user_id = (select auth.uid()) or (select app.tem_permissao('usuarios.gerenciar')));

drop policy if exists membros_insert on public.membros;
create policy membros_insert on public.membros for insert to authenticated
  with check ((select app.tem_permissao('usuarios.gerenciar')) and tipo = 'pessoa');

drop policy if exists membros_update on public.membros;
-- Só linha de PESSOA, antes e depois: pelo cliente ninguém transforma uma
-- pessoa em dispositivo (nem o contrário). Dispositivo é gerido só pela
-- Edge Function `dispositivos`, com service role (0006).
create policy membros_update on public.membros for update to authenticated
  using ((select app.tem_permissao('usuarios.gerenciar')) and user_id <> (select auth.uid()) and tipo = 'pessoa')
  with check ((select app.tem_permissao('usuarios.gerenciar')) and user_id <> (select auth.uid()) and tipo = 'pessoa');

-- Sem DELETE: desativar mantém o histórico de auditoria legível com nome.

drop policy if exists membros_modulos_select on public.membros_modulos;
create policy membros_modulos_select on public.membros_modulos for select to authenticated
  using (user_id = (select auth.uid()) or (select app.tem_permissao('usuarios.gerenciar')));

drop policy if exists membros_modulos_write on public.membros_modulos;
create policy membros_modulos_write on public.membros_modulos for all to authenticated
  using ((select app.tem_permissao('usuarios.gerenciar')) and user_id <> (select auth.uid()))
  with check ((select app.tem_permissao('usuarios.gerenciar')) and user_id <> (select auth.uid()));

-- Nunca existir zero admin ativo.
create or replace function app.garantir_um_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membros where papel = 'admin' and status = 'ativo' and tipo = 'pessoa'
  ) then
    raise exception 'Precisa existir pelo menos um administrador ativo.' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_membros_um_admin on public.membros;
create constraint trigger trg_membros_um_admin
  after update or delete on public.membros
  deferrable initially deferred
  for each row execute function app.garantir_um_admin();

create or replace function app.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_membros_atualizado_em on public.membros;
create trigger trg_membros_atualizado_em before update on public.membros
  for each row execute function app.tocar_atualizado_em();

-- --------------------------------------------------------------------
-- 7. Lista de usuários para a tela "Usuários" (lê auth.users, que o
--    authenticated não enxerga). Convite e troca de e-mail NÃO passam
--    por aqui: exigem a API de admin, na Edge Function `usuarios`.
-- --------------------------------------------------------------------
create or replace function public.listar_usuarios_painel()
returns table (
  user_id uuid,
  nome text,
  email text,
  papel text,
  status text,
  modulos jsonb,
  ultimo_acesso timestamptz,
  convite_pendente boolean,
  mfa_cadastrado boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tem_permissao('usuarios.gerenciar') then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
  select m.user_id, m.nome, u.email::text, m.papel, m.status,
         coalesce((select jsonb_object_agg(mm.modulo, coalesce(mm.papel, m.papel))
                   from public.membros_modulos mm where mm.user_id = m.user_id), '{}'::jsonb),
         u.last_sign_in_at,
         -- convite pendente = nunca confirmou E nunca entrou. Só "nunca entrou" marcava como
         -- convidada uma conta criada já confirmada (painel, createUser), com botão de reenviar que
         -- o Auth recusaria ("email exists").
         u.email_confirmed_at is null and u.last_sign_in_at is null,
         exists (select 1 from auth.mfa_factors f
                 where f.user_id = m.user_id and f.factor_type = 'totp' and f.status = 'verified')
  from public.membros m
  join auth.users u on u.id = m.user_id
  where m.tipo = 'pessoa'
  order by m.nome;
end;
$$;

revoke all on function public.listar_usuarios_painel() from public, anon;
grant execute on function public.listar_usuarios_painel() to authenticated;

-- --------------------------------------------------------------------
-- 8. "Eu tenho esta permissão?" para as Edge Functions.
--
-- A Edge Function `usuarios` chama com o JWT de quem pediu, antes de usar a
-- chave de serviço. O schema `app` não é exposto na API; esta é a porta
-- pública, só de leitura, e responde só sobre o próprio chamador (MFA,
-- sessão e status inclusos, porque é a mesma app.tem_permissao das policies).
-- --------------------------------------------------------------------
create or replace function public.tenho_permissao(p_permissao text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select app.tem_permissao(p_permissao) $$;

revoke all on function public.tenho_permissao(text) from public, anon;
grant execute on function public.tenho_permissao(text) to authenticated;
