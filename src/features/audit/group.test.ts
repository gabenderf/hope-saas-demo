import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@/data/types';
import { filterEntries, groupByDay, groupOfAction, uniqueActors } from './group';

const e = (id: string, at: string, action: AuditEntry['action'], actor = 'ana', summary = 'fez algo'): AuditEntry => ({
  id,
  at,
  action,
  summary,
  actor: { id: actor, name: actor.toUpperCase() },
});

const entries = [
  e('1', '2026-11-05T15:00:00Z', 'meta-global.definir', 'ana', 'alterou a meta global para 40/h'),
  e('2', '2026-11-05T17:00:00Z', 'operador.criar', 'bia'),
  e('3', '2026-11-04T15:00:00Z', 'usuario.convidar', 'ana'),
  e('4', '2026-11-02T15:00:00Z', 'previsao.equipe', 'bia'),
];

describe('groupByDay', () => {
  it('rotula Hoje, Ontem e dia da semana, do mais novo ao mais antigo', () => {
    const g = groupByDay(entries, '2026-11-05');
    expect(g.map((x) => x.label)).toEqual(['Hoje', 'Ontem', expect.stringMatching(/02\/11/)]);
    expect(g[0]!.entries.map((x) => x.id)).toEqual(['2', '1']);
  });
  it('lista vazia não gera grupo', () => {
    expect(groupByDay([], '2026-11-05')).toEqual([]);
  });
});

describe('filterEntries', () => {
  const base = { group: 'todos', actorId: 'todos', period: 'tudo', query: '' } as const;
  it('por tipo de ação', () => {
    expect(filterEntries(entries, { ...base, group: 'metas' }, '2026-11-05').map((x) => x.id)).toEqual(['1']);
    expect(groupOfAction('desfazer')).toBeNull();
  });
  it('por autor', () => {
    expect(filterEntries(entries, { ...base, actorId: 'bia' }, '2026-11-05')).toHaveLength(2);
  });
  it('por período', () => {
    expect(filterEntries(entries, { ...base, period: 'hoje' }, '2026-11-05')).toHaveLength(2);
    expect(filterEntries(entries, { ...base, period: '7d' }, '2026-11-05')).toHaveLength(4);
  });
  it('busca ignora acento e caixa', () => {
    expect(filterEntries(entries, { ...base, query: 'META GLOBAL' }, '2026-11-05')).toHaveLength(1);
  });
  it('autores únicos ordenados', () => {
    expect(uniqueActors(entries).map((a) => a.id)).toEqual(['ana', 'bia']);
  });
});
