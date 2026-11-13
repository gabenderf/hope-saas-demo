import { describe, expect, it } from 'vitest';
import type { ActivityItem } from '@/data/types';
import { filterActivity, groupByHour } from './filters';

const item = (id: string, at: string, over: Partial<ActivityItem> = {}): ActivityItem => ({
  id, at, kind: 'bipe', operatorId: '1', operatorName: 'Ana', station: '01', ...over,
});
const items = [
  item('a', '2026-11-05T17:30:00Z'),
  item('b', '2026-11-05T17:10:00Z', { kind: 'entrada', operatorId: '2', station: '02' }),
  item('c', '2026-11-05T16:50:00Z', { kind: 'saida', operatorId: '1' }),
];

describe('filtros da Atividade', () => {
  it('separa bipes de entradas e saídas', () => {
    expect(filterActivity(items, { kind: 'bipes', operatorId: '', station: '' }).map((i) => i.id)).toEqual(['a']);
    expect(filterActivity(items, { kind: 'acessos', operatorId: '', station: '' }).map((i) => i.id)).toEqual(['b', 'c']);
  });
  it('filtra por operador e bancada', () => {
    expect(filterActivity(items, { kind: 'todos', operatorId: '1', station: '' }).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterActivity(items, { kind: 'todos', operatorId: '', station: '02' }).map((i) => i.id)).toEqual(['b']);
  });
  it('agrupa por hora de São Paulo', () => {
    const g = groupByHour(items);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['14h', 2], ['13h', 1]]);
  });
});
