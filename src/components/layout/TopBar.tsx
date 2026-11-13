import { Moon, Search, Sun, Tv } from 'lucide-react';
import { Link } from 'react-router';
import { useResolvedTheme } from '@/app/theme';
import { useUiStore } from '@/app/ui-store';
import { useCan } from '@/auth';
import { Logo } from '@/components/brand/Logo';
import { openPalette } from '@/components/command/palette-store';
import { IconButton, Kbd, Tooltip } from '@/components/ui';
import { NotificationBell } from '@/features/notifications';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ModuleSwitcher, useCurrentModule } from './ModuleSwitcher';
import { UserMenu } from './UserMenu';

export function ThemeToggle() {
  const resolved = useResolvedTheme();
  const setTheme = useUiStore((s) => s.setTheme);
  const dark = resolved === 'dark';
  return (
    <Tooltip content={dark ? 'Tema claro' : 'Tema escuro'}>
      <IconButton aria-label={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
        {dark ? <Sun /> : <Moon />}
      </IconButton>
    </Tooltip>
  );
}

export function TopBar() {
  const canTv = useCan('tv.ver');
  const current = useCurrentModule();
  return (
    <header role="banner" data-app-chrome className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-line bg-surface px-3 pt-[env(safe-area-inset-top)] md:px-4">
      <Link to="/expedicao" aria-label="Hope, ir para a Visão Geral" className="rounded-sm focus-visible:shadow-focus">
        <Logo mark className="w-6 md:hidden" />
        <Logo className="hidden w-[84px] md:block" />
      </Link>
      <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line md:block" />
      <ModuleSwitcher className="hidden md:inline-flex" />
      <span className="truncate font-medium md:hidden">{current.label}</span>

      <button
        type="button"
        onClick={openPalette}
        className="ml-3 hidden h-8 w-full max-w-[380px] items-center gap-2 rounded-md border border-line-strong bg-sunk px-2.5 text-ink-3 hover:bg-hover focus-visible:shadow-focus md:flex"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Buscar ou executar um comando</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <ConnectionIndicator className="mr-1 md:mr-2" />
        <IconButton aria-label="Buscar ou executar um comando" onClick={openPalette} className="md:hidden">
          <Search />
        </IconButton>
        <NotificationBell />
        {canTv ? (
          <Tooltip content="Modo TV">
            <IconButton aria-label="Abrir o Modo TV" asChild className="hidden md:inline-flex">
              <Link to="/tv">
                <Tv />
              </Link>
            </IconButton>
          </Tooltip>
        ) : null}
        <span className="hidden md:inline-flex">
          <ThemeToggle />
        </span>
        <UserMenu />
      </div>
    </header>
  );
}
