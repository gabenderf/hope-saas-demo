import { describe, expect, it } from 'vitest';
import { alertsFor } from './alerts';
import type { ForecastSummary } from './public';

const base: ForecastSummary = {
  day: '2026-11-05',
  mandatoryPending: 100,
  mandatoryInitial: 640,
  projectedFinishAt: '2026-11-05T15:00:00Z',
  deadlineAt: '2026-11-05T20:40:00Z',
  requiredRate: 35,
  currentRate: 38,
  aheadPending: 300,
  lastCollectionAt: null,
  collectionsToday: 5,
  truncatedQueue: false,
  status: 'ok',
  atRisk: false,
};

describe('alertas da Previsão', () => {
  it('sem alertas quando está tudo certo', () => {
    expect(alertsFor(base)).toEqual([]);
  });
  it('sem coleta de dados é crítico, com chave por dia', () => {
    const [a] = alertsFor({ ...base, status: 'sem-coleta' });
    expect(a?.rule).toBe('sem-coleta-dados');
    expect(a?.severity).toBe('critico');
    expect(a?.dedupeKey).toContain('2026-11-05');
    expect(a?.href).toBe('/expedicao/previsao');
  });
  it('fila incompleta é atenção', () => {
    expect(alertsFor({ ...base, truncatedQueue: true, status: 'atencao' }).map((x) => x.rule)).toEqual(['fila-incompleta']);
  });
  it('obrigatório que termina depois do turno ou não fecha', () => {
    expect(alertsFor({ ...base, projectedFinishAt: '2026-11-05T21:00:00Z', atRisk: true, status: 'atencao' }).map((x) => x.rule)).toEqual(['obrigatorio-em-risco']);
    expect(alertsFor({ ...base, projectedFinishAt: null, atRisk: true, status: 'atencao' }).map((x) => x.rule)).toEqual(['obrigatorio-em-risco']);
  });
  it('falta de capacidade com término dentro do turno também alerta (mesma decisão do status)', () => {
    expect(alertsFor({ ...base, atRisk: true, status: 'atencao' }).map((x) => x.rule)).toEqual(['obrigatorio-em-risco']);
  });
  it('status atencao por risco nunca fica sem alerta', () => {
    expect(alertsFor({ ...base, status: 'atencao', atRisk: true }).length).toBeGreaterThan(0);
  });
});
