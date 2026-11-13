-- ====================================================================
-- RASCUNHO, NÃO EXECUTADO. Revisar antes de rodar no SQL Editor.
--
-- 0003 · Custom Access Token Hook
--
-- Coloca o perfil no JWT, em claims.app_metadata.hope, no formato que
-- src/auth/claims.ts lê:
--
--   { "v": 1, "tipo": "pessoa", "papel": "lideranca", "status": "ativo",
--     "nome": "Ana", "modulos": { "expedicao": "lideranca" },
--     "dispositivo_id": "..." }        <- só em dispositivo
--
-- O claim é para a TELA (montar menu, desligar botão). A autorização de
-- verdade é app.tem_permissao(), que relê `membros` a cada consulta: um
-- admin desativado perde o acesso a dados na próxima requisição, mesmo
-- com um JWT antigo ainda válido.
--
-- ATIVAR depois de rodar: Dashboard > Authentication > Hooks >
-- Customize Access Token (JWT) Claims > Postgres > app.custom_access_token_hook
--
-- ROLLBACK: desligar o hook no Dashboard (o login volta a funcionar, mas
-- toda conta cai em "sem perfil" no front, e as bancadas pareadas ficam
-- "desconectadas" em até 10 min: a extensão 1.2.0 confere o perfil no token
-- a cada renovação, ver ../../../upseller-extension/CLAUDE.md) e depois
--   drop function if exists app.custom_access_token_hook(jsonb);
-- ====================================================================

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid     uuid := (event ->> 'user_id')::uuid;
  v_claims  jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_meta    jsonb := coalesce(v_claims -> 'app_metadata', '{}'::jsonb) - 'hope';
  v_membro  record;
  v_modulos jsonb;
  v_status  text;
  v_disp    uuid;
begin
  select m.nome, m.tipo, m.papel, m.status into v_membro
  from public.membros m
  where m.user_id = v_uid;

  if not found then
    -- Conta sem perfil: sem claim hope. O front mostra "acesso negado".
    return jsonb_set(event, '{claims,app_metadata}', v_meta);
  end if;

  select coalesce(jsonb_object_agg(mm.modulo, app.menor_papel(mm.papel, v_membro.papel)), '{}'::jsonb)
    into v_modulos
  from public.membros_modulos mm
  where mm.user_id = v_uid;

  v_status := v_membro.status;

  if v_membro.tipo = 'dispositivo' then
    select d.id into v_disp
    from public.dispositivos d
    where d.user_id = v_uid and d.status = 'ativo' and d.expira_em > now();
    if v_disp is null then
      v_status := 'desativado';
    end if;
  end if;

  v_meta := v_meta || jsonb_build_object('hope', jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'tipo', v_membro.tipo,
    'papel', v_membro.papel,
    'status', v_status,
    'nome', v_membro.nome,
    'modulos', v_modulos,
    'dispositivo_id', v_disp
  )));

  return jsonb_set(event, '{claims,app_metadata}', v_meta);
end;
$$;

-- Só o serviço de Auth chama o hook.
grant usage on schema app to supabase_auth_admin;
grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function app.menor_papel(text, text) to supabase_auth_admin;
revoke execute on function app.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant select on public.membros, public.membros_modulos to supabase_auth_admin;

drop policy if exists membros_auth_admin on public.membros;
create policy membros_auth_admin on public.membros for select to supabase_auth_admin using (true);

drop policy if exists membros_modulos_auth_admin on public.membros_modulos;
create policy membros_modulos_auth_admin on public.membros_modulos for select to supabase_auth_admin using (true);

-- A policy equivalente em `dispositivos` está na 0006 (a tabela nasce lá).
-- Até a 0006 rodar, o hook falha em conta de dispositivo; rode as duas juntas.
