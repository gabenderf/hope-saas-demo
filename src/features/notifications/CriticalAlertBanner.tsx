import { X } from 'lucide-react';
import { Link } from 'react-router';
import { IconButton } from '@/components/ui';
import { useCriticalAlerts } from './hooks';
import { useNotificationStore } from './store';

/** Faixa no topo para crítico não resolvido. Vermelho aqui é falha de sistema. */
export function CriticalAlertBanner() {
  const alerts = useCriticalAlerts();
  const dismiss = useNotificationStore((s) => s.dismiss);
  if (alerts.length === 0) return null;
  return (
    <div className="grid gap-px" role="alert">
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center gap-3 bg-crit-soft px-4 py-2 text-sm text-ink">
          <p className="min-w-0 flex-1">
            <span className="font-semibold text-crit">{a.title}</span>
            {a.body && <span className="text-ink-2">{`. ${a.body}`}</span>}
            {a.href && (
              <>
                {' '}
                <Link to={a.href} className="font-medium underline underline-offset-4 focus-visible:shadow-focus">
                  Ver
                </Link>
              </>
            )}
          </p>
          <IconButton size="sm" aria-label={`Dispensar aviso: ${a.title}`} onClick={() => dismiss(a.id)}>
            <X />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
