-- ====================================================================
-- 0009 · Login de pessoa passa de 12 h para 15 dias
--
-- Decisão do dono em 11/11/2026: entrar com senha + TOTP todo dia cansava.
-- O teto no banco vira 15 dias. O limite curto (12 h e 30 min sem uso) passa
-- a valer só no computador marcado como compartilhado na tela de login, e é
-- regra do cliente (src/auth/session-policy.ts). O resto de
-- app.tem_permissao é IDÊNTICO à 0001: só muda o intervalo. Desativar
-- alguém continua valendo na próxima consulta (a função relê `membros`).
--
-- ⚠️ TRANSIÇÃO (achado da revisão final de 11/11/2026): sessão de pessoa
-- aberta com a regra antiga e fechada sem "Sair" voltaria a valer por 15 dias,
-- inclusive num PC compartilhado. Por isso o fim do arquivo encerra as sessões
-- de pessoa com mais de 12 h, o que a regra antiga já negava. Aplicar ANTES de
-- publicar o front novo.
--
-- ROLLBACK: rodar de novo o bloco da app.tem_permissao da 0001.
-- ====================================================================

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

  -- Pessoa: sessão vale no máximo 15 dias desde o login, mesmo com atividade (era 12 h até a
  -- 0009). O time-box do Supabase é global e derrubaria TV e bancada, por isso fica aqui.
  -- O computador compartilhado (12 h, 30 min sem uso) é regra do cliente:
  -- src/auth/session-policy.ts.
  if v_tipo = 'pessoa' and not exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.created_at > now() - interval '15 days'
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

-- Transição: o que a regra antiga já negava continua negado (refresh tokens saem em cascata).
delete from auth.sessions s
using public.membros m
where m.user_id = s.user_id
  and m.tipo = 'pessoa'
  and s.created_at < now() - interval '12 hours';
