/**
 * Login real: Supabase Auth (e-mail + senha) com verificação em duas etapas
 * (TOTP) e perfil vindo do JWT.
 *
 * O cliente do Supabase é carregado sob demanda (import dinâmico), então o
 * modo demo não baixa o SDK.
 *
 * Fluxo:
 *   signInWithPassword  sessão aal1
 *   resolve()           lê o perfil do JWT e decide: entra, pede código ou pede cadastro
 *   verifyMfa()         challenge + verify: sessão vira aal2 e resolve() roda de novo
 *
 * Cuidado conhecido do supabase-js: chamar outra função do auth DENTRO do
 * callback de onAuthStateChange trava (lock interno). Por isso o resolve()
 * roda num setTimeout(0).
 */
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { initials } from '@/lib/format';
import { createSnapshotStore, LOADING_SNAPSHOT, SIGNED_OUT_SNAPSHOT, type AuthAdapter, type AuthSnapshot } from './adapter';
import { decodeJwtPayload, parseHopeClaims, personSessionTooOld } from './claims';
import { browserStorage, readSharedComputer, sessionPolicy } from './session-policy';
import { loginErrorMessage, MSG, mfaErrorMessage, validateNewPassword } from './messages';
import { decideMfa, normalizeTotpCode, roleRequiresMfa } from './mfa';
import { RESET_PATH } from './redirect';
import type { MfaEnrollResult, SessionUser } from './types';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asError(e: unknown): AuthError | null {
  return e && typeof e === 'object' ? (e as AuthError) : null;
}

