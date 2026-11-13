/** Visão Geral de hoje: por hora, com comparação no mesmo horário. */
import {
  DAY_HOURS,
  activeCount,
  computeOperatorDay,
  hourlyBuckets,
  mixedShare,
  rankProductsFromScans,
  teamRate,
} from '@/lib/metrics';
import { formatDayShort, formatDayWithWeekday, formatTime } from '@/lib/format';
import { type DayKey, addDays, atTime, minutesOfDay, todayKey } from '@/lib/time';
import type {
  Bucket,
  CompareKey,
  DayEvents,
  KpiValue,
  MetricKey,
  Operator,
  OperationsSource,
  OverviewModel,
} from '../types';
import { lastWorkedWeekdays, resolveGlobalGoal, rowFromState } from './common';

function kpisOf(operators: Operator[], events: DayEvents, now: Date): Record<MetricKey, number | null> {
  const states = operators.map((op) => computeOperatorDay(op, events, now));
  return {
    pedidos: states.reduce((n, s) => n + s.orders, 0),
    ritmo: teamRate(states),
    ativos: activeCount(states),
    mistos: mixedShare(
      states.reduce((n, s) => n + s.simpleOrders, 0),
      states.reduce((n, s) => n + s.mixedOrders, 0),
    ),
  };
}

export async function buildTodayOverview(source: OperationsSource, compare: CompareKey): Promise<OverviewModel> {
  const now = source.now();
  const today = todayKey(now);
  const [operators, config] = await Promise.all([source.listOperators(), source.getConfig()]);
  const globalGoal = await resolveGlobalGoal(source, today, config);
  const events = await source.getDayEvents(today);

  const mode: CompareKey = compare === 'semana-passada' ? 'semana-passada' : 'dia-util-anterior';
  let compareDay: DayKey | null =
    mode === 'semana-passada' ? addDays(today, -7) : ((await lastWorkedWeekdays(source, today, 1))[0] ?? null);
  let cmpEvents: DayEvents | null = null;
  if (compareDay) {
    cmpEvents = await source.getDayEvents(compareDay);
    if (cmpEvents.scans.length === 0) {
      compareDay = null;
      cmpEvents = null;
    }
  }

  const states = operators.map((op) => computeOperatorDay(op, events, now));
  const nowKpis = kpisOf(operators, events, now);

  // a comparação corta o dia anterior no MESMO horário de agora
  let cmpKpis: Record<MetricKey, number | null> | null = null;
  let cmpStates: ReturnType<typeof computeOperatorDay>[] = [];
  let cmpEnd: Date | null = null;
  if (compareDay && cmpEvents) {
    const minutes = minutesOfDay(now);
    const cutoff = atTime(compareDay, Math.floor(minutes / 60), minutes % 60);
    cmpEnd = atTime(compareDay, 23, 59);
    cmpKpis = kpisOf(operators, cmpEvents, cutoff);
    cmpStates = operators.map((op) => computeOperatorDay(op, cmpEvents!, cutoff));
  }

  const kpi = (k: MetricKey): KpiValue => ({ value: nowKpis[k], compare: cmpKpis ? cmpKpis[k] : null });

  // série de comparação no gráfico: o dia INTEIRO
  const hours = hourlyBuckets(today, operators, events, now, DAY_HOURS);
  const cmpHours =
    compareDay && cmpEvents && cmpEnd
      ? hourlyBuckets(compareDay, operators, cmpEvents, new Date(cmpEnd.getTime() + 3 * 3_600_000), DAY_HOURS)
      : [];
  const buckets: Bucket[] = hours.map((h, i) => {
    const c = cmpHours[i];
    const label = `${String(h.hour).padStart(2, '0')}h`;
    return {
      key: label,
      label,
      partial: h.partial,
      future: h.future,
      values: { pedidos: h.orders, ritmo: h.rate, ativos: h.active, mistos: h.mixed },
      compare: {
        pedidos: c ? c.orders : null,
        ritmo: c ? c.rate : null,
        ativos: c ? c.active : null,
        mistos: c ? c.mixed : null,
      },
    };
  });

  const rows = operators
    .map((op, i) => {
      const row = rowFromState(op, states[i]!, globalGoal);
      if (compareDay) {
        const c = cmpStates[i];
        row.compareOrders = c ? c.orders : null;
        row.compareRate = c ? c.rate : null;
      }
      return row;
    })
    // regra antiga do leaderboard: pedidos > 0 ou status 'ativo'
    .filter((r) => r.orders > 0 || r.status === 'ativo')
    .sort((a, b) => b.orders - a.orders);

  const compareLabel = !compareDay
    ? 'Sem dia para comparar'
    : mode === 'semana-passada'
      ? `Semana passada (${formatDayWithWeekday(compareDay)}), mesmo horário`
      : `Dia útil anterior (${formatDayWithWeekday(compareDay)}), mesmo horário`;

  return {
    range: 'hoje',
    compare: mode,
    label: 'Hoje',
    sublabel: `${formatDayShort(today)}, até ${formatTime(now)}`,
    compareLabel,
    days: [today],
    compareDays: compareDay ? [compareDay] : [],
    generatedAt: now.toISOString(),
    kpis: { pedidos: kpi('pedidos'), ritmo: kpi('ritmo'), ativos: kpi('ativos'), mistos: kpi('mistos') },
    buckets,
    operators: rows,
    products: rankProductsFromScans(events.scans),
    globalGoal,
    globalGoalUpdatedAt: config.updatedAt,
  };
}
