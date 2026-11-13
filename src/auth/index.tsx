/**
 * Autenticação e permissão do painel.
 *
 * Exports (contrato): AuthProvider, useAuth, can, useCan, RequireAuth,
 * RequirePermission e tudo de ./types.
 *
 * O login vem de um adaptador escolhido por env.authMode:
 *   demo      escolhe um perfil de exemplo, sem senha (./demo.ts)
 *   supabase  Supabase Auth + TOTP, perfil no JWT (./supabase-adapter.ts)
 *
 * O AuthProvider fica DENTRO do router (usa useLocation no RequireAuth).
 * Também cuida de: encerramento por inatividade (só no computador
 * compartilhado: 30 min, aviso 60 s antes; dispositivo TV isento) e saída
 * sincronizada entre abas. Duração do login: ./session-policy.ts.
 *
 * Regras de segurança em docs/seguranca.md. Lembrete: isto só desenha a
 * tela. Quem barra de verdade é o RLS do banco.
 */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router';
import { clearSessionQueries } from '@/app/query';
import { BootScreen } from '@/app/screens';
import { env } from '@/lib/env';
import type { AuthAdapter } from './adapter';
import { openAuthChannel, type AuthChannel } from './channel';
import { createDemoAdapter } from './demo';
import { createIdleTimer, readLastActivity, writeLastActivity, type IdleTimer } from './idle';
import { can } from './permissions';
import { LOGIN_PATH, MFA_PATH, loginRedirect } from './redirect';
import { AccessDeniedScreen, IdleWarning } from './screens';
import { browserStorage, readSharedComputer, SHARED_COMPUTER_KEY, sessionPolicy, writeSharedComputer } from './session-policy';
import { createSupabaseAdapter } from './supabase-adapter';
import type { AuthContextValue, IdleState, Permission, SignOutReason } from './types';

