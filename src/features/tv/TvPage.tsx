import { ChevronLeft, ChevronRight, LogOut, Maximize, Minimize, Pause, Play, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/auth';
import { useUiStore } from '@/app/ui-store';
import { Logo } from '@/components/brand/Logo';
import { IconButton, Notice, Button, Tooltip } from '@/components/ui';
import { useConnectionState, useLiveSync, useNow, useOverview } from '@/data/hooks';
import { useForecastSummary } from '@/features/forecast/public';
import { CriticalAlertBanner, NotificationsRuntime } from '@/features/notifications';
import { cn } from '@/lib/cn';
import { formatDayLong, formatTime } from '@/lib/format';
import { ForecastPanel, HourlyPanel, NowPanel, OperatorsPanel, PanelSkeleton } from './panels';
import { initialRotation, PANEL_LABEL, rotationReducer, visiblePanels, type PanelId } from './model';
import { TvSettingsDialog } from './TvSettingsDialog';
import { useAutoHide, useFullscreen, useTvSettings, useWakeLock } from './tv-hooks';
import { useCriticalChime } from './useCriticalChime';

const STALE_AFTER_MS = 2 * 60_000;
const OVERVIEW_PARAMS = { range: 'hoje', compare: 'dia-util-anterior' } as const;

export default function TvPage() {
  return (
    <>
      <NotificationsRuntime />
      <TvScreen />
    </>
  );
}

function TvScreen() {
  useLiveSync();
  useWakeLock();
  useCriticalChime();

  const { search } = useLocation();
  const { user } = useAuth();
  const canLeave = user?.kind === 'pessoa';
  const tvTheme = useUiStore((s) => s.tvTheme);
  const setTvTheme = useUiStore((s) => s.setTvTheme);

  const [settings, saveSettings] = useTvSettings(search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controls = useAutoHide(4000, settingsOpen);
  const fullscreen = useFullscreen();

  const now = useNow();
  const connection = useConnectionState();
  const overview = useOverview(OVERVIEW_PARAMS);
  const forecast = useForecastSummary();
  const model = overview.data;

  // so-equipe: o painel de operadores some
  const enabled = useMemo<PanelId[]>(
    () => (settings.privacy === 'so-equipe' ? settings.panels.filter((p) => p !== 'operadores') : settings.panels),
    [settings.panels, settings.privacy],
  );
  const hasForecast = forecast != null;
  const [rotation, dispatch] = useReducer(rotationReducer, undefined, () => initialRotation(enabled, hasForecast));

  useEffect(() => dispatch({ type: 'set-enabled', panels: enabled }), [enabled]);
  useEffect(() => dispatch({ type: 'set-forecast', available: hasForecast }), [hasForecast]);

  const visible = visiblePanels(rotation.enabled, rotation.forecastAvailable);
  const rotates = visible.length > 1;
  const { current, paused } = rotation;

  // troca automática
  useEffect(() => {
    if (paused || !rotates) return;
    const id = window.setTimeout(() => dispatch({ type: 'next' }), settings.intervalSec * 1000);
    return () => window.clearTimeout(id);
  }, [current, paused, rotates, settings.intervalSec]);

  // indicador de progresso do painel (animação direta no elemento, sem estado)
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || paused || !rotates || typeof el.animate !== 'function') return;
    const anim = el.animate([{ width: '0%' }, { width: '100%' }], { duration: settings.intervalSec * 1000, easing: 'linear', fill: 'forwards' });
    return () => anim.cancel();
  }, [current, paused, rotates, settings.intervalSec]);

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const prev = useCallback(() => dispatch({ type: 'prev' }), []);
  const togglePause = useCallback(() => dispatch({ type: 'toggle-pause' }), []);

  // teclado: setas, espaço, F, Esc
  useEffect(() => {
    if (settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const onButton = e.target instanceof HTMLElement && e.target.closest('button,a,input,select,textarea,[role="radio"]');
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ' && !onButton) {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'f' || e.key === 'F') {
        if (!onButton || e.target instanceof HTMLButtonElement) fullscreen.toggle();
      } else if (e.key === 'Escape') controls.hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, next, prev, togglePause, fullscreen, controls]);

  const updatedAt = model?.generatedAt ?? null;
  const stale = updatedAt != null && now.getTime() - Date.parse(updatedAt) > STALE_AFTER_MS;
  const offline = connection === 'offline';

  return (
    <div className={cn('flex h-dvh w-full flex-col overflow-hidden bg-bg text-ink', !controls.visible && 'cursor-none')}>
      <CriticalAlertBanner />

      <header className="flex shrink-0 items-center gap-[3vh] border-b border-line px-[3vh] py-[1.6vh]">
        <Logo className="h-[4.5vh] w-auto" />
        <div className="min-w-0">
          <p className="text-[clamp(1.1rem,3vh,3rem)] font-semibold leading-tight">Expedição</p>
          <p className="text-[clamp(0.8rem,1.8vh,1.8rem)] text-ink-2" role="status">
            {connection === 'live' ? 'Ao vivo' : connection === 'offline' ? 'Sem conexão' : 'Conectando'}
            {updatedAt && <span className="text-ink-3"> · atualizado às {formatTime(updatedAt)}</span>}
          </p>
        </div>
        <div className="ml-auto text-right">
          <Clock />
        </div>
      </header>

      {canLeave && (
        <p className="shrink-0 px-[3vh] pt-[1.2vh] text-[clamp(0.8rem,1.8vh,1.8rem)] text-ink-2">
          Esta TV está com a sua conta e sai sozinha depois de 30 min sem uso. Para uma TV fixa no galpão, pareie o aparelho em{' '}
          <Link to="/configuracoes/dispositivos" className="underline">
            Configurações &gt; Dispositivos
          </Link>
          .
        </p>
      )}

      {(offline || stale) && (
        <div className="shrink-0 px-[3vh] pt-[1.4vh]">
          <Notice tone={offline ? 'crit' : 'warn'} title={offline ? 'Sem conexão com os dados' : updatedAt ? `Dados sem atualizar desde ${formatTime(updatedAt)}` : 'Dados sem atualizar'}>
            {offline ? 'Os números na tela podem estar defasados. A conexão volta sozinha.' : undefined}
          </Notice>
        </div>
      )}

      <main className="min-h-0 flex-1 p-[3vh]" aria-live="off">
        <h1 className="sr-only">Modo TV, painel {PANEL_LABEL[current]}</h1>
        {overview.isPending && !model ? (
          <PanelSkeleton />
        ) : overview.isError && !model ? (
          <Notice tone="crit" title="Não foi possível carregar os dados" action={<Button onClick={() => void overview.refetch()}>Tentar de novo</Button>}>
            Verifique a conexão deste aparelho.
          </Notice>
        ) : model ? (
          <>
            <p className="mb-[1.4vh] text-[clamp(1.2rem,3.4vh,3.4rem)] font-semibold">{PANEL_LABEL[current]}</p>
            <div className="h-[calc(100%-clamp(2rem,5vh,5rem))]">
              {current === 'agora' && <NowPanel model={model} forecast={forecast} />}
              {current === 'operadores' && (
                <OperatorsPanel model={model} privacy={settings.privacy} intervalSec={settings.intervalSec} paused={paused} />
              )}
              {current === 'hora' && <HourlyPanel model={model} />}
              {current === 'previsao' && forecast && <ForecastPanel forecast={forecast} />}
            </div>
          </>
        ) : null}
      </main>

      <div className="h-[0.7vh] min-h-1 shrink-0 bg-sunk" aria-hidden="true">
        <div ref={barRef} className="h-full w-0 bg-accent-fill" />
      </div>

      <div
        className={cn(
          'fixed inset-x-0 bottom-[2vh] z-40 mx-auto flex w-fit max-w-[calc(100vw-16px)] items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-popover transition-opacity',
          controls.visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        role="toolbar"
        aria-label="Controles do Modo TV"
        aria-hidden={!controls.visible}
      >
        <Tooltip content="Painel anterior (seta para a esquerda)">
          <IconButton aria-label="Painel anterior" onClick={prev} disabled={!rotates} tabIndex={controls.visible ? 0 : -1}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Tooltip content={paused ? 'Continuar (espaço)' : 'Pausar (espaço)'}>
          <IconButton aria-label={paused ? 'Continuar rodízio' : 'Pausar rodízio'} onClick={togglePause} tabIndex={controls.visible ? 0 : -1}>
            {paused ? <Play /> : <Pause />}
          </IconButton>
        </Tooltip>
        <Tooltip content="Próximo painel (seta para a direita)">
          <IconButton aria-label="Próximo painel" onClick={next} disabled={!rotates} tabIndex={controls.visible ? 0 : -1}>
            <ChevronRight />
          </IconButton>
        </Tooltip>
        {fullscreen.supported && (
          <Tooltip content={fullscreen.active ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}>
            <IconButton aria-label={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'} onClick={fullscreen.toggle} tabIndex={controls.visible ? 0 : -1}>
              {fullscreen.active ? <Minimize /> : <Maximize />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip content="Configurações">
          <IconButton aria-label="Configurações do Modo TV" onClick={() => setSettingsOpen(true)} tabIndex={controls.visible ? 0 : -1}>
            <Settings />
          </IconButton>
        </Tooltip>
        {canLeave && (
          <Button asChild variant="ghost" icon={<LogOut />} tabIndex={controls.visible ? 0 : -1}>
            <Link to="/expedicao">Sair do Modo TV</Link>
          </Button>
        )}
      </div>

      <TvSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={saveSettings}
        theme={tvTheme}
        onThemeChange={setTvTheme}
      />
    </div>
  );
}

/** Só o relógio redesenha a cada segundo; o resto da tela usa o intervalo padrão. */
function Clock() {
  const now = useNow(1000);
  return (
    <>
      <p className="tabular text-[clamp(2.5rem,9vh,9rem)] font-semibold leading-none" aria-label={`Hora atual ${formatTime(now)}`}>
        {formatTime(now)}
      </p>
      <p className="text-[clamp(0.9rem,2vh,2rem)] text-ink-2 first-letter:uppercase">{dayLong(now)}</p>
    </>
  );
}

function dayLong(now: Date): string {
  // formatDayLong recebe a chave do dia; usa o relógio da fonte, no fuso de São Paulo
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  return formatDayLong(key);
}
