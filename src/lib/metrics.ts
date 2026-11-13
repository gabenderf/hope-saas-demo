/**
 * FÓRMULAS DA EXPEDIÇÃO: definição ÚNICA para toda a aplicação.
 *
 * Replica `calculateAndRender()` do app.js antigo (linhas 571-684) e o
 * relatório por período (`calculateAndRenderReport`, 1617-1647). Ver
 * docs/modelo-de-dados.md, seções 2 e 3.
 *
 * Por que isso importa: em agosto/2026 a aba Previsão mostrou 48,9/h enquanto
 * a Visão Geral mostrava 39,2/h no mesmo instante: duas fórmulas com o mesmo
 * nome. Aqui existe uma só. Visão Geral, Operadores, Relatórios, Modo TV,
 * Previsão ("ritmo atual") e alertas importam DESTE arquivo.
 *
 * Mudou alguma regra? Mude aqui, atualize os testes (metrics.test.ts) e o
 * CLAUDE.md. Nunca recalcule ritmo dentro de componente.
 */
import type {
  AccessEvent,
  ActivityItem,
  ActivityStatus,
  AwayReason,
  DailyOperatorAggregate,
  DailySkuAggregate,
  DayEvents,
  Operator,
  OperatorId,
  ProductRow,
  ScanEvent,
  StationId,
} from '@/data/types';
import { type DayKey, atTime } from './time';

/** config.js antigo: INACTIVITY_LIMIT_MINUTES = 60 */
export const INACTIVITY_LIMIT_MIN = 60;
/** operadores_metas.meta_horaria DEFAULT 35 e `op.meta_horaria || 35` no app.js */
export const DEFAULT_INDIVIDUAL_GOAL = 35;
/** `Math.max(0.2, elapsedHours)`: evita ritmo infinito nos primeiros minutos */
export const MIN_HOURS = 0.2;
/** Gráfico por hora do app.js: 13 baldes, 07h a 19h. */
export const DAY_HOURS: readonly number[] = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
/**
 * Abaixo da meta até 15% fica SEM cor; mais que isso, âmbar. Nunca vermelho:
 * em dia de fila curta todo mundo cai junto (CLAUDE.md, 15/08/2026).
 */
export const GOAL_NEUTRAL_FLOOR = 0.85;

const HOUR_MS = 3_600_000;
const t = (iso: string) => Date.parse(iso);

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/* ====================================================================
   PEDIDO MISTO
   ==================================================================== */

/** app.js:641-648. Dois ou mais SKUs DISTINTOS na bipagem. Sem itens = simples. */
export function isMixedScan(scan: ScanEvent): boolean {
  if (!Array.isArray(scan.items)) return false;
  return new Set(scan.items.map((i) => i.sku).filter(Boolean)).size >= 2;
}

/* ====================================================================
   META
   ==================================================================== */

/** app.js:566-567. A global, quando preenchida, SOBREPÕE a individual (que não é apagada). */
export function effectiveGoal(
  op: Pick<Operator, 'individualGoal'>,
  globalGoal: number | null,
): { value: number; source: 'global' | 'individual' } {
  if (globalGoal != null) return { value: globalGoal, source: 'global' };
  return { value: op.individualGoal || DEFAULT_INDIVIDUAL_GOAL, source: 'individual' };
}

export type GoalTone = 'ok' | 'neutral' | 'warn' | 'none';

export function goalTone(ratio: number | null | undefined): GoalTone {
  if (ratio == null || !Number.isFinite(ratio)) return 'none';
  if (ratio >= 1) return 'ok';
  if (ratio >= GOAL_NEUTRAL_FLOOR) return 'neutral';
  return 'warn';
}

/* ====================================================================
   OPERADOR NUM DIA (hoje ou qualquer instante de corte)
   ==================================================================== */

