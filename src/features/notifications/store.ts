import { create } from 'zustand';
import type { AppNotification, GlobalPrefs, RulePref } from './types';

export const MAX_ITEMS = 200;
const PREFIX = 'hope-notificacoes:';

interface Persisted {
  items: AppNotification[];
  prefs: Record<string, RulePref>;
  globals: GlobalPrefs;
  /** dedupeKey -> até quando (ms) fica em silêncio */
  silence: Record<string, number>;
  dismissed: string[];
}

export interface NotificationState extends Persisted {
  userId: string;
  /** troca de usuário: lê o que estava salvo para ele */
  bindUser: (userId: string) => void;
  add: (n: AppNotification, silenceUntil: number, nowMs: number) => void;
  markRead: (id: string, at: string) => void;
  markAllRead: (at: string) => void;
  setPref: (rule: string, patch: Partial<RulePref>, base: RulePref) => void;
  setGlobals: (patch: Partial<GlobalPrefs>) => void;
  dismiss: (id: string) => void;
  resolve: (dedupeKey: string, at: string) => void;
  /** crítico de dia anterior deixa de aparecer no banner */
  expireBefore: (isoStartOfToday: string, at: string) => void;
  clear: () => void;
  restore: (items: AppNotification[]) => void;
}

const emptyData = (): Persisted => ({
  items: [],
  prefs: {},
  globals: { navegadorPermitido: true, somNaTv: false },
  silence: {},
  dismissed: [],
});

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load(userId: string): Persisted {
  const base = emptyData();
  try {
    const raw = storage()?.getItem(PREFIX + userId);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      items: Array.isArray(p.items) ? p.items.slice(0, MAX_ITEMS) : [],
      prefs: p.prefs && typeof p.prefs === 'object' ? p.prefs : {},
      globals: { ...base.globals, ...(p.globals ?? {}) },
      silence: p.silence && typeof p.silence === 'object' ? p.silence : {},
      dismissed: Array.isArray(p.dismissed) ? p.dismissed : [],
    };
  } catch {
    return base;
  }
}

function pruneSilence(map: Record<string, number>, nowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (v > nowMs) out[k] = v;
  return out;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  userId: 'anon',
  ...load('anon'),
  bindUser: (userId) => set({ userId, ...load(userId) }),
  add: (n, until, nowMs) =>
    set((s) => ({
      items: [n, ...s.items].slice(0, MAX_ITEMS),
      silence: { ...pruneSilence(s.silence, nowMs), [n.dedupeKey]: until },
    })),
  markRead: (id, at) => set((s) => ({ items: s.items.map((i) => (i.id === id && !i.readAt ? { ...i, readAt: at } : i)) })),
  markAllRead: (at) => set((s) => ({ items: s.items.map((i) => (i.readAt ? i : { ...i, readAt: at })) })),
  setPref: (rule, patch, base) => set((s) => ({ prefs: { ...s.prefs, [rule]: { ...base, ...s.prefs[rule], ...patch } } })),
  setGlobals: (patch) => set((s) => ({ globals: { ...s.globals, ...patch } })),
  dismiss: (id) => set((s) => ({ dismissed: [id, ...s.dismissed].slice(0, MAX_ITEMS) })),
  resolve: (key, at) =>
    set((s) => ({ items: s.items.map((i) => (i.dedupeKey === key && !i.resolvedAt ? { ...i, resolvedAt: at } : i)) })),
  expireBefore: (start, at) =>
    set((s) => {
      const stale = (i: AppNotification) => i.severity === 'critico' && !i.resolvedAt && i.createdAt < start;
      if (!s.items.some(stale)) return s;
      return { items: s.items.map((i) => (stale(i) ? { ...i, resolvedAt: at } : i)) };
    }),
  clear: () => set({ items: [], dismissed: [] }),
  restore: (items) => set({ items: items.slice(0, MAX_ITEMS) }),
}));

/** Salva o que muda, na chave do usuário atual. */
useNotificationStore.subscribe((s) => {
  try {
    const data: Persisted = { items: s.items, prefs: s.prefs, globals: s.globals, silence: s.silence, dismissed: s.dismissed };
    storage()?.setItem(PREFIX + s.userId, JSON.stringify(data));
  } catch {
    /* cota cheia ou armazenamento bloqueado: segue sem persistir */
  }
});
