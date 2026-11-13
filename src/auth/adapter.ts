/**
 * Contrato interno entre o AuthProvider e as duas implementações de login
 * (demo e Supabase). É uma "store externa" no formato do useSyncExternalStore.
 */
import type {
  AccessDenial,
  AuthResult,
  AuthStatus,
  MfaEnrollResult,
  MfaStage,
  Role,
  SessionUser,
  SignOutReason,
} from './types';

export interface AuthSnapshot {
  status: AuthStatus;
  user: SessionUser | null;
  mfaStage: MfaStage | null;
  denied: AccessDenial | null;
  isRecovery: boolean;
  /** a sessão terminou por regra do servidor ou do adaptador (ex.: passou de 15 dias, ou 12 h no computador compartilhado) */
  endedReason?: SignOutReason;
}

/**
 * local   encerra esta sessão (no Supabase, revoga o refresh token dela)
 * global  encerra em todos os aparelhos da pessoa
 * tab     outra aba já saiu: só limpa o estado desta
 */
export type SignOutScope = 'local' | 'global' | 'tab';

export interface AuthAdapter {
  readonly mode: 'demo' | 'supabase';
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
  signInWithPassword(email: string, password: string, captchaToken?: string): Promise<AuthResult>;
  signInDemo(role: Role): Promise<AuthResult>;
  verifyMfa(code: string): Promise<AuthResult>;
  enrollMfa(): Promise<MfaEnrollResult>;
  requestPasswordReset(email: string, captchaToken?: string): Promise<AuthResult>;
  updatePassword(newPassword: string): Promise<AuthResult>;
  /** Troca o código de uso único do e-mail de convite por sessão (só no login Supabase). */
  acceptInvite?(tokenHash: string): Promise<AuthResult>;
  signOut(scope: SignOutScope): Promise<AuthResult>;
}

export const LOADING_SNAPSHOT: AuthSnapshot = Object.freeze({
  status: 'loading',
  user: null,
  mfaStage: null,
  denied: null,
  isRecovery: false,
});

export const SIGNED_OUT_SNAPSHOT: AuthSnapshot = Object.freeze({
  status: 'signed-out',
  user: null,
  mfaStage: null,
  denied: null,
  isRecovery: false,
});

/** Pequena store observável usada pelos dois adaptadores. */
export function createSnapshotStore(initial: AuthSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set(next: AuthSnapshot) {
      snapshot = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