export interface OperatorDayState {
  operatorId: OperatorId;
  /** soma de quantidade_pedidos */
  orders: number;
  /** contagem de bipagens */
  simpleOrders: number;
  mixedOrders: number;
  station: StationId | null;
  status: ActivityStatus;
  awayReason: AwayReason | null;
  /** menor entre o primeiro bipe e o primeiro registro de acesso do dia */
  startAt: string | null;
  /** maior entre o último bipe e o último registro de acesso */
  lastActivityAt: string | null;
  /** fim usado no ritmo: agora (se ativo) ou a última atividade (ausente/inativo) */
  endAt: string | null;
  /** max(0.2, fim - início). 0 se não houve pedido. */
  hours: number;
  /** pedidos / horas. null se não houve pedido. */
  rate: number | null;
}

/**
 * app.js:575-664, regra por regra:
 *  - bancada e última atividade vêm do último bipe;
 *  - se o último registro de acesso for mais recente, ele manda: entrada fixa a
 *    bancada; saída (ou troca por outro operador) zera a bancada;
 *  - status: cadastro inativo = 'inativo'; sem bancada = 'ausente'; senão
 *    'ativo' se a última atividade tem até 60 min, 'ausente' depois disso;
 *  - início = menor entre o primeiro bipe e o primeiro registro de acesso;
 *  - fim = agora se ativo; senão congela na última atividade;
 *  - ritmo = pedidos / max(0.2, horas).
 *
 * `now` é o instante de corte: para hoje, o relógio; para "ontem no mesmo
 * horário", o mesmo horário de ontem. Eventos depois de `now` são ignorados.
 */
export function computeOperatorDay(
  op: Operator,
  events: Pick<DayEvents, 'scans' | 'access'>,
  now: Date,
): OperatorDayState {
  const nowMs = now.getTime();
  const scans = events.scans
    .filter((s) => s.operatorId === op.id && t(s.at) <= nowMs)
    .sort((a, b) => t(b.at) - t(a.at)); // mais recente primeiro (como STATE.scans)
  const logs = events.access
    .filter((l) => (l.nextOperatorId === op.id || l.previousOperatorId === op.id) && t(l.at) <= nowMs)
    .sort((a, b) => t(b.at) - t(a.at));

  const orders = scans.reduce((acc, s) => acc + s.orderCount, 0);

  let station: StationId | null = null;
  let lastActivity: number | null = null;
  let firstScan: number | null = null;
  const latestScan = scans[0];
  const earliestScan = scans[scans.length - 1];
  if (latestScan && earliestScan) {
    station = latestScan.station || null;
    lastActivity = t(latestScan.at);
    firstScan = t(earliestScan.at);
  }

  const lastLog = logs[0];
  if (lastLog) {
    const logTime = t(lastLog.at);
    if (lastActivity == null || logTime > lastActivity) {
      lastActivity = logTime;
      station = lastLog.nextOperatorId === op.id ? lastLog.station || null : null;
    }
  }

  let status: ActivityStatus = 'inativo';
  let awayReason: AwayReason | null = null;
  if (op.registration === 'ativo') {
    if (lastActivity != null && station) {
      const within = nowMs - lastActivity <= INACTIVITY_LIMIT_MIN * 60_000;
      status = within ? 'ativo' : 'ausente';
      if (!within) awayReason = 'sem-atividade';
    } else {
      status = 'ausente';
      awayReason = lastActivity == null ? 'sem-registro' : 'saiu-da-bancada';
    }
  }

  let start = firstScan;
  const firstLog = logs[logs.length - 1];
  if (firstLog) {
    const firstLogTime = t(firstLog.at);
    if (start == null || firstLogTime < start) start = firstLogTime;
  }

  let hours = 0;
  let rate: number | null = null;
  let end: number | null = null;
  if (orders > 0 && start != null) {
    end = status === 'ativo' ? nowMs : (lastActivity ?? (latestScan ? t(latestScan.at) : nowMs));
    hours = Math.max(MIN_HOURS, (end - start) / HOUR_MS);
    rate = orders / hours;
  }

  let simpleOrders = 0;
  let mixedOrders = 0;
  for (const s of scans) {
    if (isMixedScan(s)) mixedOrders++;
    else simpleOrders++;
  }

  return {
    operatorId: op.id,
    orders,
    simpleOrders,
    mixedOrders,
    station,
    status,
    awayReason,
    startAt: start != null ? new Date(start).toISOString() : null,
    lastActivityAt: lastActivity != null ? new Date(lastActivity).toISOString() : null,
    endAt: end != null ? new Date(end).toISOString() : null,
    hours,
    rate,
  };
}

