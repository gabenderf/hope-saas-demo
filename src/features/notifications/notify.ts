/**
 * notify() funciona fora de componente: lê o store direto. O relógio e a
 * navegação são injetados pelo NotificationsRuntime; sem eles, vale o relógio
 * do sistema e a navegação recarrega a página.
 */
import { toast } from '@/components/ui/toast';
import { defaultPref } from './rules';
import { useNotificationStore } from './store';
import type { AppNotification, NotifyInput, RulePref } from './types';

let clock: () => Date = () => new Date();
let navigateTo: (href: string) => void = (href) => window.location.assign(href);

export function setNotificationClock(fn: () => Date) {
  clock = fn;
}
export function setNotificationNavigator(fn: (href: string) => void) {
  navigateTo = fn;
}
export const currentClock = (): Date => clock();
export const goTo = (href: string) => navigateTo(href);

export function prefOf(rule: string, severity: NotifyInput['severity'], prefs: Record<string, RulePref>): RulePref {
  return { ...defaultPref(rule, severity), ...prefs[rule] };
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function browserNotificationsAvailable(): boolean {
  return typeof Notification !== 'undefined';
}

/** Só com a aba escondida e permissão concedida. */
function showBrowserNotification(n: AppNotification) {
  if (!browserNotificationsAvailable() || Notification.permission !== 'granted') return;
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
  try {
    const instance = new Notification(n.title, { body: n.body, tag: n.dedupeKey });
    instance.onclick = () => {
      window.focus();
      if (n.href) navigateTo(n.href);
      instance.close();
    };
  } catch {
    /* alguns navegadores móveis só aceitam via service worker */
  }
}

/** Devolve a notificação gravada, ou null se foi descartada. */
export function notify(input: NotifyInput): AppNotification | null {
  const state = useNotificationStore.getState();
  const pref = prefOf(input.rule, input.severity, state.prefs);
  if (!pref.ativa) return null;

  const now = clock();
  const nowMs = now.getTime();
  if ((state.silence[input.dedupeKey] ?? 0) > nowMs) return null;

  const n: AppNotification = { ...input, id: newId(), createdAt: now.toISOString(), readAt: null, resolvedAt: null };
  state.add(n, nowMs + (input.cooldownMin ?? 30) * 60_000, nowMs);

  if (input.severity !== 'info' && pref.toast) {
    toast(input.body ? `${input.title}. ${input.body}` : input.title);
  }
  if (pref.navegador && state.globals.navegadorPermitido) showBrowserNotification(n);
  return n;
}

export function resolveNotifications(dedupeKey: string) {
  useNotificationStore.getState().resolve(dedupeKey, clock().toISOString());
}
export function markAllRead() {
  useNotificationStore.getState().markAllRead(clock().toISOString());
}
export function markRead(id: string) {
  useNotificationStore.getState().markRead(id, clock().toISOString());
}
