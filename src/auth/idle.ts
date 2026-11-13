/**
 * Encerramento por inatividade.
 *
 * Conta pelo HORÁRIO da última atividade, não por um setTimeout longo: com
 * o notebook suspenso o timer dispara atrasado (ou não dispara), e a sessão
 * ficaria aberta. Um tique por segundo compara o relógio com a última
 * atividade, então voltar da suspensão encerra na hora.
 *
 * A última atividade também fica no localStorage: fechar o navegador e
 * reabrir duas horas depois não pode reaproveitar a sessão do Supabase.
 */

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;
export const LAST_ACTIVITY_KEY = 'hope.auth.ultima-atividade';

export interface IdleTimerOptions {
  timeoutMs?: number;
  warningMs?: number;
  /** a cada segundo durante o aviso, e uma vez quando o aviso some */
  onChange(state: { warning: boolean; secondsLeft: number }): void;
  onTimeout(): void;
  /** grava a última atividade (localStorage); opcional nos testes */
  persist?(at: number): void;
}

export interface IdleTimer {
  /** começa a contar a partir de `lastActivityAt` (ou agora) */
  start(lastActivityAt?: number): void;
  /** houve interação: zera a contagem */
  activity(at?: number): void;
  stop(): void;
  readonly running: boolean;
}

/** Sessão guardada que já passou do limite (navegador reaberto depois de muito tempo). */
export function isIdleExpired(lastActivityAt: number | null, now: number, timeoutMs: number = IDLE_TIMEOUT_MS): boolean {
  if (lastActivityAt === null || !Number.isFinite(lastActivityAt)) return false;
  return now - lastActivityAt >= timeoutMs;
}

export function createIdleTimer(options: IdleTimerOptions): IdleTimer {
  const timeoutMs = options.timeoutMs ?? IDLE_TIMEOUT_MS;
  const warningMs = options.warningMs ?? IDLE_WARNING_MS;
  let last = Date.now();
  let interval: ReturnType<typeof setInterval> | null = null;
  let warning = false;
  let lastSeconds = -1;

  function tick() {
    const remaining = timeoutMs - (Date.now() - last);
    if (remaining <= 0) {
      stop();
      if (warning) {
        warning = false;
        options.onChange({ warning: false, secondsLeft: 0 });
      }
      options.onTimeout();
      return;
    }
    if (remaining <= warningMs) {
      const secondsLeft = Math.ceil(remaining / 1000);
      if (!warning || secondsLeft !== lastSeconds) {
        warning = true;
        lastSeconds = secondsLeft;
        options.onChange({ warning: true, secondsLeft });
      }
    } else if (warning) {
      warning = false;
      lastSeconds = -1;
      options.onChange({ warning: false, secondsLeft: 0 });
    }
  }

  function stop() {
    if (interval !== null) clearInterval(interval);
    interval = null;
  }

  return {
    start(lastActivityAt) {
      stop();
      last = lastActivityAt ?? Date.now();
      warning = false;
      lastSeconds = -1;
      interval = setInterval(tick, 1000);
      tick();
    },
    activity(at) {
      const when = at ?? Date.now();
      if (when <= last) return;
      last = when;
      options.persist?.(when);
      if (interval !== null) tick();
    },
    stop,
    get running() {
      return interval !== null;
    },
  };
}

export function readLastActivity(storage: Pick<Storage, 'getItem'> | null): number | null {
  try {
    const raw = storage?.getItem(LAST_ACTIVITY_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(storage: Pick<Storage, 'setItem'> | null, at: number): void {
  try {
    storage?.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    /* navegação privada sem storage: segue só com o timer da aba */
  }
}
