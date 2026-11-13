import { describe, expect, it } from 'vitest';
import type { QueueSnapshot } from '../data/types';
import { readQueue } from './queue-guard';

const snap = (rodada: string, etapa: string, total: number, status = 'ok'): QueueSnapshot => ({
  raspado_em: '2026-11-05T10:00:00Z',
  etapa,
  status,
  total_capturado: total,
  rodada,
  sub_aba: null,
});

describe('espelho do guarda da fila', () => {
  it('caso real de 27/08: escalada na mesma etapa não soma duas vezes (434, não 852)', () => {
    const r = readQueue(434, [
      snap('r1', 'para_enviar', 0),
      snap('r1', 'para_imprimir', 418, 'incompleto'),
      snap('r1', 'para_imprimir', 434),
    ]);
    expect(r.captured).toBe(434);
    expect(r.truncated).toBe(false);
  });

  it('truncamento real de 24/08: 1.160 capturados, 1.000 lidos', () => {
    const r = readQueue(1000, [snap('r1', 'para_enviar', 60), snap('r1', 'para_imprimir', 1100)]);
    expect(r.captured).toBe(1160);
    expect(r.truncated).toBe(true);
  });

  it('entre rodadas compara a maior, não a soma', () => {
    const r = readQueue(700, [
      snap('r1', 'para_imprimir', 650),
      snap('r2', 'para_imprimir', 690),
      snap('r3', 'para_enviar', 20),
      snap('r3', 'para_imprimir', 680),
    ]);
    expect(r.captured).toBe(700);
    expect(r.truncated).toBe(false);
  });

  it('ignora snapshots que não são ok nem incompleto', () => {
    const r = readQueue(10, [snap('r1', 'para_imprimir', 900, 'erro')]);
    expect(r.captured).toBe(0);
    expect(r.truncated).toBe(false);
  });

  it('sem snapshots não acusa nada', () => {
    expect(readQueue(0, []).truncated).toBe(false);
  });

  it('contagem de vistos ausente com algo capturado recusa (o coletor também)', () => {
    const r = readQueue(null, [snap('r1', 'para_imprimir', 434)]);
    expect(r.seen).toBeNull();
    expect(r.truncated).toBe(true);
    expect(r.refused).toBe(true);
  });

  it('contagem ausente sem captura não acusa nada', () => {
    expect(readQueue(null, []).refused).toBe(false);
  });

  it('pendentes acima de vistos é inconsistente e recusa', () => {
    const r = readQueue(400, [snap('r1', 'para_imprimir', 400)], 401);
    expect(r.truncated).toBe(false);
    expect(r.inconsistent).toBe(true);
    expect(r.refused).toBe(true);
  });

  it('pendentes igual a vistos passa; 418 + 434 continua 434', () => {
    const r = readQueue(434, [snap('r1', 'para_imprimir', 418, 'incompleto'), snap('r1', 'para_imprimir', 434)], 434);
    expect(r.refused).toBe(false);
    expect(r.captured).toBe(434);
  });
});