/**
 * app.js:673-675. Média SIMPLES dos ritmos individuais de quem tem pedido.
 * Não é total de pedidos / total de horas.
 */
export function teamRate(states: Pick<OperatorDayState, 'orders' | 'rate'>[]): number | null {
  return mean(states.filter((s) => s.orders > 0 && s.rate != null).map((s) => s.rate as number));
}

/** app.js:684. Operadores com status calculado 'ativo'. */
export function activeCount(states: Pick<OperatorDayState, 'status'>[]): number {
  return states.filter((s) => s.status === 'ativo').length;
}

/** Fatia de pedidos mistos, em % (0 a 100). null se não houve bipagem. */
export function mixedShare(simple: number, mixed: number): number | null {
  const total = simple + mixed;
  return total > 0 ? (mixed / total) * 100 : null;
}

/* ====================================================================
   DIA FECHADO (relatório por período)
   ==================================================================== */

/**
 * app.js:1617-1647, com DUAS correções deliberadas:
 *  1. o dia é o dia operacional de São Paulo (o antigo usava o dia UTC);
 *  2. usa os registros de acesso DAQUELE dia (o antigo usava os de hoje).
 * horas = max(0.2, última atividade - início). Só entra quem teve pedido.
 */
export function aggregateDay(day: DayKey, operators: Operator[], events: Pick<DayEvents, 'scans' | 'access'>): DailyOperatorAggregate[] {
  // "agora" bem depois do fim do dia: todo mundo fica 'ausente' e o fim
  // congela na última atividade, que é exatamente a regra do relatório.
  const after = new Date(atTime(day, 23, 59).getTime() + 2 * HOUR_MS);
  const out: DailyOperatorAggregate[] = [];
  for (const op of operators) {
    const s = computeOperatorDay({ ...op, registration: 'ativo' }, events, after);
    if (s.orders <= 0) continue;
    out.push({
      day,
      operatorId: op.id,
      orders: s.orders,
      simpleOrders: s.simpleOrders,
      mixedOrders: s.mixedOrders,
      hours: s.hours,
      startAt: s.startAt,
      lastActivityAt: s.lastActivityAt,
    });
  }
  return out;
}

export interface PeriodOperatorStats {
  operatorId: OperatorId;
  orders: number;
  simpleOrders: number;
  mixedOrders: number;
  hours: number;
  /** total de pedidos / total de horas no período (app.js periodHourlyAvg) */
  rate: number | null;
  daysWorked: number;
}

export function periodOperatorStats(operatorId: OperatorId, aggregates: DailyOperatorAggregate[]): PeriodOperatorStats {
  const mine = aggregates.filter((a) => a.operatorId === operatorId && a.orders > 0);
  const orders = mine.reduce((s, a) => s + a.orders, 0);
  const hours = mine.reduce((s, a) => s + a.hours, 0);
  return {
    operatorId,
    orders,
    simpleOrders: mine.reduce((s, a) => s + a.simpleOrders, 0),
    mixedOrders: mine.reduce((s, a) => s + a.mixedOrders, 0),
    hours,
    rate: orders > 0 && hours > 0 ? orders / hours : null,
    daysWorked: new Set(mine.map((a) => a.day)).size,
  };
}

/** Valores de um dia no gráfico por dia: ritmo = média simples dos ritmos do dia. */
export function dayBucketValues(dayAggregates: DailyOperatorAggregate[]): {
  orders: number;
  rate: number | null;
  active: number;
  mixed: number | null;
} {
  const worked = dayAggregates.filter((a) => a.orders > 0);
  return {
    orders: worked.reduce((s, a) => s + a.orders, 0),
    rate: mean(worked.filter((a) => a.hours > 0).map((a) => a.orders / a.hours)),
    active: worked.length,
    mixed: mixedShare(
      worked.reduce((s, a) => s + a.simpleOrders, 0),
      worked.reduce((s, a) => s + a.mixedOrders, 0),
    ),
  };
}

/* ====================================================================
   POR HORA (hoje)
   ==================================================================== */

