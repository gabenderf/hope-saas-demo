import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, resolveSettings, type TvSettings } from './model';

const STORAGE_KEY = 'hope-tv';

function readStored(): Partial<Record<keyof TvSettings, unknown>> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<keyof TvSettings, unknown>>) : null;
  } catch {
    return null;
  }
}

/** Configuração do quiosque: URL primeiro, depois o salvo no aparelho. Mudanças vão para o aparelho. */
export function useTvSettings(search: string): [TvSettings, (next: TvSettings) => void] {
  const [settings, setSettings] = useState<TvSettings>(() => {
    try {
      return resolveSettings(new URLSearchParams(search), readStored());
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const save = useCallback((next: TvSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: segue só nesta sessão */
    }
  }, []);
  return [settings, save];
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/** Mantém a tela ligada; readquire ao voltar à aba. Sem suporte, segue sem erro. */
export function useWakeLock(): void {
  useEffect(() => {
    const api = (navigator as unknown as WakeLockNavigator).wakeLock;
    if (!api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const s = await api.request('screen');
        if (cancelled) void s.release().catch(() => undefined);
        else sentinel = s;
      } catch {
        /* negado ou bateria baixa: tenta de novo no próximo visibilitychange */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** Controles visíveis ao mexer o mouse ou apertar tecla; somem após `ms` parados. */
export function useAutoHide(ms: number, hold: boolean): { visible: boolean; show: () => void; hide: () => void } {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setVisible(false);
  }, []);
  const show = useCallback(() => {
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), ms);
  }, [ms]);

  useEffect(() => {
    const on = () => show();
    window.addEventListener('mousemove', on);
    window.addEventListener('keydown', on);
    window.addEventListener('touchstart', on, { passive: true });
    return () => {
      window.removeEventListener('mousemove', on);
      window.removeEventListener('keydown', on);
      window.removeEventListener('touchstart', on);
      window.clearTimeout(timer.current);
    };
  }, [show]);

  // enquanto um diálogo está aberto os controles ficam; ao fechar, a contagem recomeça
  useEffect(() => {
    if (hold) {
      window.clearTimeout(timer.current);
      return;
    }
    timer.current = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(timer.current);
  }, [hold, ms]);

  return { visible: visible || hold, show, hide };
}

export function useFullscreen(): { active: boolean; supported: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const on = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const supported = typeof document.documentElement.requestFullscreen === 'function';
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  return { active, supported, toggle };
}

/** Altura útil da janela, para o gráfico acompanhar a tela. */
export function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}