export * from './types';
export { can };

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_IDLE: IdleState = Object.freeze({ warning: false, secondsLeft: 0 });
/** interação conta no máximo uma vez a cada 5 s (mover o mouse dispara centenas) */
const ACTIVITY_THROTTLE_MS = 5000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createAdapter(): AuthAdapter {
  return env.authMode === 'supabase' ? createSupabaseAdapter() : createDemoAdapter();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(createAdapter);
  const snap = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const [idleState, setIdleState] = useState<IdleState>(NOT_IDLE);
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason | null>(null);
  const [sharedComputer, setSharedComputerState] = useState(() => readSharedComputer(browserStorage()));
  const policy = sessionPolicy(sharedComputer);
  const timerRef = useRef<IdleTimer | null>(null);
  const channelRef = useRef<AuthChannel | null>(null);

  const endSession = useCallback(
    async (reason: SignOutReason, scope: 'local' | 'global' | 'tab' = 'local') => {
      timerRef.current?.stop();
      setIdleState(NOT_IDLE);
      setLastSignOutReason(reason);
      if (scope !== 'tab') channelRef.current?.post({ type: 'signout', reason });
      return adapter.signOut(scope);
    },
    [adapter],
  );

  /* ---------- fim de sessão: o próximo perfil nesta aba não herda dado nenhum ---------- */
  // Vale para todo motivo (manual, inatividade, outra aba, todos os dispositivos,
  // sessão expirada) porque olha o estado, não quem chamou a saída. Roda depois
  // do commit: o RequireAuth já desmontou a fonte de dados e as telas.
  const sessionKey = snap.status === 'signed-in' && snap.user ? snap.user.id : null;
  const previousSessionKey = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousSessionKey.current;
    previousSessionKey.current = sessionKey;
    if (previous !== null && previous !== sessionKey) clearSessionQueries();
  }, [sessionKey]);

  /* ---------- conversa entre abas ---------- */
  useEffect(() => {
    const channel = openAuthChannel((message) => {
      if (message.type === 'signout') {
        void endSession(message.reason === 'manual' ? 'outra-aba' : message.reason, 'tab');
      } else if (message.type === 'activity') {
        timerRef.current?.activity(message.at);
      }
    });
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [endSession]);

  /* ---------- inatividade (só pessoa logada, só no computador compartilhado) ---------- */
  const idleTimeoutMs = policy.idleTimeoutMs;
  const watchIdle = snap.status === 'signed-in' && snap.user?.kind === 'pessoa' && idleTimeoutMs !== null;
  useEffect(() => {
    if (!watchIdle || idleTimeoutMs === null) return;
    const storage = localStore();
    const timer = createIdleTimer({
      timeoutMs: idleTimeoutMs,
      onChange: setIdleState,
      onTimeout: () => void endSession('inatividade'),
      persist: (at) => writeLastActivity(storage, at),
    });
    timerRef.current = timer;
    // Retoma do horário salvo: navegador reaberto depois do limite sai na hora.
    timer.start(readLastActivity(storage) ?? Date.now());

    let lastHandled = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastHandled < ACTIVITY_THROTTLE_MS) return;
      lastHandled = now;
      timer.activity(now);
      channelRef.current?.post({ type: 'activity', at: now });
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      timer.stop();
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [watchIdle, idleTimeoutMs, endSession]);

  /** escolhido na tela de login; vale para este navegador (./session-policy.ts) */
  const setSharedComputer = useCallback((shared: boolean) => {
    writeSharedComputer(browserStorage(), shared);
    setSharedComputerState(shared);
  }, []);

  // Outra aba mudou a escolha: esta aba passa a mostrar e aplicar o mesmo valor.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === SHARED_COMPUTER_KEY) setSharedComputerState(readSharedComputer(browserStorage()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** login novo começa a contar a inatividade do zero (não herda o horário da sessão anterior) */
  const markFreshSession = useCallback(() => {
    writeLastActivity(localStore(), Date.now());
    setLastSignOutReason(null);
  }, []);

  const stayActive = useCallback(() => {
    const now = Date.now();
    timerRef.current?.activity(now);
    channelRef.current?.post({ type: 'activity', at: now });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: snap.status,
      user: snap.user,
      mode: adapter.mode,
      mfaStage: snap.mfaStage,
      denied: snap.denied,
      isRecovery: snap.isRecovery,
      idle: watchIdle ? idleState : NOT_IDLE,
      lastSignOutReason: lastSignOutReason ?? snap.endedReason ?? null,
      signInWithPassword: async (email: string, password: string, captchaToken?: string) => {
        // grava o que a tela mostra: o adaptador lê do storage ao montar a sessão
        writeSharedComputer(browserStorage(), sharedComputer);
        markFreshSession();
        return adapter.signInWithPassword(email, password, captchaToken);
      },
      signInDemo: async (role) => {
        markFreshSession();
        return adapter.signInDemo(role);
      },
      verifyMfa: async (code) => {
        const result = await adapter.verifyMfa(code);
        if (result.ok) markFreshSession();
        return result;
      },
      enrollMfa: () => adapter.enrollMfa(),
      requestPasswordReset: (email: string, captchaToken?: string) => adapter.requestPasswordReset(email, captchaToken),
      updatePassword: (password) => adapter.updatePassword(password),
      acceptInvite: adapter.acceptInvite
        ? async (tokenHash: string) => {
            markFreshSession();
            return adapter.acceptInvite!(tokenHash);
          }
        : undefined,
      signOut: async () => {
        await endSession('manual');
      },
      signOutEverywhere: () => endSession('todos-dispositivos', 'global'),
      stayActive,
      sharedComputer,
      setSharedComputer,
    }),
    [snap, adapter, watchIdle, idleState, lastSignOutReason, markFreshSession, endSession, stayActive, sharedComputer, setSharedComputer],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {watchIdle ? (
        <IdleWarning idle={idleState} onStay={stayActive} onSignOut={() => void endSession('manual')} />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

/** Só responde "sim" com sessão completa (MFA feito). Durante a verificação, tudo é "não". */
export function useCan(permission: Permission): boolean {
  const { status, user } = useAuth();
  return status === 'signed-in' && can(user, permission);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, denied, mode, signOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BootScreen />;
  if (denied) return <AccessDeniedScreen denial={denied} onSignOut={() => void signOut()} />;
  if (status === 'mfa-required') return <Navigate to={loginRedirect(location, MFA_PATH)} replace />;
  if (status !== 'signed-in') {
    // TV sem sessão vai para o pareamento (no demo, o perfil TV é escolhido no login).
    const isTv = location.pathname === '/tv' || location.pathname.startsWith('/tv/');
    if (isTv && mode === 'supabase') return <Navigate to="/tv/parear" replace />;
    return <Navigate to={loginRedirect(location, LOGIN_PATH)} replace />;
  }
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>;
}
