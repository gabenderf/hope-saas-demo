/** Detalhe do operador e feed de atividade. */
import {
  DAY_HOURS,
  buildActivity,
  computeOperatorDay,
  dayRate,
  hourlyBuckets,
  mixedShare,
  periodOperatorStats,
  teamRate,
} from '@/lib/metrics';
import { type DayKey, addDays, todayKey } from '@/lib/time';
import type {
  ActivityItem,
  OperationsSource,
  OperatorDayPoint,
  OperatorDetailModel,
  OperatorId,
} from '../types';
import { lastWorkedWeekdays, resolveGlobalGoal, rowFromState } from './common';

export async function buildOperatorDetail(source: OperationsSource, id: OperatorId): Promise<OperatorDetailModel | null> {
  const now = source.now();
  const today = todayKey(now);
  const [operators, config] = await Promise.all([source.listOperators(), source.getConfig()]);
  const operator = operators.find((o) => o.id === id);
  if (!operator) return null;
  const globalGoal = await resolveGlobalGoal(source, today, config);
  const events = await source.getDayEvents(today);

  const state = computeOperatorDay(operator, events, now);
  const mine = {
    scans: events.scans.filter((s) => s.operatorId === id),
    access: events.access.filter((a) => a.nextOperatorId === id || a.previousOperatorId === id),
  };

  const hourly = hourlyBuckets(today, [operator], mine, now, DAY_HOURS).map((h) => ({
    hour: h.hour,
    partial: h.partial,
    future: h.future,
    orders: h.orders,
  }));

  const recent = await lastWorkedWeekdays(source, today, 10);
  const agg = recent.length ? await source.getDailyAggregates(recent[0]!, recent[recent.length - 1]!) : [];
  const recentDays: OperatorDayPoint[] = recent.map((day) => {
    const a = agg.find((x) => x.day === day && x.operatorId === id);
    return {
      day,
      orders: a?.orders ?? 0,
      rate: a ? dayRate(a) : null,
      mixedShare: a ? mixedShare(a.simpleOrders, a.mixedOrders) : null,
    };
  });
  recentDays.push({
    day: today,
    orders: state.orders,
    rate: state.rate,
    mixedShare: mixedShare(state.simpleOrders, state.mixedOrders),
  });

  const from30: DayKey = addDays(today, -30);
  const agg30 = await source.getDailyAggregates(from30, addDays(today, -1));
  const stats = periodOperatorStats(id, agg30);

  const teamStates = operators.map((op) => computeOperatorDay(op, events, now));

  return {
    operator,
    today: rowFromState(operator, state, globalGoal),
    hourly,
    recentDays,
    last30: {
      orders: stats.orders,
      rate: stats.rate,
      daysWorked: stats.daysWorked,
      mixedShare: mixedShare(stats.simpleOrders, stats.mixedOrders),
    },
    activity: buildActivity(mine, operators, 50),
    teamRateToday: teamRate(teamStates),
  };
}

export async function buildActivityFeed(
  source: OperationsSource,
  params: { limit: number; day?: DayKey },
): Promise<ActivityItem[]> {
  const day = params.day ?? todayKey(source.now());
  const [operators, events] = await Promise.all([source.listOperators(), source.getDayEvents(day)]);
  return buildActivity(events, operators, params.limit);
}
