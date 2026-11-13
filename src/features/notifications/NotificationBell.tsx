import { Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, EmptyState, IconButton, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { currentClock, goTo, markAllRead, markRead } from './notify';
import { useNotifications, useUnreadCount } from './hooks';
import { NotificationItem } from './NotificationItem';
import type { AppNotification } from './types';

const SHOWN = 8;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const items = useNotifications();
  const unread = useUnreadCount();
  const now = currentClock();

  const openItem = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    if (n.href) goTo(n.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : 'Notificações'} className="relative">
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-fill px-1 text-2xs font-semibold text-on-accent tabular"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-16px))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-md">Notificações</h2>
          <Button variant="ghost" size="sm" disabled={unread === 0} onClick={() => markAllRead()}>
            Marcar todas como lidas
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title="Nenhum aviso por enquanto"
            description="Avisos de bancada parada, conexão e metas aparecem aqui quando acontecem."
          />
        ) : (
          <ul className="max-h-[360px] overflow-y-auto p-1">
            {items.slice(0, SHOWN).map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} now={now} onOpen={openItem} />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line px-3 py-2">
          <Link
            to="/notificacoes"
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:shadow-focus"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
