/** Modelos por período (7d, 30d e Relatórios): um valor por dia com movimento. */
import {
  computeOperatorDay,
  dayBucketValues,
  effectiveGoal,
  mixedShare,
  periodOperatorStats,
  rankProductsFromAggregates,
  rankProductsFromScans,
  teamRate,
} from '@/lib/metrics';
import { formatDayShort, formatDayWithWeekday } from '@/lib/format';
import { type DayKey, addDays, daysBetween, todayKey } from '@/lib/time';
import type {
  Bucket,
  CompareKey,
  DailyOperatorAggregate,
  Operator,
  OperationsSource,
  OperatorRow,
  OverviewModel,
  ProductRow,
  RangeKey,
  ScanEvent,
} from '../types';
import { lastWorkedWeekdays, movementDaysIn, resolveGlobalGoal } from './common';

type OpStats = ReturnType<typeof periodOperatorStats>;

interface PeriodSummary {
  orders: number;
  simple: number;
  mixed: number;
  rate: number | null;
  /** operadores que produziram no período */
  workers: number;
  byOperator: Map<string, OpStats>;
}

function summarize(operators: Operator[], aggregates: DailyOperatorAggregate[]): PeriodSummary {
  const byOperator = new Map<string, OpStats>();
  for (const op of operators) {
    const s = periodOperatorStats(op.id, aggregates);
    if (s.orders > 0) byOperator.set(op.id, s);
  }
  const all = [...byOperator.values()];
  return {
    orders: all.reduce((n, s) => n + s.orders, 0),
    simple: all.reduce((n, s) => n + s.simpleOrders, 0),
    mixed: all.reduce((n, s) => n + s.mixedOrders, 0),
    // média SIMPLES dos ritmos do período por operador
    rate: teamRate(all.map((s) => ({ orders: s.orders, rate: s.rate }))),
    workers: all.length,
    byOperator,
  };
}

const PRODUCT_CONCURRENCY = 4;

async function productsOf(source: OperationsSource, days: DayKey[], operatorIds?: string[]): Promise<ProductRow[]> {
  if (days.length === 0) return [];
  if (operatorIds?.length) {
    const set = new Set(operatorIds);
    // dias em paralelo, no máximo PRODUCT_CONCURRENCY por vez
    const perDay: ScanEvent[][] = new Array<ScanEvent[]>(days.length);
    let next = 0;
    const worker = async () => {
      while (next < days.length) {
        const i = next++;
        perDay[i] = (await source.getDayEvents(days[i]!)).scans.filter((s) => set.has(s.operatorId));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PRODUCT_CONCURRENCY, days.length) }, worker));
    return rankProductsFromScans(perDay.flat());
  }
  const all = await source.getDailySkuAggregates(days[0]!, days[days.length - 1]!);
  return rankProductsFromAggregates(all.filter((a) => days.includes(a.day)));
}

export interface PeriodSpec {
  range: RangeKey;
  compare: CompareKey;
  label: string;
  sublabel: string;
  compareLabel: string;
  days: DayKey[];
  compareDays: DayKey[];
  operatorIds?: string[];
}

