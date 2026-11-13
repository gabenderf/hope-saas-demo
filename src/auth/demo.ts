/**
 * Login de demonstração: escolhe um perfil de exemplo, sem senha.
 *
 * A sessão fica no sessionStorage (some ao fechar a aba) e tem exatamente a
 * mesma forma de SessionUser do login real, para as telas não terem dois
 * caminhos. Em build de produção o env.ts recusa subir com este modo.
 */
import { initials } from '@/lib/format';
import { createSnapshotStore, SIGNED_OUT_SNAPSHOT, type AuthAdapter, type AuthSnapshot } from './adapter';
import { MSG } from './messages';
import { roleRequiresMfa } from './mfa';
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role, type SessionUser } from './types';

const STORAGE_KEY = 'hope.demo.sessao';

export interface DemoProfile {
  role: Role;
  name: string;
  label: string;
  description: string;
}

/** Perfis oferecidos na tela de login demo, na ordem de exibição. */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  { role: 'admin', name: 'Gabriel', label: ROLE_LABEL.admin, description: ROLE_DESCRIPTION.admin },
  { role: 'lideranca', name: 'Liderança Expedição', label: ROLE_LABEL.lideranca, description: ROLE_DESCRIPTION.lideranca },
  { role: 'leitura', name: 'Consulta', label: ROLE_LABEL.leitura, description: ROLE_DESCRIPTION.leitura },
  { role: 'tv', name: 'TV do galpão', label: ROLE_LABEL.tv, description: ROLE_DESCRIPTION.tv },
];

export function demoUser(role: Role): SessionUser {
  const profile = DEMO_PROFILES.find((p) => p.role === role) ?? DEMO_PROFILES[0]!;
  const kind: SessionUser['kind'] = role === 'tv' ? 'dispositivo' : 'pessoa';
  const required = roleRequiresMfa(role, kind);
  return {
    id: `demo-${role}`,
    name: profile.name,
    email: kind === 'pessoa' ? `${role}@demo.hope.invalid` : null,
    initials: initials(profile.name),
    role,
    modules: ['expedicao'],
    kind,
    // No demo não há código para digitar; o formato espelha uma conta já cadastrada.
    mfa: { enrolled: required, required },
  };
}

function signedIn(role: Role): AuthSnapshot {
  return { status: 'signed-in', user: demoUser(role), mfaStage: null, denied: null, isRecovery: false };
}

function isRole(v: unknown): v is Role {
  return v === 'admin' || v === 'lideranca' || v === 'leitura' || v === 'tv';
}

function readStored(): Role | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const role = parsed && typeof parsed === 'object' ? (parsed as { role?: unknown }).role : null;
    return isRole(role) ? role : null;
  } catch {
    return null;
  }
}

function writeStored(role: Role | null) {
  try {
    if (role) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sem storage: a sessão vale só enquanto a página estiver aberta */
  }
}

export function createDemoAdapter(): AuthAdapter {
  const stored = readStored();
  const store = createSnapshotStore(stored ? signedIn(stored) : SIGNED_OUT_SNAPSHOT);

  return {
    mode: 'demo',
    getSnapshot: store.get,
    subscribe: store.subscribe,
    async signInWithPassword() {
      return { ok: false, error: MSG.demoOnly };
    },
    async signInDemo(role) {
      if (!isRole(role)) return { ok: false, error: MSG.generic };
      writeStored(role);
      store.set(signedIn(role));
      return { ok: true };
    },
    async verifyMfa() {
      return { ok: true };
    },
    async enrollMfa() {
      return { ok: false, error: MSG.supabaseOnly };
    },
    async requestPasswordReset() {
      return { ok: false, error: MSG.supabaseOnly };
    },
    async updatePassword() {
      return { ok: false, error: MSG.supabaseOnly };
    },
    async signOut() {
      writeStored(null);
      store.set(SIGNED_OUT_SNAPSHOT);
      return { ok: true };
    },
  };
}
