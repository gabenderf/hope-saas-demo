import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { navItemFor } from '@/app/nav';
import { useUiStore } from '@/app/ui-store';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useVisibleNav } from './nav-filter';

const linkBase =
  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-ink-2 hover:bg-hover hover:text-ink focus-visible:shadow-focus aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent';

export function SideNav() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const { pathname } = useLocation();
  const groups = useVisibleNav();
  const active = navItemFor(pathname)?.id;
  const onSettings = pathname.startsWith('/configuracoes');

  const wrap = (label: string, node: React.ReactElement) =>
    collapsed ? (
      <Tooltip content={label} side="right">
        {node}
      </Tooltip>
    ) : (
      node
    );

  return (
    <nav data-app-chrome
      aria-label="Menu principal"
      className={cn(
        'sticky top-[52px] hidden h-[calc(100dvh-52px)] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-2 md:flex',
        collapsed ? 'w-14' : 'w-[220px]',
      )}
    >
      {groups.map((g) => (
        <div key={g.id} className="grid gap-0.5">
          {g.label ? (
            collapsed ? (
              <hr className="mx-2 my-2 border-line" />
            ) : (
              <p className="px-2.5 pb-1 pt-4 text-xs text-ink-3">{g.label}</p>
            )
          ) : null}
          {g.items.map((i) =>
            wrap(
              i.label,
              <Link
                key={i.id}
                to={i.to}
                aria-current={active === i.id ? 'page' : undefined}
                aria-label={collapsed ? i.label : undefined}
                className={cn(linkBase, collapsed && 'justify-center px-0')}
              >
                <i.icon className="size-4 shrink-0" aria-hidden="true" />
                {collapsed ? null : <span className="truncate">{i.label}</span>}
              </Link>,
            ),
          )}
        </div>
      ))}
      <div className="mt-auto grid gap-0.5 border-t border-line pt-2">
        {wrap(
          'Configurações',
          <Link
            to="/configuracoes"
            aria-current={onSettings ? 'page' : undefined}
            aria-label={collapsed ? 'Configurações' : undefined}
            className={cn(linkBase, collapsed && 'justify-center px-0')}
          >
            <Settings className="size-4 shrink-0" aria-hidden="true" />
            {collapsed ? null : <span>Configurações</span>}
          </Link>,
        )}
        {wrap(
          collapsed ? 'Expandir menu' : 'Recolher menu',
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir o menu lateral' : 'Recolher o menu lateral'}
            aria-expanded={!collapsed}
            className={cn(linkBase, 'w-full', collapsed && 'justify-center px-0')}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
            {collapsed ? null : <span>Recolher menu</span>}
          </button>,
        )}
      </div>
    </nav>
  );
}
