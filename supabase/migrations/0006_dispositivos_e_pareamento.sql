-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0006 · Dispositivos (TV, bancada, coletor) e pareamento por código
--
-- Cada máquina vira uma conta própria no Supabase Auth (tipo
-- 'dispositivo'), com papel de máquina e validade. Fluxo completo em
-- docs/seguranca.md, seção "Pareamento de dispositivo":
--
--   1. A máquina chama a Edge Function `dispositivos` (acao=iniciar) e
--      recebe um CÓDIGO de 8 letras para mostrar e um SEGREDO de consulta
--      que só ela conhece (aqui fica só o hash).
--   2. Um admin, logado com MFA, digita o código em Configurações >
--      Dispositivos e chama public.aprovar_pareamento().
--   3. A máquina consulta (acao=consultar, com o segredo). Aprovado, a
--      Edge Function cria a conta no Auth, a linha em `membros` e em
--      `dispositivos`, e devolve UMA vez um token de login de uso único.
--   4. Revogar = public.revogar_dispositivo(): apaga as sessões no Auth e
--      app.tem_permissao() passa a negar na hora.
--
-- O código não é listável: o admin precisa LER na tela da máquina. Assim
-- ninguém aprova por engano um código pedido por uma máquina estranha.
--
-- ROLLBACK:
--   drop function if exists public.aprovar_pareamento(text, text, integer, text);   -- (p_codigo, p_nome, p_validade_dias, p_local)
--   drop function if exists public.revogar_dispositivo(uuid);
--   drop function if exists public.listar_dispositivos();
--   drop table if exists public.pareamentos;
--   drop table if exists public.dispositivos;   -- antes, revogar todos
-- ====================================================================

create table if not exists public.dispositivos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  tipo          text not null check (tipo in ('tv', 'bancada', 'coletor')),
  nome          text not null check (char_length(nome) between 1 and 60),
  -- onde fica: "Parede das bancadas", "Bancada 3" (na bancada, o nome que aparece em pedidos_separados.bancada)
  local         text check (local is null or char_length(local) <= 60),
  status        text not null default 'ativo' check (status in ('ativo', 'revogado')),
  expira_em     timestamptz not null,
  aprovado_por  uuid references auth.users (id) on delete set null,
  aprovado_em   timestamptz not null default now(),
  revogado_por  uuid references auth.users (id) on delete set null,
  revogado_em   timestamptz,
  criado_em     timestamptz not null default now()
);

create table if not exists public.pareamentos (
  id             uuid primary key default gen_random_uuid(),
  -- alfabeto sem 0/O, 1/I/L: lido de longe numa TV
  codigo         text not null unique check (codigo ~ '^[A-HJKMNP-Z2-9]{8}$'),
  segredo_hash   text not null,                    -- sha256 hex do segredo de consulta
  tipo           text not null check (tipo in ('tv', 'bancada', 'coletor')),
  status         text not null default 'aguardando'
                 check (status in ('aguardando', 'aprovado', 'recusado', 'consumido', 'expirado')),
  user_agent     text,
  ip             inet,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null default now() + interval '10 minutes',
  aprovado_por   uuid references auth.users (id) on delete set null,
  aprovado_em    timestamptz,
  nome           text check (nome is null or char_length(nome) between 1 and 60),
  local          text,
  validade_dias  integer check (validade_dias is null or validade_dias between 1 and 365),
  dispositivo_id uuid references public.dispositivos (id) on delete set null
);

create index if not exists idx_pareamentos_ip on public.pareamentos (ip, criado_em desc);

-- Ninguém do lado do navegador lê ou grava estas tabelas direto.
revoke all on public.dispositivos, public.pareamentos from anon, authenticated;
alter table public.dispositivos enable row level security;
alter table public.pareamentos enable row level security;
-- (sem policy para anon/authenticated = nega tudo.) O service_role ignora o RLS, mas desde
-- 30/10/2026 também precisa de GRANT: é com ele que a Edge Function `dispositivos` grava.
grant select, insert, update, delete on public.dispositivos, public.pareamentos to service_role;

-- O hook do JWT (0003) lê dispositivos.
grant select on public.dispositivos to supabase_auth_admin;
drop policy if exists dispositivos_auth_admin on public.dispositivos;
create policy dispositivos_auth_admin on public.dispositivos for select to supabase_auth_admin using (true);

