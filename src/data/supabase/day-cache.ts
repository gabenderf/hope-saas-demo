/**
 * Cache de agregados de DIAS FECHADOS no localStorage.
 *
 * Dia fechado (antes de ONTEM, ver source.ts) não muda mais (data_hora é o now() do banco: nada entra em
 * ontem depois da meia-noite), então nunca expira. HOJE nunca entra aqui.
 *
 * Chave versionada por dia e por projeto Supabase:
 *   hope.supabase.dia.v<CACHE_VERSION>.<hash do projeto>:<YYYY-MM-DD>
 * Mudou a fórmula de agregação? Suba CACHE_VERSION: as chaves antigas são
 * apagadas na partida.
 *
 * Limite: no máximo `maxDays` dias e `maxBytes` de texto; passou, descarta os
 * dias mais antigos (são os menos consultados). Cota estourada no navegador
 * também descarta os mais antigos e tenta de novo. Sem localStorage (modo
 * privado), fica só a memória.
 */
import type { DayKey } from '@/lib/time';
import type { DailyOperatorAggregate, DailySkuAggregate } from '../types';

/**
 * v2 (06/11/2026): a v1 considerava fechado tudo antes de "hoje" pelo relógio
 * do navegador; um aparelho com relógio adiantado pode ter gravado um dia
 * ainda parcial. Subir a versão apaga esses dias na partida.
 */
export const CACHE_VERSION = 2;
const ROOT = 'hope.supabase.dia.';

export interface DayAggregates {
  operators: DailyOperatorAggregate[];
  skus: DailySkuAggregate[];
}

type StoredOperator = [string, number, number, number, number, string | null, string | null];
type StoredSku = [string, number, number, number];
interface StoredDay {
  v: number;
  d: DayKey;
  o: StoredOperator[];
  s: StoredSku[];
}

export interface DayCacheOptions {
  /** identifica o projeto (URL do Supabase): dois projetos não dividem cache */
  scope: string;
  storage: Storage | null;
  maxDays?: number;
  maxBytes?: number;
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function encode(day: DayKey, agg: DayAggregates): string {
  const stored: StoredDay = {
    v: CACHE_VERSION,
    d: day,
    o: agg.operators.map((a) => [a.operatorId, a.orders, a.simpleOrders, a.mixedOrders, a.hours, a.startAt, a.lastActivityAt]),
    s: agg.skus.map((s) => [s.sku, s.orders, s.units, s.mixedOrders]),
  };
  return JSON.stringify(stored);
}

/** Decodifica e VALIDA. Qualquer coisa estranha = null (busca de novo). */
function decode(day: DayKey, text: string): DayAggregates | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<StoredDay>;
  if (p.v !== CACHE_VERSION || p.d !== day || !Array.isArray(p.o) || !Array.isArray(p.s)) return null;
  const operators: DailyOperatorAggregate[] = [];
  for (const o of p.o as unknown[]) {
    if (!Array.isArray(o) || o.length !== 7) return null;
    const [operatorId, orders, simpleOrders, mixedOrders, hours, startAt, lastActivityAt] = o as unknown[];
    if (typeof operatorId !== 'string' || !isNum(orders) || !isNum(simpleOrders) || !isNum(mixedOrders) || !isNum(hours)) return null;
    if (!isStrOrNull(startAt) || !isStrOrNull(lastActivityAt)) return null;
    operators.push({ day, operatorId, orders, simpleOrders, mixedOrders, hours, startAt, lastActivityAt });
  }
  const skus: DailySkuAggregate[] = [];
  for (const s of p.s as unknown[]) {
    if (!Array.isArray(s) || s.length !== 4) return null;
    const [sku, orders, units, mixedOrders] = s as unknown[];
    if (typeof sku !== 'string' || !isNum(orders) || !isNum(units) || !isNum(mixedOrders)) return null;
    skus.push({ day, sku, orders, units, mixedOrders });
  }
  return { operators, skus };
}

