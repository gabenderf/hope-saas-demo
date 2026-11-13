import { useMemo } from 'react';
import { useNotificationStore } from './store';
import type { AppNotification } from './types';

export function useNotifications(): AppNotification[] {
  return useNotificationStore((s) => s.items);
}

export function useUnreadCount(): number {
  return useNotificationStore((s) => s.items.reduce((n, i) => n + (i.readAt ? 0 : 1), 0));
}

/** Críticos não resolvidos e não dispensados. */
export function useCriticalAlerts(): AppNotification[] {
  const items = useNotificationStore((s) => s.items);
  const dismissed = useNotificationStore((s) => s.dismissed);
  return useMemo(
    () => items.filter((i) => i.severity === 'critico' && !i.resolvedAt && !dismissed.includes(i.id)),
    [items, dismissed],
  );
}

/** O Modo TV lê isto para decidir se toca o aviso sonoro de crítico. */
export function useTvSoundEnabled(): boolean {
  return useNotificationStore((s) => s.globals.somNaTv);
}
