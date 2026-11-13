import { describe, expect, it } from 'vitest';
import { lastGlobalGoalChange, nextBusinessDays, parseGoal } from './logic';

describe('parseGoal', () => {
  it('aceita inteiro de 1 a 200', () => {
    expect(parseGoal(' 40 ')).toEqual({ ok: true, value: 40 });
    expect(parseGoal('1').ok).toBe(true);
    expect(parseGoal('200').ok).toBe(true);
  });
  it('recusa fora da faixa, decimal, vazio e texto', () => {
    for (const t of ['0', '201', '35,5', '35.5', '', 'abc', '-3']) expect(parseGoal(t).ok).toBe(false);
  });
});

describe('nextBusinessDays', () => {
  it('pula fim de semana e marca feriado parado', () => {
    const days = nextBusinessDays('2026-11-05', 15);
    expect(days).toHaveLength(15);
    expect(days[0]!.day).toBe('2026-11-06');
    expect(days[1]!.day).toBe('2026-11-09');
    const fer = days.find((d) => d.day === '2026-11-20');
    expect(fer?.holiday?.name).toBe('Consciência Negra');
    expect(fer?.stopped).toBe(true);
    expect(days.find((d) => d.day === '2026-11-07')).toBeUndefined();
  });
});

describe('lastGlobalGoalChange', () => {
  it('pega o mais recente de meta global', () => {
    const r = lastGlobalGoalChange([
      { action: 'meta-global.definir', at: '2026-11-03T10:00:00Z' },
      { action: 'operador.criar', at: '2026-11-05T10:00:00Z' },
      { action: 'meta-global.remover', at: '2026-11-04T10:00:00Z' },
    ]);
    expect(r?.action).toBe('meta-global.remover');
    expect(lastGlobalGoalChange([])).toBeNull();
  });
});