export interface HourBucket {
  hour: number;
  partial: boolean;
  future: boolean;
  orders: number | null;
  mixed: number | null;
  active: number | null;
  /** média simples, entre quem bipou na hora, de (pedidos na hora / fração da hora trabalhada) */
  rate: number | null;
}

/**
 * Pedidos por hora (app.js:824-832: soma de quantidade_pedidos por hora local).
 * O ritmo por hora estende a MESMA definição para a janela da hora: cada
 * operador conta pedidos da hora / max(0.2, parte da hora entre o início e o
 * fim dele), e a hora é a média simples desses ritmos.
 */
export function hourlyBuckets(
  day: DayKey,
  operators: Operator[],
  events: Pick<DayEvents, 'scans' | 'access'>,
  now: Date,
  hours: readonly number[] = DAY_HOURS,
): HourBucket[] {
  const nowMs = now.getTime();
  const states = new Map(operators.map((op) => [op.id, computeOperatorDay(op, events, now)]));

  return hours.map((hour) => {
    const hStart = atTime(day, hour).getTime();
    const hEnd = atTime(day, hour + 1).getTime();
    const future = hStart > nowMs;
    const partial = !future && nowMs < hEnd;
    if (future) return { hour, partial: false, future: true, orders: null, mixed: null, active: null, rate: null };

    const windowEnd = Math.min(hEnd, nowMs);
    const inHour = events.scans.filter((s) => {
      const at = t(s.at);
      return at >= hStart && at < windowEnd;
    });

    const byOp = new Map<OperatorId, ScanEvent[]>();
    for (const s of inHour) byOp.set(s.operatorId, [...(byOp.get(s.operatorId) ?? []), s]);

    const rates: number[] = [];
    for (const [opId, list] of byOp) {
      const st = states.get(opId);
      if (!st?.startAt || !st.endAt) continue;
      const from = Math.max(t(st.startAt), hStart);
      const to = Math.min(t(st.endAt), windowEnd);
      const worked = Math.max(MIN_HOURS, Math.max(0, to - from) / HOUR_MS);
      rates.push(list.reduce((n, s) => n + s.orderCount, 0) / worked);
    }

    let simple = 0;
    let mixed = 0;
    for (const s of inHour) {
      if (isMixedScan(s)) mixed++;
      else simple++;
    }

    return {
      hour,
      partial,
      future: false,
      orders: inHour.reduce((n, s) => n + s.orderCount, 0),
      mixed: mixedShare(simple, mixed),
      active: byOp.size,
      rate: mean(rates),
    };
  });
}

/* ====================================================================
   PRODUTOS
   ==================================================================== */

/**
 * Ranqueado por PEDIDOS (bipagens que contêm o SKU), não por unidades.
 * Mesma lição da aba Previsão: por unidade, touca e atadura moram no topo
 * para sempre (6 pedidos = 1.100 peças) e escondem o que a equipe pega o dia todo.
 * O app antigo ranqueava a Visão Geral por unidade; a mudança é deliberada.
 */
export function rankProductsFromScans(scans: ScanEvent[]): ProductRow[] {
  const map = new Map<string, ProductRow>();
  for (const s of scans) {
    if (!Array.isArray(s.items)) continue;
    const mixed = isMixedScan(s);
    const seen = new Set<string>();
    for (const item of s.items) {
      if (!item.sku) continue;
      const row = map.get(item.sku) ?? { sku: item.sku, orders: 0, units: 0, mixedOrders: 0 };
      row.units += Number(item.quantity) || 0;
      if (!seen.has(item.sku)) {
        row.orders += 1;
        if (mixed) row.mixedOrders += 1;
        seen.add(item.sku);
      }
      map.set(item.sku, row);
    }
  }
  return sortProducts([...map.values()]);
}

export function rankProductsFromAggregates(aggregates: DailySkuAggregate[]): ProductRow[] {
  const map = new Map<string, ProductRow>();
  for (const a of aggregates) {
    const row = map.get(a.sku) ?? { sku: a.sku, orders: 0, units: 0, mixedOrders: 0 };
    row.orders += a.orders;
    row.units += a.units;
    row.mixedOrders += a.mixedOrders;
    map.set(a.sku, row);
  }
  return sortProducts([...map.values()]);
}

