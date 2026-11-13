import { describe, expect, it } from 'vitest';
import type { OperatorRow } from '@/data/types';
import {
  initialRotation,
  kioskQuery,
  orderOperators,
  paginate,
  resolveSettings,
  rotationReducer,
  teamGoal,
  visiblePanels,
  type PanelId,
} from './model';

const row = (name: string, orders: number, status: OperatorRow['status'] = 'ativo'): OperatorRow => ({
  id: name,
  name,
  station: null,
  status,
  awayReason: null,
  startAt: null,
  lastActivityAt: null,
  orders,
  simpleOrders: orders,
  mixedOrders: 0,
  hours: 1,
  rate: orders,
  individualGoal: 35,
  effectiveGoal: 35,
  goalSource: 'individual',
  goalRatio: orders / 35,
});

const all: PanelId[] = ['agora', 'operadores', 'hora', 'previsao'];

describe('rodízio', () => {
  it('avança e volta em círculo', () => {
    let s = initialRotation(all, true);
    s = rotationReducer(s, { type: 'next' });
    expect(s.current).toBe('operadores');
    s = rotationReducer(s, { type: 'prev' });
    s = rotationReducer(s, { type: 'prev' });
    expect(s.current).toBe('previsao');
    s = rotationReducer(s, { type: 'next' });
    expect(s.current).toBe('agora');
  });
  it('pula a previsão quando não há resumo', () => {
    expect(visiblePanels(all, false)).toEqual(['agora', 'operadores', 'hora']);
    let s = initialRotation(all, false);
    for (let i = 0; i < 3; i++) s = rotationReducer(s, { type: 'next' });
    expect(s.current).toBe('agora');
  });
  it('previsão que some enquanto aparece sai para o painel seguinte', () => {
    let s = initialRotation(all, true);
    s = rotationReducer(s, { type: 'prev' });
    expect(s.current).toBe('previsao');
    s = rotationReducer(s, { type: 'set-forecast', available: false });
    expect(s.current).toBe('agora');
  });
  it('respeita painéis desligados e nunca fica sem painel', () => {
    let s = initialRotation(['hora', 'agora'], true);
    expect(visiblePanels(s.enabled, true)).toEqual(['agora', 'hora']);
    s = rotationReducer(s, { type: 'set-enabled', panels: ['previsao'] });
    expect(s.current).toBe('previsao');
    s = rotationReducer(s, { type: 'set-forecast', available: false });
    expect(s.current).toBe('agora');
    expect(visiblePanels(s.enabled, false)).toEqual(['agora']);
  });
  it('desligar o painel atual leva ao próximo ligado', () => {
    let s = initialRotation(all, true);
    s = rotationReducer(s, { type: 'next' });
    s = rotationReducer(s, { type: 'set-enabled', panels: ['agora', 'hora'] });
    expect(s.current).toBe('hora');
  });
  it('pausa e continua sem mudar de painel', () => {
    let s = initialRotation(all, true);
    s = rotationReducer(s, { type: 'pause' });
    expect(s.paused).toBe(true);
    s = rotationReducer(s, { type: 'toggle-pause' });
    expect(s.paused).toBe(false);
    expect(s.current).toBe('agora');
  });
});

describe('configuração de quiosque', () => {
  it('lê a URL e limita o intervalo', () => {
    const s = resolveSettings(new URLSearchParams('paineis=hora,agora&intervalo=5&privacidade=sem-ranking'), null);
    expect(s).toEqual({ panels: ['agora', 'hora'], intervalSec: 10, privacy: 'sem-ranking' });
  });
  it('valor inválido cai no salvo e depois no padrão', () => {
    const s = resolveSettings(new URLSearchParams('paineis=xx&intervalo=abc&privacidade=zz'), { intervalSec: 30, privacy: 'so-equipe' });
    expect(s.panels).toHaveLength(4);
    expect(s.intervalSec).toBe(30);
    expect(s.privacy).toBe('so-equipe');
  });
  it('gera a URL de quiosque', () => {
    expect(kioskQuery({ panels: ['agora', 'hora'], intervalSec: 25, privacy: 'completo' })).toBe(
      'paineis=agora,hora&intervalo=25&privacidade=completo',
    );
  });
});

describe('privacidade', () => {
  const rows = [row('Bia', 50), row('Ana', 80), row('Caio', 80), row('Dora', 0, 'inativo')];
  it('completo ordena por pedidos e depois pelo nome', () => {
    expect(orderOperators(rows, 'completo').map((r) => r.name)).toEqual(['Ana', 'Caio', 'Bia']);
  });
  it('sem-ranking ordena por nome', () => {
    expect(orderOperators(rows, 'sem-ranking').map((r) => r.name)).toEqual(['Ana', 'Bia', 'Caio']);
  });
  it('so-equipe não mostra ninguém', () => {
    expect(orderOperators(rows, 'so-equipe')).toEqual([]);
  });
  it('pagina de 10 em 10', () => {
    const pages = paginate(Array.from({ length: 23 }, (_, i) => i));
    expect(pages.map((p) => p.length)).toEqual([10, 10, 3]);
  });
});

describe('teamGoal', () => {
  const op = (effectiveGoal: number, status: string) => ({ effectiveGoal, status }) as unknown as OperatorRow;
  it('usa a meta global quando existe', () => {
    expect(teamGoal([op(30, 'ok')], 50)).toBe(50);
  });
  it('média das metas de quem não está inativo', () => {
    expect(teamGoal([op(30, 'ok'), op(50, 'ok'), op(999, 'inativo')], null)).toBe(40);
  });
});
