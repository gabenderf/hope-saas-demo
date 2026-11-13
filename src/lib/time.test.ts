import { describe, expect, it } from 'vitest';
import {
  addDays,
  atTime,
  compareDayKeys,
  dayBounds,
  dayKeyOf,
  daysBetween,
  hourOf,
  isWeekend,
  minutesOfDay,
  todayKey,
  weekdayOf,
} from './time';

describe('dia operacional de São Paulo', () => {
  it('2026-11-05T02:30Z ainda é dia 04 em São Paulo (21h30)', () => {
    expect(dayKeyOf('2026-11-05T02:30:00Z')).toBe('2026-11-04');
  });

  it('a virada acontece às 03:00 UTC', () => {
    expect(dayKeyOf('2026-11-05T02:59:59Z')).toBe('2026-11-04');
    expect(dayKeyOf('2026-11-05T03:00:00Z')).toBe('2026-11-05');
  });

  it('aceita Date e número', () => {
    expect(dayKeyOf(new Date('2026-11-05T02:30:00Z'))).toBe('2026-11-04');
    expect(dayKeyOf(Date.parse('2026-11-05T12:00:00Z'))).toBe('2026-11-05');
    expect(todayKey(new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-04');
  });

  it('atTime devolve o instante absoluto certo (UTC-3)', () => {
    expect(atTime('2026-11-04', 23, 30).toISOString()).toBe('2026-11-05T02:30:00.000Z');
    expect(atTime('2026-11-05', 7, 40).toISOString()).toBe('2026-11-05T10:40:00.000Z');
  });

  it('dayBounds cobre 24 h, fim exclusivo', () => {
    const { start, end } = dayBounds('2026-11-05');
    expect(start.toISOString()).toBe('2026-11-05T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-06T03:00:00.000Z');
  });

  it('addDays atravessa mês e ano', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-05', -7)).toBe('2026-10-29');
  });

  it('dia da semana e fim de semana', () => {
    expect(weekdayOf('2026-11-05')).toBe(4);
    expect(weekdayOf('2026-09-05')).toBe(6);
    expect(isWeekend('2026-09-05')).toBe(true);
    expect(isWeekend('2026-09-06')).toBe(true);
    expect(isWeekend('2026-09-07')).toBe(false);
  });

  it('hora e minutos do dia no fuso certo', () => {
    expect(hourOf('2026-11-05T02:30:00Z')).toBe(23);
    expect(minutesOfDay('2026-11-05T17:20:00Z')).toBe(14 * 60 + 20);
  });

  it('daysBetween é inclusivo e compareDayKeys ordena', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysBetween('2026-11-02', '2026-11-02')).toEqual(['2026-11-02']);
    expect(daysBetween('2026-11-03', '2026-11-02')).toEqual([]);
    expect(compareDayKeys('2026-11-01', '2026-11-02')).toBe(-1);
    expect(compareDayKeys('2026-11-02', '2026-11-02')).toBe(0);
    expect(compareDayKeys('2026-11-03', '2026-11-02')).toBe(1);
  });

  it('rejeita DayKey inválido', () => {
    expect(() => atTime('ontem', 8)).toThrow();
  });
});
