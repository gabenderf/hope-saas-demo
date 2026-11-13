import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { CommandPalette } from '@/components/command/CommandPalette';
import { GlobalShortcuts } from '@/components/command/GlobalShortcuts';
import { ShortcutsDialog } from '@/components/command/ShortcutsDialog';
import { useLiveSync } from '@/data/hooks';
import { NotificationsRuntime } from '@/features/notifications';
import { BottomBar } from './BottomBar';
import { SideNav } from './SideNav';
import { StatusStrips } from './StatusStrips';
import { TopBar } from './TopBar';
import { pageTitle } from './page-title';

export function AppShell() {
  const { pathname } = useLocation();
  useLiveSync();

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#conteudo"
        className="fixed left-3 top-3 z-[70] -translate-y-24 rounded-md bg-surface px-3 py-2 font-medium text-ink shadow-popover focus:translate-y-0 focus-visible:shadow-focus"
      >
        Pular para o conteúdo
      </a>
      <TopBar />
      <div className="flex">
        <SideNav />
        <div className="min-w-0 flex-1">
          <StatusStrips />
          <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-[1360px] px-4 pb-[calc(76px+env(safe-area-inset-bottom))] pt-4 outline-none md:px-6 md:pb-8 md:pt-5">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomBar />
      <CommandPalette />
      <ShortcutsDialog />
      <GlobalShortcuts />
      <NotificationsRuntime />
      <ScrollRestoration getKey={scrollKey} />
    </div>
  );
}

/**
 * Navegação dentro do app usa a chave da entrada do histórico (padrão do
 * react-router: voltar restaura, link novo começa do topo). Numa recarga
 * completa toda entrada tem a chave 'default', e uma tela herdaria a rolagem
 * da outra; ali a chave passa a ser o caminho.
 */
function scrollKey(location: { key: string; pathname: string }): string {
  return location.key === 'default' ? location.pathname : location.key;
}