export class ClosedDayCache {
  private readonly prefix: string;
  private readonly storage: Storage | null;
  private readonly maxDays: number;
  private readonly maxBytes: number;
  private readonly memory = new Map<DayKey, DayAggregates>();
  /** dia → tamanho no storage; montado uma vez a partir das chaves existentes */
  private index: Map<DayKey, number> | null = null;

  constructor(options: DayCacheOptions) {
    this.prefix = `${ROOT}v${CACHE_VERSION}.${hash(options.scope)}:`;
    this.storage = options.storage;
    this.maxDays = options.maxDays ?? 400;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.removeStaleVersions();
  }

  get(day: DayKey): DayAggregates | null {
    const mem = this.memory.get(day);
    if (mem) return mem;
    const text = this.read(day);
    if (text == null) return null;
    const agg = decode(day, text);
    if (!agg) {
      this.remove(day);
      return null;
    }
    this.remember(day, agg);
    return agg;
  }

  put(day: DayKey, agg: DayAggregates): void {
    this.remember(day, agg);
    if (!this.storage) return;
    const text = encode(day, agg);
    const index = this.loadIndex();
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        this.storage.setItem(this.prefix + day, text);
        index.set(day, text.length);
        this.enforceLimits(day);
        return;
      } catch (error) {
        // cota estourada: descarta o mais antigo (que não seja este) e tenta de novo
        const oldest = [...index.keys()].filter((d) => d !== day).sort()[0];
        if (!oldest) {
          console.warn('[dados supabase] cache local cheio; seguindo só com a memória', error);
          return;
        }
        this.remove(oldest);
      }
    }
  }

  /** Apaga tudo deste projeto (botão "recarregar" de verdade). */
  clear(): void {
    this.memory.clear();
    for (const day of [...this.loadIndex().keys()]) this.remove(day);
  }

  /** Dias guardados no storage (para testes e diagnóstico). */
  storedDays(): DayKey[] {
    return [...this.loadIndex().keys()].sort();
  }

  private remember(day: DayKey, agg: DayAggregates) {
    this.memory.delete(day);
    this.memory.set(day, agg);
    while (this.memory.size > this.maxDays) {
      const first = this.memory.keys().next().value;
      if (first === undefined) break;
      this.memory.delete(first);
    }
  }

  private read(day: DayKey): string | null {
    try {
      return this.storage?.getItem(this.prefix + day) ?? null;
    } catch {
      return null;
    }
  }

  private remove(day: DayKey) {
    this.memory.delete(day);
    this.index?.delete(day);
    try {
      this.storage?.removeItem(this.prefix + day);
    } catch {
      // storage indisponível: nada a fazer
    }
  }

  private loadIndex(): Map<DayKey, number> {
    if (this.index) return this.index;
    const index = new Map<DayKey, number>();
    if (this.storage) {
      try {
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (!key?.startsWith(this.prefix)) continue;
          index.set(key.slice(this.prefix.length), this.storage.getItem(key)?.length ?? 0);
        }
      } catch {
        // storage indisponível
      }
    }
    this.index = index;
    return index;
  }

  private enforceLimits(justWritten: DayKey) {
    const index = this.loadIndex();
    let bytes = 0;
    for (const size of index.values()) bytes += size;
    const days = [...index.keys()].sort();
    for (const day of days) {
      if (index.size <= this.maxDays && bytes <= this.maxBytes) break;
      if (day === justWritten) continue;
      bytes -= index.get(day) ?? 0;
      this.remove(day);
    }
  }

  private removeStaleVersions() {
    if (!this.storage) return;
    try {
      const stale: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(ROOT) && !key.startsWith(`${ROOT}v${CACHE_VERSION}.`)) stale.push(key);
      }
      for (const key of stale) this.storage.removeItem(key);
    } catch {
      // storage indisponível
    }
  }
}
