/**
 * Aplica o tema em <html data-theme>. O app abre claro por padrão (produto
 * corporativo); o Modo TV abre escuro. "system" segue o sistema operacional.
 */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useUiStore } from './ui-store';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeSystem(cb: () => void) {
  media?.addEventListener('change', cb);
  return () => media?.removeEventListener('change', cb);
}

export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystem, () => Boolean(media?.matches), () => false);
}

/** Tema efetivo da tela atual ('light' | 'dark'). */
export function useResolvedTheme(): 'light' | 'dark' {
  const { pathname } = useLocation();
  const theme = useUiStore((s) => s.theme);
  const tvTheme = useUiStore((s) => s.tvTheme);
  const systemDark = useSystemPrefersDark();
  if (pathname.startsWith('/tv')) return tvTheme;
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/** Montado uma vez dentro do router. */
export function ThemeSync() {
  const resolved = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    meta?.setAttribute('content', resolved === 'dark' ? '#0e1213' : '#f3f5f5');
  }, [resolved]);
  return null;
}
