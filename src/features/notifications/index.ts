/**
 * API PÚBLICA de notificações. Outras features importam SÓ deste arquivo.
 * O sino, o banner e as preferências são o que o shell e o Modo TV montam;
 * `notify` pode ser chamado de qualquer lugar, inclusive fora de componente.
 */
export { CriticalAlertBanner } from './CriticalAlertBanner';
export { NotificationBell } from './NotificationBell';
export { NotificationPreferences } from './NotificationPreferences';
export { NotificationsRuntime } from './NotificationsRuntime';
export { notify, resolveNotifications } from './notify';
export { useCriticalAlerts, useTvSoundEnabled, useUnreadCount } from './hooks';
export type { AppNotification, NotifyInput, Severity } from './types';