drop trigger if exists trg_auditoria on public.dispositivos;
create trigger trg_auditoria after insert or update on public.dispositivos
  for each row execute function app.registrar_auditoria('id', 'dispositivo');

-- --------------------------------------------------------------------
-- Aprovar (admin com MFA). Devolve o id do pareamento.
-- --------------------------------------------------------------------
create or replace function public.aprovar_pareamento(
  p_codigo text,
  p_nome text,
  p_validade_dias integer default 90,
  p_local text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id     uuid;
  v_tipo   text;
  v_max    integer;
begin
  if not app.tem_permissao('dispositivos.gerenciar') or not app.eh_pessoa_aal2() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  select p.id, p.tipo into v_id, v_tipo
  from public.pareamentos p
  where p.codigo = v_codigo and p.status = 'aguardando' and p.expira_em > now()
  for update;

  if v_id is null then
    -- mesma resposta para "não existe" e "expirou"
    raise exception 'Código inválido ou expirado.' using errcode = 'P0002';
  end if;

  -- TV fica no galpão, à vista: validade menor. Máquina de bancada e coletor, até 1 ano.
  v_max := case v_tipo when 'tv' then 180 else 365 end;

  update public.pareamentos
     set status = 'aprovado',
         aprovado_por = auth.uid(),
         aprovado_em = now(),
         nome = left(trim(p_nome), 60),
         local = left(trim(p_local), 60),
         validade_dias = least(greatest(coalesce(p_validade_dias, 90), 1), v_max),
         -- a máquina tem mais 5 min para buscar a credencial
         expira_em = now() + interval '5 minutes'
   where id = v_id;

  insert into public.auditoria (ator_id, ator_nome, ator_tipo, acao, tabela, operacao, alvo_tipo, alvo_id, depois)
  select auth.uid(), m.nome, 'pessoa', 'dispositivo.aprovar', 'pareamentos', 'UPDATE', 'dispositivo', v_id::text,
         jsonb_build_object('tipo', v_tipo, 'nome', p_nome)
  from public.membros m where m.user_id = auth.uid();

  return v_id;
end;
$$;

-- --------------------------------------------------------------------
-- Revogar: vale na hora para dado (tem_permissao confere status) e mata as
-- sessões no Auth (o refresh token deixa de funcionar).
-- --------------------------------------------------------------------
create or replace function public.revogar_dispositivo(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not app.tem_permissao('dispositivos.gerenciar') or not app.eh_pessoa_aal2() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  update public.dispositivos
     set status = 'revogado', revogado_por = auth.uid(), revogado_em = now()
   where id = p_id and status = 'ativo'
  returning user_id into v_user;

  if v_user is not null then
    update public.membros set status = 'desativado' where user_id = v_user;
    delete from auth.sessions where user_id = v_user;   -- refresh tokens saem em cascata
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- Lista para Configurações > Dispositivos (último uso vem de auth.sessions).
-- --------------------------------------------------------------------
create or replace function public.listar_dispositivos()
returns table (
  id uuid, tipo text, nome text, local text, status text,
  expira_em timestamptz, aprovado_por_nome text, aprovado_em timestamptz,
  revogado_em timestamptz, ultimo_uso_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tem_permissao('dispositivos.gerenciar') then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
  select d.id, d.tipo, d.nome, d.local, d.status, d.expira_em,
         (select m.nome from public.membros m where m.user_id = d.aprovado_por),
         d.aprovado_em, d.revogado_em,
         -- updated_at muda a cada refresh do token (a cada ~10 min com a TV ligada)
         (select max(s.updated_at) from auth.sessions s where s.user_id = d.user_id)
  from public.dispositivos d
  order by d.status, d.tipo, d.nome;
end;
$$;

revoke all on function public.aprovar_pareamento(text, text, integer, text), public.revogar_dispositivo(uuid),
  public.listar_dispositivos() from public, anon;
grant execute on function public.aprovar_pareamento(text, text, integer, text), public.revogar_dispositivo(uuid),
  public.listar_dispositivos() to authenticated;

-- Limpeza (pg_cron): pareamentos velhos não servem para nada.
--   select cron.schedule('pareamentos-limpeza', '0 * * * *',
--     $$delete from public.pareamentos where criado_em < now() - interval '1 day'$$);
-- Dispositivo vencido continua listado (status ativo, expira_em no passado) até alguém revogar
-- ou renovar; o acesso já para sozinho porque tem_permissao e o hook conferem expira_em.
