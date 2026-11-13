/** Operadores, catálogo de SKUs e plano de cada dia da fonte demo. */
import { ehFeriado } from '@/lib/calendar';
import { type DayKey, addDays, weekdayOf } from '@/lib/time';
import type { Operator } from '../types';
import { createRng, hashString } from './rng';

export const HISTORY_START: DayKey = '2026-06-12';

export interface RosterEntry extends Operator {
  /** primeiro dia em que trabalhou */
  from: DayKey;
  /** último dia em que trabalhou */
  until: DayKey;
  /** 1 = média; maior = mais rápido */
  speed: number;
}

export const ROSTER: readonly RosterEntry[] = [
  { id: '101', name: 'Larissa Mendonça', individualGoal: 38, registration: 'ativo', from: '2026-01-01', until: '2099-12-31', speed: 1.15 },
  { id: '102', name: 'Carlos Eduardo Lima', individualGoal: 35, registration: 'ativo', from: '2026-01-01', until: '2099-12-31', speed: 1.0 },
  { id: '103', name: 'Juliana Prado', individualGoal: 36, registration: 'ativo', from: '2026-01-01', until: '2099-12-31', speed: 1.05 },
  { id: '104', name: 'Rafael Souza', individualGoal: 40, registration: 'ativo', from: '2026-01-01', until: '2099-12-31', speed: 1.2 },
  { id: '105', name: 'Fernanda Alves', individualGoal: 34, registration: 'ativo', from: '2026-01-01', until: '2099-12-31', speed: 0.9 },
  { id: '106', name: 'Thiago Nogueira', individualGoal: 32, registration: 'ativo', from: '2026-07-01', until: '2099-12-31', speed: 0.85 },
  { id: '107', name: 'Beatriz Cardoso', individualGoal: 35, registration: 'ativo', from: '2026-08-03', until: '2099-12-31', speed: 0.95 },
  { id: '108', name: 'Marcos Vieira', individualGoal: 37, registration: 'inativo', from: '2026-01-01', until: '2026-09-30', speed: 1.0 },
];

export function baseOperators(): Operator[] {
  return ROSTER.map(({ id, name, individualGoal, registration }) => ({ id, name, individualGoal, registration }));
}

/* ---------- catálogo ---------- */

export interface CatalogEntry {
  sku: string;
  weight: number;
  /** pesos das quantidades 1..n */
  qty: readonly number[];
}

const Q1: readonly number[] = [1];
const QS: readonly number[] = [88, 8, 4];

export const CATALOG: readonly CatalogEntry[] = [
  { sku: '3X-LEN-ECO-70X50', weight: 12, qty: QS },
  { sku: '1X-LEN-ECO-70X50', weight: 9, qty: QS },
  { sku: '4X-LEN-ECO-70X50', weight: 5, qty: QS },
  { sku: '5X-LEN-COM-TNT', weight: 8, qty: QS },
  { sku: '3L-PERFU-FLEX', weight: 12, qty: Q1 },
  { sku: '13L-PERFU-FLEX', weight: 1, qty: Q1 },
  { sku: '10X-LEN-CEL-70X50', weight: 6, qty: QS },
  { sku: '10X-LEN-CEL-50X50', weight: 5, qty: QS },
  { sku: '1X-MASC-BRA', weight: 8, qty: QS },
  { sku: '2X-MASC-BRA', weight: 4, qty: QS },
  { sku: '100X-TOU-DESC-TNT-BRA', weight: 1, qty: Q1 },
  { sku: '50X-TOU-DESC-TNT-BRA', weight: 1, qty: Q1 },
  { sku: '24X-ATADURA-10CM', weight: 1.5, qty: Q1 },
  { sku: '60X-ATADURA-10CM', weight: 1, qty: Q1 },
  { sku: '100UN-40X1,20-AGULHA', weight: 1.5, qty: Q1 },
  { sku: '100X-SERIN-5ML', weight: 2, qty: Q1 },
  { sku: '2CX-LUVA-VINIL-M', weight: 3, qty: QS },
  { sku: '20X-LUVA-SOFT-M', weight: 1, qty: Q1 },
  { sku: '100X-LUVA-SOFT-M', weight: 1.5, qty: Q1 },
  { sku: '1X-500-PAP-INTER', weight: 3, qty: QS },
  { sku: 'LEN-COM-TNT', weight: 4, qty: QS },
  { sku: 'LEN-SEM-TNT', weight: 2, qty: QS },
  { sku: '3X-GAZE-11FIOS', weight: 3, qty: QS },
  { sku: '2X-GAZE-13FIOS', weight: 2, qty: QS },
  { sku: '10X-GAZE-ESTÉRIL', weight: 2, qty: QS },
  { sku: '2X-LEN-CEL-70X50', weight: 3, qty: QS },
  { sku: '5X-LEN-CEL-50X50', weight: 2, qty: QS },
];

