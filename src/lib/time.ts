/**
 * Tempo e dia operacional, SEMPRE no fuso de São Paulo.
 *
 * O app antigo misturava fuso local e UTC (o relatório agrupava por
 * data_hora.split('T')[0], que é o dia UTC). Na nuvem o servidor roda em UTC
 * e a TV do galpão pode estar com relógio errado, então nada aqui depende do
 * fuso do navegador.
 */
import { TZDate } from '@date-fns/tz';

export const TIME_ZONE = 'America/Sao_Paulo';

/** Dia operacional no formato 'YYYY-MM-DD' (fuso de São Paulo). */
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

/** Converte qualquer instante para um TZDate em São Paulo (getHours etc. já no fuso certo). */
export function zoned(input: Date | string | number): TZDate {
  const ms = typeof input === 'string' ? Date.parse(input) : input instanceof Date ? input.getTime() : input;
  return new TZDate(ms, TIME_ZONE);
}

export function dayKeyOf(input: Date | string | number): DayKey {
  const d = zoned(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date): DayKey {
  return dayKeyOf(now);
}

function parts(day: DayKey): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`DayKey inválido: ${day}`);
  return [y, m, d];
}

/** Instante (Date absoluto) de hh:mm do dia operacional. */
export function atTime(day: DayKey, hours: number, minutes = 0): Date {
  const [y, m, d] = parts(day);
  return new Date(new TZDate(y, m - 1, d, hours, minutes, 0, 0, TIME_ZONE).getTime());
}

/** Início (inclusive) e fim (exclusivo) do dia operacional, em instantes absolutos. */
export function dayBounds(day: DayKey): { start: Date; end: Date } {
  return { start: atTime(day, 0), end: atTime(addDays(day, 1), 0) };
}

export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = parts(day);
  // meio-dia evita qualquer surpresa de horário de verão
  const t = new TZDate(y, m - 1, d + n, 12, 0, 0, 0, TIME_ZONE);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(day: DayKey): number {
  const [y, m, d] = parts(day);
  return new TZDate(y, m - 1, d, 12, 0, 0, 0, TIME_ZONE).getDay();
}

export function isWeekend(day: DayKey): boolean {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
}

export function hourOf(input: Date | string | number): number {
  return zoned(input).getHours();
}

/** Minutos desde a meia-noite (São Paulo). */
export function minutesOfDay(input: Date | string | number): number {
  const d = zoned(input);
  return d.getHours() * 60 + d.getMinutes();
}

/** Lista de dias de `from` a `to`, inclusive. */
export function daysBetween(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
