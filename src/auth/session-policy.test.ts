import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS } from './idle';
import {
  MAX_PERSON_SESSION_MS,
  readSharedComputer,
  SHARED_COMPUTER_KEY,
  SHARED_MAX_SESSION_MS,
  sessionPolicy,
  writeSharedComputer,
} from './session-policy';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('duração do login de pessoa', () => {
  it('computador pessoal: 15 dias e sem inatividade', () => {
    expect(sessionPolicy(false)).toEqual({ shared: false, maxSessionMs: 15 * 24 * 3_600_000, idleTimeoutMs: null });
    expect(MAX_PERSON_SESSION_MS).toBe(15 * 24 * 3_600_000);
  });

  it('computador compartilhado: 12 h e 30 min sem uso', () => {
    expect(sessionPolicy(true)).toEqual({ shared: true, maxSessionMs: 12 * 3_600_000, idleTimeoutMs: IDLE_TIMEOUT_MS });
    expect(SHARED_MAX_SESSION_MS).toBe(12 * 3_600_000);
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60_000);
  });

  it('o compartilhado nunca dura mais que o pessoal', () => {
    expect(SHARED_MAX_SESSION_MS).toBeLessThan(MAX_PERSON_SESSION_MS);
  });
});

describe('escolha guardada no navegador', () => {
  it('padrão é computador pessoal', () => {
    expect(readSharedComputer(memoryStorage())).toBe(false);
  });

  it('marcar e desmarcar', () => {
    const s = memoryStorage();
    writeSharedComputer(s, true);
    expect(s.getItem(SHARED_COMPUTER_KEY)).toBe('1');
    expect(readSharedComputer(s)).toBe(true);
    writeSharedComputer(s, false);
    expect(s.getItem(SHARED_COMPUTER_KEY)).toBeNull();
    expect(readSharedComputer(s)).toBe(false);
  });

  it('sem storage, ou storage que falha, vale o limite curto', () => {
    expect(readSharedComputer(null)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readSharedComputer(broken)).toBe(true);
  });
});