function sortProducts(rows: ProductRow[]): ProductRow[] {
  return rows.sort((a, b) => b.orders - a.orders || b.units - a.units || a.sku.localeCompare(b.sku));
}

/** Agrega bipagens de um dia por SKU (o adaptador usa para montar DailySkuAggregate). */
export function aggregateSkusOfDay(day: DayKey, scans: ScanEvent[]): DailySkuAggregate[] {
  return rankProductsFromScans(scans).map((p) => ({ day, ...p }));
}

/* ====================================================================
   VARIAÇÕES
   ==================================================================== */

/** Variação percentual. null quando não há base. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Diferença absoluta (para mistos em pontos percentuais e operadores ativos). */
export function absoluteChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

/* ====================================================================
   ATIVIDADE
   ==================================================================== */

/** Bipagens e registros de acesso juntos, mais recente primeiro (app.js:727-729). */
export function buildActivity(events: Pick<DayEvents, 'scans' | 'access'>, operators: Operator[], limit = 50): ActivityItem[] {
  const names = new Map(operators.map((o) => [o.id, o.name]));
  const nameOf = (id: OperatorId | null) => (id ? (names.get(id) ?? `ID ${id}`) : null);

  const fromScans: ActivityItem[] = events.scans.map((s) => ({
    id: `s-${s.id}`,
    at: s.at,
    kind: 'bipe',
    operatorId: s.operatorId,
    operatorName: nameOf(s.operatorId),
    station: s.station,
    skus: [...new Set((s.items ?? []).map((i) => i.sku).filter(Boolean))],
    mixed: isMixedScan(s),
  }));

  const fromAccess: ActivityItem[] = events.access.map((l: AccessEvent) => {
    const kind = l.previousOperatorId && l.nextOperatorId ? 'troca' : l.nextOperatorId ? 'entrada' : 'saida';
    const who = l.nextOperatorId ?? l.previousOperatorId;
    return {
      id: `a-${l.id}`,
      at: l.at,
      kind,
      operatorId: who,
      operatorName: nameOf(who),
      previousOperatorName: kind === 'troca' ? nameOf(l.previousOperatorId) : null,
      station: l.station,
    };
  });

  return [...fromScans, ...fromAccess].sort((a, b) => t(b.at) - t(a.at)).slice(0, limit);
}

/* ====================================================================
   ACRESCENTOS (revisão): hoje em agregado, ritmo do dia, meta média
   ==================================================================== */

/**
 * Agregado de HOJE com a mesma regra da Visão Geral: cada operador é calculado
 * por computeOperatorDay com fim = `now` para quem está ativo (não congela na
 * última atividade, como aggregateDay faz com dia fechado). Só entra quem teve pedido.
 */
export function aggregateToday(
  day: DayKey,
  operators: Operator[],
  events: Pick<DayEvents, 'scans' | 'access'>,
  now: Date,
): DailyOperatorAggregate[] {
  const out: DailyOperatorAggregate[] = [];
  for (const op of operators) {
    const s = computeOperatorDay(op, events, now);
    if (s.orders <= 0) continue;
    out.push({
      day,
      operatorId: op.id,
      orders: s.orders,
      simpleOrders: s.simpleOrders,
      mixedOrders: s.mixedOrders,
      hours: s.hours,
      startAt: s.startAt,
      lastActivityAt: s.lastActivityAt,
    });
  }
  return out;
}

/** Ritmo de um operador num dia agregado: pedidos ÷ horas. null sem horas. */
export function dayRate(agg: Pick<DailyOperatorAggregate, 'orders' | 'hours'>): number | null {
  return agg.hours > 0 ? agg.orders / agg.hours : null;
}

/** Média das metas efetivas dos operadores ativos (padrão 35 sem ninguém). */
export function averageEffectiveGoal(operators: Operator[], globalGoal: number | null): number {
  const active = operators.filter((o) => o.registration === 'ativo');
  if (active.length === 0) return globalGoal ?? DEFAULT_INDIVIDUAL_GOAL;
  return active.reduce((s, o) => s + effectiveGoal(o, globalGoal).value, 0) / active.length;
}
