/**
 * Período do relatório: atalhos, saneamento da URL e colunas do CSV.
 * Lógica pura (sem React), no dia operacional de São Paulo.
 */
import type { CsvColumn } from '@/lib/csv';
import { isBusinessDay } from '@/lib/calendar';
import { mixedShare } from '@/lib/metrics';
import { type DayKey, addDays, daysBetween, weekdayOf } from '@/lib/time';
import type { OperatorRow, ProductRow } from '@/data/types';

export const PRESETS = ['7u', 'mes', 'mes-anterior', '30d', 'custom'] as const;
export type PresetKey = (typeof PRESETS)[number];
export const COMPARE_MODES = ['anterior', 'nenhum'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const PRESET_LABEL: Record<PresetKey, string> = {
  '7u': 'Últimos 7 dias úteis',
  mes: 'Mês atual',
  'mes-anterior': 'Mês anterior',
  '30d': 'Últimos 30 dias',
  custom: 'Personalizado',
};

export interface Range {
  from: DayKey;
  to: DayKey;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' que existe no calendário (rejeita 2026-02-31). */
export function isValidDay(value: string | null | undefined): value is DayKey {
  if (!value) return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const firstOfMonth = (day: DayKey) => `${day.slice(0, 7)}-01`;

/** Últimos N dias úteis terminando em `today` (inclusive, se for útil). */
export function lastBusinessDays(today: DayKey, n: number): Range {
  let from = today;
  let count = 0;
  for (let d = today, guard = 0; count < n && guard < 60; d = addDays(d, -1), guard++) {
    if (isBusinessDay(d)) {
      count++;
      from = d;
    }
  }
  return { from, to: today };
}

/** Os 7 dias trabalhados atuais e os 7 anteriores (definição única, ver workedWeekdays). */
export interface WorkedWindows {
  current: DayKey[];
  previous: DayKey[];
}

const spanOf = (days: DayKey[]): Range | null => (days.length ? { from: days[0]!, to: days[days.length - 1]! } : null);

/** Intervalo de um atalho. 'custom' devolve o mês atual como ponto de partida. */
export function presetRange(preset: PresetKey, today: DayKey, worked?: WorkedWindows): Range {
  switch (preset) {
    case '7u': {
      // com o dado em mãos vale "dias trabalhados" (mesma definição da Visão Geral);
      // sem ele, a aproximação pelo calendário
      const span = spanOf(worked?.current ?? []);
      return span ? { from: span.from, to: today } : lastBusinessDays(today, 7);
    }
    case 'mes':
    case 'custom':
      return { from: firstOfMonth(today), to: today };
    case 'mes-anterior': {
      const lastPrev = addDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastPrev), to: lastPrev };
    }
    case '30d':
      return { from: addDays(today, -29), to: today };
  }
}

export interface SanitizedRange extends Range {
  warnings: string[];
}

const fmt = (d: DayKey) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Corrige data futura e intervalo invertido, dizendo o que mudou. */
export function sanitizeRange(from: DayKey, to: DayKey, today: DayKey): SanitizedRange {
  const warnings: string[] = [];
  let a = from;
  let b = to;
  if (a > b) {
    [a, b] = [b, a];
    warnings.push('As datas estavam invertidas e foram trocadas.');
  }
  if (b > today) {
    b = today;
    warnings.push(`O período não pode passar de hoje. O fim foi ajustado para ${fmt(today)}.`);
  }
  if (a > b) {
    a = b;
    warnings.push(`O início estava no futuro e foi ajustado para ${fmt(b)}.`);
  }
  return { from: a, to: b, warnings };
}

export interface ReportQuery extends SanitizedRange {
  preset: PresetKey;
  compare: CompareMode;
  operatorIds: string[];
}

/** Lê os parâmetros crus da URL e devolve uma consulta sempre válida. */
export function parseReportQuery(
  raw: { periodo?: string | null; de?: string | null; ate?: string | null; vs?: string | null; operadores?: string | null },
  today: DayKey,
  worked?: WorkedWindows,
): ReportQuery {
  const hasDates = isValidDay(raw.de) && isValidDay(raw.ate);
  let preset: PresetKey = (PRESETS as readonly string[]).includes(raw.periodo ?? '') ? (raw.periodo as PresetKey) : hasDates ? 'custom' : '7u';
  if (preset === 'custom' && !hasDates) preset = '7u';
  const base = preset === 'custom' ? { from: raw.de as DayKey, to: raw.ate as DayKey } : presetRange(preset, today, worked);
  const range = sanitizeRange(base.from, base.to, today);
  const compare: CompareMode = raw.vs === 'nenhum' ? 'nenhum' : 'anterior';
  const operatorIds = (raw.operadores ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { preset, compare, operatorIds: [...new Set(operatorIds)], from: range.from, to: range.to, warnings: range.warnings };
}

/**
 * Período de comparação: o anterior imediato, do mesmo tamanho. No atalho de
 * dias úteis conta dias úteis; nos demais, dias corridos.
 */
export function previousRange(range: Range, preset: PresetKey, worked?: WorkedWindows): Range {
  if (preset === '7u') {
    const span = spanOf(worked?.previous ?? []);
    return span ?? lastBusinessDays(addDays(range.from, -1), 7);
  }
  if (preset === 'mes-anterior') {
    const lastPrev = addDays(range.from, -1);
    return { from: firstOfMonth(lastPrev), to: lastPrev };
  }
  const n = daysBetween(range.from, range.to).length;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(n - 1)), to };
}