export function createSupabaseAdapter(): AuthAdapter {
  const store = createSnapshotStore(LOADING_SNAPSHOT);
  let client: SupabaseClient | null = null;
  let clientPromise: Promise<SupabaseClient> | null = null;
  let recovery = false;
  /** fator TOTP recém-criado, esperando o primeiro código para ficar verificado */
  let pendingFactorId: string | null = null;
  /** descarta resultado de resolve() antigo que termina depois de um mais novo */
  let resolveSeq = 0;

  function emit(next: Partial<AuthSnapshot> & Pick<AuthSnapshot, 'status'>) {
    store.set({ user: null, mfaStage: null, denied: null, ...next, isRecovery: recovery });
  }

  async function sb(): Promise<SupabaseClient> {
    if (client) return client;
    clientPromise ??= import('@/lib/supabase').then((m) => {
      client = m.getSupabase();
      client.auth.onAuthStateChange((event, session) => {
        // Evento sem nome é mensagem estranha no canal entre abas do supabase-js (ver
        // src/lib/storage-keys.ts), não uma mudança de sessão: tratá-lo como "sem
        // sessão" mandava a tela para o login com a sessão válida.
        if (!event) return;
        if (event === 'PASSWORD_RECOVERY') recovery = true;
        if (event === 'SIGNED_OUT') {
          recovery = false;
          pendingFactorId = null;
        }
        setTimeout(() => void resolve(session), 0);
      });
      return client;
    });
    return clientPromise;
  }

  async function hasVerifiedTotp(c: SupabaseClient, session: Session): Promise<boolean> {
    const { data, error } = await c.auth.mfa.listFactors();
    if (!error && data) return data.totp.length > 0;
    // Sem rede para listar: usa o que veio junto com a sessão.
    return (session.user.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
  }

  async function resolve(session: Session | null) {
    const seq = ++resolveSeq;
    if (!session) {
      store.set({ ...SIGNED_OUT_SNAPSHOT, isRecovery: false });
      return;
    }
    const email = session.user.email ?? null;
    const claims = decodeJwtPayload(session.access_token);
    const parsed = parseHopeClaims(claims);
    if (!parsed.ok) {
      if (seq === resolveSeq) emit({ status: 'signed-out', denied: { reason: parsed.reason, email } });
      return;
    }
    const p = parsed.profile;
    const c = await sb();
    // Limite absoluto para pessoa: 15 dias, ou 12 h no computador compartilhado (./session-policy).
    // O Supabase só tem time-box global, que derrubaria as TVs.
    const policy = sessionPolicy(readSharedComputer(browserStorage()));
    if (p.kind === 'pessoa' && personSessionTooOld(claims, Date.now(), policy.maxSessionMs)) {
      await c.auth.signOut({ scope: 'local' }).catch(() => undefined);
      if (seq === resolveSeq) store.set({ ...SIGNED_OUT_SNAPSHOT, endedReason: 'sessao-expirada' });
      return;
    }
    const verified = await hasVerifiedTotp(c, session);
    if (seq !== resolveSeq) return;

    const aal = typeof claims?.aal === 'string' ? claims.aal : null;
    const name = p.name ?? email ?? 'Usuário';
    const user: SessionUser = {
      id: session.user.id,
      name,
      email,
      initials: initials(name),
      role: p.role,
      modules: p.modules,
      moduleRoles: p.moduleRoles,
      kind: p.kind,
      mfa: { enrolled: verified, required: roleRequiresMfa(p.role, p.kind) },
    };
    const stage = decideMfa({ role: p.role, kind: p.kind, aal, hasVerifiedFactor: verified });
    if (stage === 'ok') emit({ status: 'signed-in', user });
    else emit({ status: 'mfa-required', user, mfaStage: stage });
  }

  // Liga o listener assim que o adaptador nasce: INITIAL_SESSION resolve o estado de partida.
  void sb().catch(() => emit({ status: 'signed-out' }));

  return {
    mode: 'supabase',
    getSnapshot: store.get,
    subscribe: store.subscribe,

    async signInWithPassword(email, password, captchaToken) {
      const e = normalizeEmail(email);
      if (!e || !password) return { ok: false, error: MSG.credentials };
      try {
        const c = await sb();
        const { error } = await c.auth.signInWithPassword({
          email: e,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        return error ? { ok: false, error: loginErrorMessage(error) } : { ok: true };
      } catch (err) {
        return { ok: false, error: loginErrorMessage(asError(err)) };
      }
    },

    async signInDemo() {
      return { ok: false, error: MSG.supabaseOnly };
    },

    async verifyMfa(raw) {
      const code = normalizeTotpCode(raw);
      if (!code) return { ok: false, error: MSG.mfaFormat };
      try {
        const c = await sb();
        let factorId: string | null;
        // Cadastro em andamento (no login ou em Configurações): o código é do fator novo.
        const enrolling = pendingFactorId !== null || store.get().mfaStage === 'enroll';
        if (enrolling) {
          factorId = pendingFactorId;
          if (!factorId) return { ok: false, error: MSG.mfaRestart };
        } else {
          const { data, error } = await c.auth.mfa.listFactors();
          if (error) return { ok: false, error: mfaErrorMessage(error) };
          factorId = data.totp[0]?.id ?? null;
          if (!factorId) return { ok: false, error: MSG.mfaRestart };
        }
        const challenge = await c.auth.mfa.challenge({ factorId });
        if (challenge.error) return { ok: false, error: mfaErrorMessage(challenge.error) };
        const verify = await c.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        if (verify.error) return { ok: false, error: mfaErrorMessage(verify.error) };
        pendingFactorId = null;
        if (enrolling) {
          // Trocar de autenticador: o celular antigo deixa de valer assim que o novo é confirmado.
          const listed = await c.auth.mfa.listFactors();
          for (const f of listed.data?.totp ?? []) {
            if (f.id !== factorId) await c.auth.mfa.unenroll({ factorId: f.id });
          }
          const { data } = await c.auth.getSession();
          await resolve(data.session);
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: mfaErrorMessage(asError(err)) };
      }
    },

    async enrollMfa(): Promise<MfaEnrollResult> {
      try {
        const c = await sb();
        // Cadastro abandonado deixa fator "unverified" pendurado; limpa antes de criar outro.
        const listed = await c.auth.mfa.listFactors();
        if (!listed.error) {
          for (const f of listed.data.all) {
            if (f.factor_type === 'totp' && f.status === 'unverified') await c.auth.mfa.unenroll({ factorId: f.id });
          }
        }
        const { data, error } = await c.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'Hope',
          friendlyName: `Hope ${new Date().toISOString().slice(0, 16)}`,
        });
        if (error) return { ok: false, error: mfaErrorMessage(error) };
        pendingFactorId = data.id;
        return {
          ok: true,
          enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri },
        };
      } catch (err) {
        return { ok: false, error: mfaErrorMessage(asError(err)) };
      }
    },

    async requestPasswordReset(email, captchaToken) {
      const e = normalizeEmail(email);
      if (!e) return { ok: false, error: MSG.generic };
      try {
        const c = await sb();
        const { error } = await c.auth.resetPasswordForEmail(e, {
          redirectTo: `${window.location.origin}${RESET_PATH}`,
          captchaToken,
        });
        if (!error) return { ok: true };
        const msg = loginErrorMessage(error);
        // Qualquer outro erro responde como sucesso: não revela se o e-mail existe.
        return msg === MSG.credentials ? { ok: true } : { ok: false, error: msg };
      } catch (err) {
        return { ok: false, error: loginErrorMessage(asError(err)) };
      }
    },

    async updatePassword(newPassword) {
      const invalid = validateNewPassword(newPassword);
      if (invalid) return { ok: false, error: invalid };
      try {
        const c = await sb();
        const { error } = await c.auth.updateUser({ password: newPassword });
        if (error) {
          if (error.code === 'same_password') return { ok: false, error: MSG.samePassword };
          if (error.code === 'weak_password') return { ok: false, error: MSG.weakPassword };
          if (error.code === 'reauthentication_needed' || error.code === 'insufficient_aal') return { ok: false, error: MSG.reauth };
          return { ok: false, error: loginErrorMessage(error) === MSG.credentials ? MSG.generic : loginErrorMessage(error) };
        }
        recovery = false;
        const { data } = await c.auth.getSession();
        await resolve(data.session);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: loginErrorMessage(asError(err)) };
      }
    },

    /**
     * Convite: o e-mail traz um código de uso único (`token_hash`), não um link implícito. Link
     * implícito não serve aqui: o cliente usa PKCE e o supabase-js recusa ("Not a valid PKCE flow
     * url"), e o servidor não tem como fazer PKCE por quem foi convidado. Quem chega por convite
     * ainda não tem senha: a sessão entra em modo de recuperação, e a tela de senha nova vem antes
     * do resto (depois do MFA, para admin e liderança).
     */
    async acceptInvite(tokenHash) {
      const hash = tokenHash.trim();
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(hash)) return { ok: false, error: MSG.inviteInvalid };
      try {
        const c = await sb();
        recovery = true;
        const { data, error } = await c.auth.verifyOtp({ token_hash: hash, type: 'invite' });
        if (error || !data.session) {
          recovery = false;
          return { ok: false, error: MSG.inviteInvalid };
        }
        await resolve(data.session);
        return { ok: true };
      } catch {
        recovery = false;
        return { ok: false, error: MSG.inviteInvalid };
      }
    },

    async signOut(scope) {
      try {
        const c = await sb();
        if (scope === 'global') {
          const { error } = await c.auth.signOut({ scope: 'global' });
          if (error) {
            await c.auth.signOut({ scope: 'local' });
            return { ok: false, error: MSG.signOutEverywhere };
          }
          return { ok: true };
        }
        // 'tab': a outra aba já revogou a sessão no servidor; o erro aqui é esperado e ignorado.
        await c.auth.signOut({ scope: 'local' });
        return { ok: true };
      } catch {
        return { ok: true };
      } finally {
        pendingFactorId = null;
        // Garante a tela de login mesmo sem rede (o evento SIGNED_OUT pode não vir).
        store.set({ ...SIGNED_OUT_SNAPSHOT });
      }
    },
  };
}
