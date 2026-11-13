import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { AppNotification, Severity } from './types';

const ICONS = { info: Info, atencao: AlertTriangle, critico: OctagonAlert } as const;
const TONE = { info: 'text-ink-2', atencao: 'text-warn', critico: 'text-crit' } as const;
const SEVERITY_LABEL: Record<Severity, string> = { info: 'Informação', atencao: 'Atenção', critico: 'Crítico' };

function SeverityIcon({ severity }: { severity: Severity }) {
  const Icon = ICONS[severity];
  return <Icon className={cn('mt-0.5 shrink-0', TONE[severity])} aria-label={SEVERITY_LABEL[severity]} role="img" />;
}

/** Linha clicável de uma notificação (sino e página). Não lida = negrito e fundo sutil. */
export function NotificationItem({
  n,
  now,
  onOpen,
}: {
  n: AppNotification;
  now: Date;
  onOpen: (n: AppNotification) => void;
}) {
  const unread = !n.readAt;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:shadow-focus',
        unread && 'bg-accent-soft/40',
      )}
    >
      <SeverityIcon severity={n.severity} />
      <span className="min-w-0 flex-1">
        <span className={cn('block', unread ? 'font-semibold text-ink' : 'text-ink-2')}>
          {n.title}
          {unread && <span className="sr-only"> (não lida)</span>}
        </span>
        {n.body && <span className="block truncate text-ink-3">{n.body}</span>}
      </span>
      <span className="shrink-0 text-xs text-ink-3 tabular">{formatRelative(n.createdAt, now)}</span>
    </button>
  );
}
