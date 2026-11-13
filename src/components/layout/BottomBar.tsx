import { Bell, LogOut, Menu, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { navItemFor } from '@/app/nav';
import { useAuth } from '@/auth';
import { Sheet, SheetContent } from '@/components/ui';
import { useUnreadCount } from '@/features/notifications';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './TopBar';
import { useVisibleNav } from './nav-filter';

const tab =
  'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-2xs text-ink-2 focus-visible:shadow-focus aria-[current=page]:font-semibold aria-[current=page]:text-accent';

/** Barra inferior fixa do celular (< 768px) + folha "Mais" com o menu completo. */
export function BottomBar() {
  const { pathname } = useLocation();
  const groups = useVisibleNav();
  const unread = useUnreadCount();
  const { signOut } = useAuth();
  const [more, setMore] = useState(false);
  const active = navItemFor(pathname)?.id;
  const tabs = groups.flatMap((g) => g.items).filter((i) => i.mobileTab);

  return (
    <>
      <nav data-app-chrome
        aria-label="Navegação rápida"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
      >
        {tabs.map((i) => (
          <Link key={i.id} to={i.to} aria-current={active === i.id ? 'page' : undefined} className={tab}>
            <i.icon className="size-5" aria-hidden="true" />
            <span>{i.label}</span>
          </Link>
        ))}
        <Link to="/notificacoes" aria-current={pathname.startsWith('/notificacoes') ? 'page' : undefined} className={tab}>
          <span className="relative">
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-accent-fill px-1 text-2xs font-semibold text-on-accent tabular">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> não lidas</span>
              </span>
            ) : null}
          </span>
          <span>Alertas</span>
        </Link>
        <button type="button" onClick={() => setMore(true)} className={cn(tab)} aria-haspopup="dialog">
          <Menu className="size-5" aria-hidden="true" />
          <span>Mais</span>
        </button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="Menu">
          <nav aria-label="Menu completo" className="grid gap-4">
            {groups.map((g) => (
              <div key={g.id} className="grid gap-0.5">
                {g.label ? <p className="px-2 pb-1 text-xs text-ink-3">{g.label}</p> : null}
                {g.items.map((i) => (
                  <Link
                    key={i.id}
                    to={i.to}
                    onClick={() => setMore(false)}
                    aria-current={active === i.id ? 'page' : undefined}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 text-base text-ink hover:bg-hover focus-visible:shadow-focus aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
                  >
                    <i.icon className="size-4 shrink-0" aria-hidden="true" />
                    {i.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="grid gap-0.5 border-t border-line pt-3">
              <Link
                to="/configuracoes"
                onClick={() => setMore(false)}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 text-base text-ink hover:bg-hover focus-visible:shadow-focus"
              >
                <Settings className="size-4" aria-hidden="true" />
                Configurações
              </Link>
              <div className="flex items-center justify-between px-2">
                <span className="text-base">Tema</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  void signOut();
                }}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 text-left text-base text-ink hover:bg-hover focus-visible:shadow-focus"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sair
              </button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