export interface FixedCombo {
  weight: number;
  /** [sku, pesos das quantidades 1..n] */
  items: readonly (readonly [string, readonly number[]])[];
}

/** Combinações fixas que passaram a existir em 04/08/2026 (../../dashboard-expedicao/CLAUDE.md). */
export const COMBOS: readonly FixedCombo[] = [
  { weight: 620, items: [['3L-PERFU-FLEX', Q1], ['5X-LEN-COM-TNT', [90, 8, 2]]] },
  { weight: 318, items: [['10X-LEN-CEL-70X50', [60, 20, 10, 5, 3, 2]], ['1X-MASC-BRA', Q1]] },
  { weight: 265, items: [['10X-LEN-CEL-50X50', [60, 20, 10, 5, 3, 2]], ['1X-MASC-BRA', Q1]] },
];

export const COMBO_START: DayKey = '2026-08-04';

/* ---------- plano do dia ---------- */

export interface DayPlan {
  day: DayKey;
  worked: boolean;
  /** pedidos totais previstos no dia */
  target: number;
  crew: number;
  /** minutos desde a meia-noite */
  shiftStart: number;
  shiftEnd: number;
  lunch: boolean;
  /** fatia de pedidos mistos */
  mixedShare: number;
  combos: boolean;
  /** dia de fila curta: todos caem juntos */
  shortQueue: boolean;
}

interface Override {
  target: number;
  crew?: number;
  shortQueue?: boolean;
}

/** Valores medidos no histórico real (../../dashboard-expedicao/CLAUDE.md). */
const OVERRIDES: Record<DayKey, Override> = {
  '2026-07-10': { target: 1372, crew: 4 },
  '2026-08-11': { target: 1345, crew: 4 },
  '2026-08-13': { target: 645, crew: 4, shortQueue: true },
  '2026-08-14': { target: 600, crew: 4, shortQueue: true },
  '2026-09-05': { target: 409, crew: 2 },
  '2026-09-08': { target: 1461, crew: 4 },
  '2026-09-09': { target: 1382, crew: 4 },
  '2026-09-10': { target: 1116, crew: 3 },
  '2026-09-14': { target: 1290, crew: 4 },
  '2026-10-12': { target: 901, crew: 3 },
  '2026-10-13': { target: 1059, crew: 3 },
};

/** Feriados em que o galpão trabalhou. */
const WORKED_HOLIDAYS = new Set<DayKey>(['2026-10-12']);

const planCache = new Map<DayKey, DayPlan>();

export function planDay(day: DayKey): DayPlan {
  const hit = planCache.get(day);
  if (hit) return hit;
  const plan = buildPlan(day);
  planCache.set(day, plan);
  return plan;
}

function buildPlan(day: DayKey): DayPlan {
  const rng = createRng(hashString(`plan:${day}`));
  const weekday = weekdayOf(day);
  const combos = day >= COMBO_START;
  const mixedShare = combos ? 0.17 : 0.06;
  const base = { day, mixedShare, combos, shortQueue: false, lunch: true, shiftStart: 7 * 60 + 40, shiftEnd: 17 * 60 + 40 };
  const stopped: DayPlan = { ...base, worked: false, target: 0, crew: 0 };

  if (day < HISTORY_START || weekday === 0) return stopped;
  if (ehFeriado(day) && !WORKED_HOLIDAYS.has(day)) return stopped;

  const override = OVERRIDES[day];
  if (weekday === 6) {
    if (!override && !rng.chance(0.18)) return stopped;
    return {
      ...base,
      worked: true,
      target: override?.target ?? rng.int(150, 420),
      crew: override?.crew ?? 2,
      shiftStart: 8 * 60,
      shiftEnd: 14 * 60,
      lunch: false,
    };
  }

  let target = rng.int(830, 1130);
  if (weekday === 1) target = Math.min(1400, Math.round(target * 1.3));
  // dia útil depois de feriado parado recebe o volume acumulado
  const before = addDays(day, -1);
  if (weekday !== 1 && ehFeriado(before) && !WORKED_HOLIDAYS.has(before)) target = Math.min(1400, Math.round(target * 1.2));
  if (override) target = override.target;
  const crew = override?.crew ?? Math.max(3, Math.min(4, Math.round(target / 360)));
  return { ...base, worked: true, target, crew, shortQueue: Boolean(override?.shortQueue) };
}
