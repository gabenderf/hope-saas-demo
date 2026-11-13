import { BellOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card, EmptyState, PageHeader, SegmentedControl, Select, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { useUrlEnum } from '@/lib/url-state';
import { useNotifications } from './hooks';
import { NotificationItem } from './NotificationItem';
import { currentClock, goTo, markAllRead, markRead } from './notify';
import { RULES } from './rules';
import { useNotificationStore } from './store';
import type { AppNotification } from './types';

const SEVERITIES = ['todas', 'critico', 'atencao', 'info'] as const;
const RULE_IDS = ['todas', ...RULES.map((r) => r.id)] as const;
const READ = ['todas', 'nao-lidas'] as const;

export default function NotificationsPage() {
  const items = useNotifications();
  const [severity, setSeverity] = useUrlEnum('severidade', SEVERITIES, 'todas');
  const [rule, setRule] = useUrlEnum('regra', RULE_IDS, 'todas');
  const [read, setRead] = useUrlEnum('lidas', READ, 'todas');
  const now = currentClock();

  const filtered = items.filter(
    (n) => (severity === 'todas' || n.severity === severity) && (rule === 'todas' || n.rule === rule) && (read === 'todas' || !n.readAt),
  );
  const unread = items.filter((n) => !n.readAt).length;

  const open = (n: AppNotification) => {
    markRead(n.id);
    if (n.href) goTo(n.href);
  };
  const clear = () => {
    const snapshot = useNotificationStore.getState().items;
    useNotificationStore.getState().clear();
    toast.undoable('Notificações removidas', () => useNotificationStore.getState().restore(snapshot));
  };

  return (
    <div className="mx-auto grid max-w-[760px] gap-4 p-4 sm:p-6">
      <PageHeader
        title="Notificações"
        meta={unread > 0 ? `${unread} não lidas` : undefined}
        actions={
          <>
            <Button size="sm" disabled={unread === 0} onClick={() => markAllRead()}>
              Marcar todas como lidas
            </Button>
            <Button size="sm" variant="danger" disabled={items.length === 0} onClick={clear}>
              Limpar
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/configuracoes/notificacoes">Preferências</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label="Severidade"
          value={severity}
          onValueChange={(v) => setSeverity(v as (typeof SEVERITIES)[number])}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'critico', label: 'Crítico' },
            { value: 'atencao', label: 'Atenção' },
            { value: 'info', label: 'Informação' },
          ]}
        />
        <Select
          aria-label="Regra"
          className="w-[240px]"
          value={rule}
          onValueChange={(v) => setRule(v as (typeof RULE_IDS)[number])}
          options={[{ value: 'todas', label: 'Todas as regras' }, ...RULES.map((r) => ({ value: r.id, label: r.label }))]}
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Switch checked={read === 'nao-lidas'} onCheckedChange={(c) => setRead(c ? 'nao-lidas' : 'todas')} />
          Só não lidas
        </label>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title={items.length === 0 ? 'Nenhuma notificação ainda' : 'Nada com esses filtros'}
            description={
              items.length === 0
                ? 'Os avisos aparecem aqui quando uma regra dispara, como bancada sem bipes ou perda de conexão. Escolha quais regras ficam ligadas nas preferências.'
                : 'Tire algum filtro para ver os outros avisos.'
            }
          />
        ) : (
          <ul className="p-1">
            {filtered.map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} now={now} onOpen={open} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
