/** Utilidades de montagem dos modelos de tela. Sem regra de negócio nova: tudo vem de src/lib/metrics. */
import { type OperatorDayState, effectiveGoal } from '@/lib/metrics';
import { type DayKey, addDays, isWeekend } from '@/lib/time';
import type { DailyOperatorAggregate, GeneralConfig, Operator, OperationsSource, OperatorRow } from '../types';

/**
 * Meta global de HOJE: sempre o que está em configuracoes_gerais (o que a extensão lê).
 * A agenda só alimenta a cópia automática do começo do dia (demo: no primeiro acesso do dia;
 * nuvem: cron 00:05), nunca vence uma edição manual feita depois.
 */
export async function resolveGlobalGoal(
  _source: OperationsSource,
  _day: DayKey,
  config: GeneralConfig,
): Promise<number | null> {
  return config.globalGoal;
}

/** Dias com movimento (algum pedido), em ordem crescente. */
export function daysWithMovement(aggregates: DailyOperatorAggregate[]): DayKey[] {
  const set = new Set<DayKey>();
  for (const a of aggregates) if (a.orders > 0) set.add(a.day);
  return [...set].sort();
}

/**
 * DIAS TRABALHADOS: segunda a sexta COM movimento, em ordem crescente. Definição única
 * (Visão Geral, Relatórios, detalhe): feriado parado sai sozinho por não ter movimento,
 * feriado trabalhado (12/10) entra, sábado fica de fora.
 */
export function workedWeekdays(aggregates: DailyOperatorAggregate[]): DayKey[] {
  return daysWithMovement(aggregates).filter((d) => !isWeekend(d));
}

const CHUNK_DAYS = 14;
const MAX_CHUNKS = 6;

/**
 * Os `count` últimos dias de semana (segunda a sexta) COM movimento antes de
 * `before` (exclusivo), em ordem crescente. Feriado parado sai sozinho porque
 * não tem movimento; feriado trabalhado entra.
 */
export async function lastWorkedWeekdays(source: OperationsSource, before: DayKey, count: number): Promise<DayKey[]> {
  const found: DayKey[] = [];
  let end = addDays(before, -1);
  for (let i = 0; i < MAX_CHUNKS && found.length < count; i++) {
    const start = addDays(end, -(CHUNK_DAYS - 1));
    const agg = await source.getDailyAggregates(start, end);
    found.unshift(...workedWeekdays(agg));
    end = addDays(start, -1);
  }
  return found.sort().slice(-count);
}

/** Dias com movimento num intervalo (inclui sábado trabalhado, salvo weekdaysOnly). */
export async function movementDaysIn(
  source: OperationsSource,
  from: DayKey,
  to: DayKey,
  weekdaysOnly = false,
): Promise<{ days: DayKey[]; aggregates: DailyOperatorAggregate[] }> {
  const aggregates = await source.getDailyAggregates(from, to);
  const days = weekdaysOnly ? workedWeekdays(aggregates) : daysWithMovement(aggregates);
  return { days, aggregates: aggregates.filter((a) => days.includes(a.day)) };
}

export function rowFromState(op: Operator, state: OperatorDayState, globalGoal: number | null): OperatorRow {
  const goal = effectiveGoal(op, globalGoal);
  return {
    id: op.id,
    name: op.name,
    station: state.station,
    status: state.status,
    awayReason: state.awayReason,
    startAt: state.startAt,
    lastActivityAt: state.lastActivityAt,
    orders: state.orders,
    simpleOrders: state.simpleOrders,
    mixedOrders: state.mixedOrders,
    hours: state.hours,
    rate: state.rate,
    individualGoal: op.individualGoal,
    effectiveGoal: goal.value,
    goalSource: goal.source,
    goalRatio: state.rate != null ? state.rate / goal.value : null,
  };
}
