import { describe, expect, it } from 'vitest';
import {
  firstName,
  formatDateTime,
  formatDayLong,
  formatDayShort,
  formatDayWithWeekday,
  formatDec1,
  formatInt,
  formatRate,
  formatRatio,
  formatRelative,
  formatSignedPercent,
  formatSignedPoints,
  formatTime,
  initials,
} from './format';

describe('formatação pt-BR', () => {
  it('ritmo com vírgula e /h', () => {
    expect(formatRate(37.14)).toBe('37,1/h');
    expect(formatRate(40)).toBe('40,0/h');
    expect(formatRate(null)).toBe('sem dado');
    expect(formatRate(undefined)).toBe('sem dado');
  });

  it('inteiros com separador de milhar', () => {
    expect(formatInt(1234)).toBe('1.234');
    expect(formatInt(1345.4)).toBe('1.345');
    expect(formatDec1(2.25)).toMatch(/^2,[23]$/);
  });

  it('razão em porcentagem inteira', () => {
    expect(formatRatio(0.931)).toBe('93%');
    expect(formatRatio(null)).toBe('sem dado');
  });

  it('variação com sinal explícito para positivos', () => {
    expect(formatSignedPercent(12.4)).toBe('+12,4%');
    expect(formatSignedPercent(-3)).toMatch(/^[-−]3,0%$/);
    expect(formatSignedPercent(0)).toBe('0,0%');
    expect(formatSignedPoints(0.4)).toBe('+0,4 p.p.');
  });

  it('horário no fuso de São Paulo', () => {
    expect(formatTime('2026-11-05T17:20:00Z')).toBe('14:20');
    expect(formatTime('2026-11-05T02:30:00Z')).toBe('23:30');
    expect(formatDateTime('2026-11-05T17:20:00Z')).toBe('05/11 14:20');
  });

  it('datas curtas e longas', () => {
    expect(formatDayShort('2026-11-05')).toBe('05/11');
    expect(formatDayLong('2026-11-05')).toBe('quinta-feira, 5 de novembro');
  });

  // Em pt-BR o EEE do date-fns devolve "quinta"; a abreviação de 3 letras é EEEEEE.
  it('dia da semana abreviado com 3 letras', () => {
    expect(formatDayWithWeekday('2026-11-05')).toBe('qui 05/11');
    expect(formatDayWithWeekday('2026-11-07')).toBe('sáb 07/11');
  });

  it('tempo relativo', () => {
    const now = new Date('2026-11-05T17:20:00Z');
    expect(formatRelative('2026-11-05T17:19:20Z', now)).toBe('há 40 s');
    expect(formatRelative('2026-11-05T17:17:00Z', now)).toBe('há 3 min');
    expect(formatRelative('2026-11-05T15:20:00Z', now)).toBe('há 2 h');
    expect(formatRelative('2026-11-02T12:12:00Z', now)).toBe('02/11 09:12');
    expect(formatRelative('2026-11-05T17:30:00Z', now)).toBe('há 0 s');
  });

  it('iniciais e primeiro nome', () => {
    expect(initials('Larissa Mendonça')).toBe('LM');
    expect(initials('  carlos  eduardo  lima ')).toBe('CE');
    expect(initials('Gabriel')).toBe('G');
    expect(firstName('Larissa Mendonça')).toBe('Larissa');
  });

  it('nunca produz travessão nem meia-risca', () => {
    const samples = [
      formatRate(null),
      formatSignedPercent(-12.5),
      formatSignedPoints(-1.2),
      formatDayLong('2026-11-05'),
      formatDayWithWeekday('2026-11-05'),
      formatRelative('2026-11-02T12:12:00Z', new Date('2026-11-05T17:20:00Z')),
    ];
    const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    for (const s of samples) expect(s).not.toMatch(dashes);
  });
});
