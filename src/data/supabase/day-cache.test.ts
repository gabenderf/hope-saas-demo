import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_VERSION, ClosedDayCache, type DayAggregates } from './day-cache';

const agg = (day: string, n = 1): DayAggregates => ({
  operators: [
    { day, operatorId: 'op-a', orders: n, simpleOrders: n, mixedOrders: 0, hours: 1.5, startAt: `${day}T11:00:00.000Z`, lastActivityAt: null },
  ],
  skus: [{ day, sku: 'SKU-A', orders: n, units: n * 2, mixedOrders: 0 }],
});

/** Storage em memória com cota em caracteres, para simular QuotaExceededError. */
class QuotaStorage implements Storage {
  private data = new Map<string, string>();
  private readonly quota: number;
  constructor(quota: number) {
    this.quota = quota;
  }
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    let used = 0;
    for (const [key, val] of this.data) if (key !== k) used += val.length;
    if (used + v.length > this.quota) throw new DOMException('cheio', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

beforeEach(() => window.localStorage.clear());

describe('ClosedDayCache', () => {
  it('guarda e devolve igual, entre instâncias', () => {
    const a = new ClosedDayCache({ scope: 'p1', storage: window.localStorage });
    a.put('2026-11-03', agg('2026-11-03', 7));
    const b = new ClosedDayCache({ scope: 'p1', storage: window.localStorage });
    expect(b.get('2026-11-03')).toEqual(agg('2026-11-03', 7));
    expect(b.get('2026-11-04')).toBeNull();
  });

  it('projetos diferentes não dividem cache', () => {
    new ClosedDayCache({ scope: 'p1', storage: window.localStorage }).put('2026-11-03', agg('2026-11-03'));
    expect(new ClosedDayCache({ scope: 'p2', storage: window.localStorage }).get('2026-11-03')).toBeNull();
  });

  it('chave de versão antiga é apagada; conteúdo corrompido é ignorado e removido', () => {
    window.localStorage.setItem(`hope.supabase.dia.v${CACHE_VERSION - 1}.abc:2026-11-01`, '{}');
    const c = new ClosedDayCache({ scope: 'p1', storage: window.localStorage });
    expect(Object.keys(window.localStorage)).toHaveLength(0);
    c.put('2026-11-03', agg('2026-11-03'));
    const key = Object.keys(window.localStorage)[0]!;
    window.localStorage.setItem(key, '{"v":1,"d":"2026-11-03","o":[["x"]],"s":[]}');
    const fresh = new ClosedDayCache({ scope: 'p1', storage: window.localStorage });
    expect(fresh.get('2026-11-03')).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('limite de dias descarta os mais antigos', () => {
    const c = new ClosedDayCache({ scope: 'p1', storage: window.localStorage, maxDays: 3 });
    for (const d of ['2026-11-04', '2026-11-01', '2026-11-03', '2026-11-02']) c.put(d, agg(d));
    expect(c.storedDays()).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('cota estourada: descarta o mais antigo e grava', () => {
    const storage = new QuotaStorage(350);
    const c = new ClosedDayCache({ scope: 'p1', storage });
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) c.put(d, agg(d));
    const days = c.storedDays();
    expect(days.at(-1)).toBe('2026-11-05');
    expect(days[0]).not.toBe('2026-11-01');
  });

  it('sem localStorage, funciona só em memória', () => {
    const c = new ClosedDayCache({ scope: 'p1', storage: null });
    c.put('2026-11-03', agg('2026-11-03'));
    expect(c.get('2026-11-03')).toEqual(agg('2026-11-03'));
  });

  it('storage que lança em tudo não derruba a leitura', () => {
    const broken = {
      get length(): number {
        throw new Error('negado');
      },
      key: vi.fn(() => {
        throw new Error('negado');
      }),
      getItem: vi.fn(() => {
        throw new Error('negado');
      }),
      setItem: vi.fn(() => {
        throw new Error('negado');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    } as unknown as Storage;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = new ClosedDayCache({ scope: 'p1', storage: broken });
    c.put('2026-11-03', agg('2026-11-03'));
    expect(c.get('2026-11-03')).toEqual(agg('2026-11-03'));
  });
});