export async function buildPeriodModel(source: OperationsSource, spec: PeriodSpec): Promise<OverviewModel> {
  const now = source.now();
  const today = todayKey(now);
  const [allOperators, config] = await Promise.all([source.listOperators(), source.getConfig()]);
  const globalGoal = await resolveGlobalGoal(source, today, config);
  const wanted = spec.operatorIds;
  const operators = wanted?.length ? allOperators.filter((o) => wanted.includes(o.id)) : allOperators;

  const fetchAgg = async (days: DayKey[]) =>
    days.length === 0
      ? []
      : (await source.getDailyAggregates(days[0]!, days[days.length - 1]!)).filter((a) => days.includes(a.day));
  const [agg, cmpAgg] = await Promise.all([fetchAgg(spec.days), fetchAgg(spec.compareDays)]);
  const cur = summarize(operators, agg);
  const prev = summarize(operators, cmpAgg);
  const hasCompare = spec.compareDays.length > 0;

  // estado ao vivo (hoje) só para status e bancada de cada linha
  const todayEvents = await source.getDayEvents(today);
  const live = new Map(allOperators.map((o) => [o.id, computeOperatorDay(o, todayEvents, now)]));

  const rows: OperatorRow[] = [];
  for (const op of operators) {
    const s = cur.byOperator.get(op.id);
    if (!s) continue;
    const p = prev.byOperator.get(op.id);
    const goal = effectiveGoal(op, globalGoal);
    const l = live.get(op.id);
    const last = agg
      .filter((a) => a.operatorId === op.id && a.lastActivityAt)
      .map((a) => a.lastActivityAt as string)
      .sort()
      .pop();
    rows.push({
      id: op.id,
      name: op.name,
      station: l?.station ?? null,
      status: l?.status ?? 'ausente',
      awayReason: l?.awayReason ?? null,
      startAt: null,
      lastActivityAt: last ?? null,
      orders: s.orders,
      simpleOrders: s.simpleOrders,
      mixedOrders: s.mixedOrders,
      hours: s.hours,
      rate: s.rate,
      individualGoal: op.individualGoal,
      effectiveGoal: goal.value,
      goalSource: goal.source,
      goalRatio: s.rate != null ? s.rate / goal.value : null,
      daysWorked: s.daysWorked,
      compareOrders: hasCompare ? (p?.orders ?? 0) : null,
      compareRate: hasCompare ? (p?.rate ?? null) : null,
    });
  }
  rows.sort((a, b) => b.orders - a.orders);

  const valuesOf = (list: DayKey[], aggs: DailyOperatorAggregate[]) =>
    list.map((day) => dayBucketValues(aggs.filter((a) => a.day === day)));
  const curDays = valuesOf(spec.days, agg);
  const cmpDays = valuesOf(spec.compareDays, cmpAgg);

  const buckets: Bucket[] = spec.days.map((day, i) => {
    const v = curDays[i]!;
    const c = cmpDays[i];
    return {
      key: day,
      label: formatDayWithWeekday(day),
      partial: false,
      future: false,
      values: { pedidos: v.orders, ritmo: v.rate, ativos: v.active, mistos: v.mixed },
      compare: {
        pedidos: c ? c.orders : null,
        ritmo: c ? c.rate : null,
        ativos: c ? c.active : null,
        mistos: c ? c.mixed : null,
      },
    };
  });

  return {
    range: spec.range,
    compare: spec.compare,
    label: spec.label,
    sublabel: spec.sublabel,
    compareLabel: spec.compareLabel,
    days: spec.days,
    compareDays: spec.compareDays,
    generatedAt: now.toISOString(),
    kpis: {
      pedidos: { value: cur.orders, compare: hasCompare ? prev.orders : null },
      ritmo: { value: cur.rate, compare: hasCompare ? prev.rate : null },
      ativos: { value: cur.workers, compare: hasCompare ? prev.workers : null },
      mistos: { value: mixedShare(cur.simple, cur.mixed), compare: hasCompare ? mixedShare(prev.simple, prev.mixed) : null },
    },
    buckets,
    operators: rows,
    products: await productsOf(source, spec.days, spec.operatorIds),
    globalGoal,
    globalGoalUpdatedAt: config.updatedAt,
  };
}

const rangeText = (days: DayKey[]) =>
  days.length === 0 ? 'sem dias com movimento' : `${formatDayShort(days[0]!)} a ${formatDayShort(days[days.length - 1]!)}`;

/** Visão Geral em 7d ou 30d: segunda a sexta COM movimento antes de hoje. */
export async function buildRangeOverview(source: OperationsSource, range: '7d' | '30d'): Promise<OverviewModel> {
  const today = todayKey(source.now());
  const days =
    range === '7d'
      ? await lastWorkedWeekdays(source, today, 7)
      : (await movementDaysIn(source, addDays(today, -30), addDays(today, -1), true)).days;
  const compareDays = days.length ? await lastWorkedWeekdays(source, days[0]!, days.length) : [];
  return buildPeriodModel(source, {
    range,
    compare: 'periodo-anterior',
    label: range === '7d' ? 'Últimos 7 dias úteis' : 'Últimos 30 dias',
    sublabel: range === '7d' ? rangeText(days) : `${days.length} dias úteis, ${rangeText(days)}`,
    compareLabel: `Período anterior, ${rangeText(compareDays)}`,
    days,
    compareDays,
  });
}

export interface PeriodRequest {
  from: DayKey;
  to: DayKey;
  compareFrom?: DayKey;
  compareTo?: DayKey;
  operatorIds?: string[];
}

/** Relatórios: todos os dias com movimento no intervalo, sábado trabalhado incluso. */
export async function buildCustomPeriod(source: OperationsSource, p: PeriodRequest): Promise<OverviewModel> {
  const span = daysBetween(p.from, p.to).length;
  const cTo = p.compareTo ?? addDays(p.from, -1);
  const cFrom = p.compareFrom ?? addDays(cTo, -(span - 1));
  const [cur, prev] = await Promise.all([movementDaysIn(source, p.from, p.to), movementDaysIn(source, cFrom, cTo)]);
  return buildPeriodModel(source, {
    range: span <= 1 ? 'hoje' : span <= 7 ? '7d' : '30d',
    compare: 'periodo-anterior',
    label: p.from === p.to ? formatDayWithWeekday(p.from) : `${formatDayShort(p.from)} a ${formatDayShort(p.to)}`,
    sublabel: `${cur.days.length} ${cur.days.length === 1 ? 'dia' : 'dias'} com movimento`,
    compareLabel: `Período anterior, ${formatDayShort(cFrom)} a ${formatDayShort(cTo)}`,
    days: cur.days,
    compareDays: prev.days,
    operatorIds: p.operatorIds,
  });
}
