/**
 * Gerador determinístico de eventos crus de UM dia (semente = o dia).
 * Recarregar a página mostra o mesmo histórico. Tudo que o demo expõe
 * (agregados, produtos) é derivado destes eventos por src/lib/metrics.ts.
 */
import { type DayKey, atTime } from '@/lib/time';
import type { AccessEvent, DayEvents, OrderItem, ScanEvent } from '../types';
import { createRng, hashString, type Rng } from './rng';
import { CATALOG, COMBOS, ROSTER, type DayPlan, type RosterEntry, planDay } from './roster';

const STATIONS = ['01', '02', '03', '04', '05', '06'];
const MIN = 60_000;

interface Worker {
  entry: RosterEntry;
  station: string;
  /** minutos desde a meia-noite */
  start: number;
  end: number;
  /** o início/fim é uma troca com outro operador (sem login/logout próprios) */
  startsByHandover: boolean;
  endsByHandover: boolean;
  breaks: [number, number][];
  move: { at: number; to: string } | null;
  speed: number;
}

function workWindows(w: Worker): [number, number][] {
  const out: [number, number][] = [];
  let cursor = w.start + 1;
  for (const [a, b] of [...w.breaks].sort((x, y) => x[0] - y[0])) {
    if (a > cursor) out.push([cursor, Math.min(a, w.end - 1)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < w.end - 1) out.push([cursor, w.end - 1]);
  return out.filter(([a, b]) => b > a);
}

const windowLength = (ws: [number, number][]) => ws.reduce((s, [a, b]) => s + (b - a), 0);

/** Movimento mais fraco na abertura e no fim do turno. */
function density(minute: number): number {
  if (minute < 8 * 60 + 30) return 0.6;
  if (minute > 16 * 60 + 30) return 0.7;
  return 1;
}

function sampleMinutes(rng: Rng, ws: [number, number][], n: number): number[] {
  const total = windowLength(ws);
  const out: number[] = [];
  if (total <= 0) return out;
  let guard = n * 40 + 100;
  while (out.length < n && guard-- > 0) {
    let u = rng.next() * total;
    let minute = ws[ws.length - 1]![1];
    for (const [a, b] of ws) {
      if (u < b - a) {
        minute = a + u;
        break;
      }
      u -= b - a;
    }
    if (rng.next() <= density(minute)) out.push(minute);
  }
  return out;
}

function pickQty(rng: Rng, weights: readonly number[]): number {
  return rng.weighted(weights.map((weight, i) => ({ item: i + 1, weight })));
}

function makeItems(rng: Rng, plan: DayPlan): OrderItem[] {
  const mixed = rng.chance(plan.mixedShare);
  const catalog = plan.combos
    ? CATALOG.map((c) => ({ item: c, weight: c.sku.endsWith('MASC-BRA') ? c.weight * 0.25 : c.weight }))
    : CATALOG.map((c) => ({ item: c, weight: c.weight }));

  if (!mixed) {
    const c = rng.weighted(catalog);
    return [{ sku: c.sku, quantity: pickQty(rng, c.qty) }];
  }
  if (plan.combos && rng.chance(0.75)) {
    const combo = rng.weighted(COMBOS.map((c) => ({ item: c, weight: c.weight })));
    return combo.items.map(([sku, qty]) => ({ sku, quantity: pickQty(rng, qty) }));
  }
  const first = rng.weighted(catalog);
  let second = rng.weighted(catalog);
  for (let i = 0; i < 8 && second.sku === first.sku; i++) second = rng.weighted(catalog);
  const items: OrderItem[] = [
    { sku: first.sku, quantity: pickQty(rng, first.qty) },
    { sku: second.sku, quantity: pickQty(rng, second.qty) },
  ];
  if (rng.chance(0.03)) {
    const third = rng.weighted(catalog);
    if (!items.some((i) => i.sku === third.sku)) items.push({ sku: third.sku, quantity: 1 });
  }
  return items;
}

export function generateDay(day: DayKey): DayEvents {
  const plan = planDay(day);
  if (!plan.worked) return { day, scans: [], access: [] };

  const rng = createRng(hashString(`events:${day}`));
  const eligible = rng.shuffle(ROSTER.filter((r) => r.from <= day && day <= r.until));
  const crewSize = Math.min(plan.crew, eligible.length);
  const crewEntries = eligible.slice(0, crewSize);
  const spare = eligible.slice(crewSize);
  const stations = rng.shuffle(STATIONS);

  const workers: Worker[] = crewEntries.map((entry, i) => ({
    entry,
    station: stations[i]!,
    start: plan.shiftStart + rng.int(-5, 10) + rng.next(),
    end: plan.shiftEnd + rng.int(-5, 10) + rng.next(),
    startsByHandover: false,
    endsByHandover: false,
    breaks: plan.lunch ? [[13 * 60 + rng.int(-10, 15), 0]] : [],
    move: null,
    speed: entry.speed,
  }));
  for (const w of workers) if (w.breaks[0]) w.breaks[0][1] = w.breaks[0][0] + 60;

  // alguém fica mais de 60 min sem bipar, sem sair da bancada (vira "ausente")
  if (plan.lunch && rng.chance(0.55)) {
    const w = rng.pick(workers);
    const from = rng.int(9 * 60 + 20, 11 * 60 + 10);
    w.breaks.push([from, from + rng.int(68, 95)]);
  }

  // troca de bancada ocasional
  const free = STATIONS.filter((s) => !workers.some((w) => w.station === s));
  for (const w of workers) {
    if (free.length && plan.lunch && rng.chance(0.2)) {
      const at = rng.int(9 * 60 + 30, 11 * 60) + rng.next();
      w.move = { at, to: free.shift()! };
      w.breaks.push([at, at + 1.5]);
    }
  }

  // troca de turno: A sai e B assume a mesma bancada
  if (plan.lunch && spare.length && workers.length >= 3 && rng.chance(0.15)) {
    const a = workers.find((w) => !w.move);
    if (a) {
      const at = rng.int(14 * 60 + 30, 16 * 60 + 30) + rng.next();
      const bEntry = spare[0]!;
      a.end = at;
      a.endsByHandover = true;
      workers.push({
        entry: bEntry,
        station: a.station,
        start: at,
        end: plan.shiftEnd + rng.int(-5, 10) + rng.next(),
        startsByHandover: true,
        endsByHandover: false,
        breaks: [],
        move: null,
        speed: bEntry.speed,
      });
    }
  }

  const access: Omit<AccessEvent, 'id'>[] = [];
  const dayStartMs = atTime(day, 0).getTime();
  const iso = (minute: number) => new Date(dayStartMs + Math.round(minute * MIN)).toISOString();
  const pushAccess = (minute: number, station: string, prev: string | null, next: string | null, reason: string) =>
    access.push({ at: iso(minute), station, previousOperatorId: prev, nextOperatorId: next, reason });

  const weights = workers.map((w) => w.speed * windowLength(workWindows(w)));
  const weightSum = weights.reduce((s, x) => s + x, 0) || 1;
  const target = Math.round(plan.target * (0.97 + rng.next() * 0.06));

  const scans: Omit<ScanEvent, 'id' | 'trackingCode' | 'orderNumber'>[] = [];
  workers.forEach((w, idx) => {
    const id = w.entry.id;
    if (!w.startsByHandover) pushAccess(w.start, w.station, null, id, 'Login Inicial / Abertura de Tela');
    if (w.move) {
      pushAccess(w.move.at, w.station, id, null, 'Troca de bancada');
      pushAccess(w.move.at + 0.5 + rng.next() * 0.5, w.move.to, null, id, 'Troca de bancada');
    }
    if (!w.endsByHandover) pushAccess(w.end, w.move ? w.move.to : w.station, id, null, 'Fim do turno');
    else {
      const next = workers.find((o) => o.startsByHandover && o.station === w.station);
      if (next) pushAccess(w.end, w.station, id, next.entry.id, 'Troca de turno');
    }

    const n = Math.round((target * (weights[idx] ?? 0)) / weightSum);
    for (const minute of sampleMinutes(rng, workWindows(w), n)) {
      const station = w.move && minute > w.move.at ? w.move.to : w.station;
      scans.push({
        operatorId: id,
        at: iso(minute + rng.next() / 60),
        orderCount: 1,
        station,
        items: makeItems(rng, plan),
      });
    }
  });

  const compact = day.replace(/-/g, '');
  const yymmdd = compact.slice(2);
  scans.sort((a, b) => a.at.localeCompare(b.at));
  access.sort((a, b) => a.at.localeCompare(b.at));

  return {
    day,
    scans: scans.map((s, i) => ({
      ...s,
      id: `${compact}${String(i + 1).padStart(5, '0')}`,
      trackingCode: `BR${compact}${String(i + 1).padStart(5, '0')}${rng.int(100, 999)}`,
      orderNumber: `${yymmdd}${rng.int(10_000_000, 99_999_999)}`,
    })),
    access: access.map((a, i) => ({ ...a, id: `${compact}${String(i + 1).padStart(3, '0')}` })),
  };
}
