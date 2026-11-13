import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleTimer, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, isIdleExpired, readLastActivity, writeLastActivity } from './idle';

const MIN = 60 * 1000;

describe('encerramento por inatividade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const onChange = vi.fn();
    const onTimeout = vi.fn();
    const persist = vi.fn();
    const timer = createIdleTimer({ onChange, onTimeout, persist });
    return { timer, onChange, onTimeout, persist };
  }

  it('padrão: 30 min, aviso 60 s antes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * MIN);
    expect(IDLE_WARNING_MS).toBe(60 * 1000);
  });

  it('sem interação, avisa aos 29 min e sai aos 30', () => {
    const { timer, onChange, onTimeout } = setup();
    timer.start();
    vi.advanceTimersByTime(29 * MIN - 1000);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenLastCalledWith({ warning: true, secondsLeft: 60 });
    vi.advanceTimersByTime(30 * 1000);
    expect(onChange).toHaveBeenLastCalledWith({ warning: true, secondsLeft: 30 });
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30 * 1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ warning: false, secondsLeft: 0 });
    expect(timer.running).toBe(false);
  });

  it('interação zera a contagem', () => {
    const { timer, onTimeout, persist } = setup();
    timer.start();
    vi.advanceTimersByTime(20 * MIN);
    timer.activity();
    expect(persist).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20 * MIN);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10 * MIN);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('interação durante o aviso tira o aviso', () => {
    const { timer, onChange, onTimeout } = setup();
    timer.start();
    vi.advanceTimersByTime(29 * MIN + 30 * 1000);
    expect(onChange).toHaveBeenLastCalledWith({ warning: true, secondsLeft: 30 });
    timer.activity();
    expect(onChange).toHaveBeenLastCalledWith({ warning: false, secondsLeft: 0 });
    vi.advanceTimersByTime(10 * MIN);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('atividade de outra aba com horário antigo não volta o relógio', () => {
    const { timer, onTimeout } = setup();
    timer.start();
    vi.advanceTimersByTime(10 * MIN);
    timer.activity(Date.now() - 20 * MIN);
    vi.advanceTimersByTime(20 * MIN);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('retomar com última atividade antiga (navegador reaberto) sai na hora', () => {
    const { timer, onTimeout } = setup();
    timer.start(Date.now() - 2 * 60 * MIN);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('notebook suspenso: o primeiro tique depois de acordar encerra', () => {
    const { timer, onTimeout } = setup();
    timer.start();
    // Relógio salta 3 h sem os timers rodarem (suspensão).
    vi.setSystemTime(Date.now() + 3 * 60 * MIN);
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stop() cancela', () => {
    const { timer, onTimeout } = setup();
    timer.start();
    timer.stop();
    vi.advanceTimersByTime(60 * MIN);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('isIdleExpired', () => {
    const now = Date.now();
    expect(isIdleExpired(null, now)).toBe(false);
    expect(isIdleExpired(now - 29 * MIN, now)).toBe(false);
    expect(isIdleExpired(now - 30 * MIN, now)).toBe(true);
  });

  it('lê e grava a última atividade no storage', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(readLastActivity(storage)).toBeNull();
    writeLastActivity(storage, 123);
    expect(readLastActivity(storage)).toBe(123);
    map.set('hope.auth.ultima-atividade', 'lixo');
    expect(readLastActivity(storage)).toBeNull();
  });
});