export function reportFilename(range: Range, prefix = 'relatorio-expedicao'): string {
  return `${prefix}-${range.from}-a-${range.to}.csv`;
}

/* ---------- CSV ---------- */

export interface OperatorCsvRow
  extends Pick<OperatorRow, 'name' | 'orders' | 'hours' | 'rate' | 'mixedOrders' | 'simpleOrders' | 'effectiveGoal' | 'goalRatio'> {
  daysWorked?: number;
}

export const OPERATOR_CSV_COLUMNS: CsvColumn<OperatorCsvRow>[] = [
  { header: 'Operador', value: (r) => r.name },
  { header: 'Pedidos', value: (r) => r.orders },
  { header: 'Dias trabalhados', value: (r) => r.daysWorked ?? null },
  { header: 'Horas', value: (r) => r.hours, decimals: 1 },
  { header: 'Ritmo (pedidos/h)', value: (r) => r.rate, decimals: 1 },
  { header: 'Pedidos mistos', value: (r) => r.mixedOrders },
  { header: 'Pedidos mistos (%)', value: (r) => mixedShare(r.simpleOrders, r.mixedOrders), decimals: 1 },
  { header: 'Meta (pedidos/h)', value: (r) => r.effectiveGoal },
  { header: 'Contra a meta atual (%)', value: (r) => (r.goalRatio == null ? null : r.goalRatio * 100), decimals: 0 },
];

export const PRODUCT_CSV_COLUMNS: CsvColumn<ProductRow & { position: number }>[] = [
  { header: 'Posição', value: (r) => r.position },
  { header: 'SKU', value: (r) => r.sku },
  { header: 'Pedidos', value: (r) => r.orders },
  { header: 'Pedidos mistos', value: (r) => r.mixedOrders },
  { header: 'Unidades', value: (r) => r.units },
];

/* ---------- indicadores derivados do gráfico por dia ---------- */

export interface DayExtras {
  workedDays: number;
  avgPerWorkedDay: number | null;
  saturdays: number;
}

/** Dias com movimento, média por dia com movimento e sábados trabalhados. */
export function dayExtras(days: { day: DayKey; orders: number | null }[]): DayExtras {
  const worked = days.filter((d) => (d.orders ?? 0) > 0);
  const total = worked.reduce((s, d) => s + (d.orders ?? 0), 0);
  return {
    workedDays: worked.length,
    avgPerWorkedDay: worked.length ? total / worked.length : null,
    saturdays: worked.filter((d) => weekdayOf(d.day) === 6).length,
  };
}
