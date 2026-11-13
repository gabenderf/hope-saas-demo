import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withUndo } from '../assemble/undo';
import type { Actor, LiveEvent } from '../types';
import { ACCESS_DENIED_MESSAGE, DataLoadError, OUT_OF_RANGE_MESSAGE, ReadOnlyError, WriteError } from './errors';
import { FakeDb } from './fake-db';
import { createSupabaseSourceWith } from './source';

const NOW = new Date('2026-11-05T15:00:00.000Z'); // 12:00 em SP, dia 2026-11-05
const ACTOR: Actor = { id: 'u1', name: 'Teste' };

function setup(canWrite = true) {
  const db = new FakeDb();
  db.tables.operadores_metas.push(
    { id_operador: 'op-a', nome_colaborador: 'Operador A', meta_horaria: 35, status: 'ativo' },
    { id_operador: 'op-b', nome_colaborador: 'Operador B', meta_horaria: 30, status: 'ativo' },
  );
  db.tables.configuracoes_gerais.push({ id: 1, meta_horaria_global: null, atualizado_em: null });
  const src = createSupabaseSourceWith({
    port: db,
    scope: 'https://teste.supabase.co',
    storage: null,
    now: () => NOW,
    network: { isOnline: () => true, target: null },
    canWrite,
  });
  const events: LiveEvent[] = [];
  src.subscribe((e) => events.push(e));
  return { db, src, events };
}

const types = (events: LiveEvent[]) => events.map((e) => e.type);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('gravação: capabilities e trava', () => {
  it('canWrite liga write e goalSchedule, e nada de auditoria nem usuários', () => {
    expect(setup(true).src.capabilities).toEqual({ write: true, audit: true, realtime: true, goalSchedule: true, userManagement: true });
    expect(setup(false).src.capabilities).toEqual({ write: false, audit: false, realtime: true, goalSchedule: false, userManagement: false });
  });

  it('padrão sem canWrite é somente leitura', () => {
    const src = createSupabaseSourceWith({ port: new FakeDb(), scope: 's', storage: null });
    expect(src.capabilities.write).toBe(false);
  });

  it('canWrite false: nenhuma gravação chega ao banco, nem a conferência de sessão', async () => {
    const { db, src } = setup(false);
    const calls: Promise<unknown>[] = [
      src.setGlobalGoal(40, ACTOR),
      src.setIndividualGoals(['op-a'], 40, ACTOR),
      src.saveOperator({ id: 'op-a', name: 'X', individualGoal: 40 }, ACTOR),
      src.saveOperator({ id: 'novo', name: 'Novo', individualGoal: 40 }, ACTOR),
      src.setOperatorRegistration('op-a', 'inativo', ACTOR),
      src.setGoalSchedule('2026-11-10', 40, ACTOR),
      withUndo(() => src.setGoalSchedule('2026-11-10', null, ACTOR), { restoreAbsent: true }),
    ];
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
    expect(db.sessionChecks).toBe(0);
    expect(db.tables.configuracoes_gerais[0]!.meta_horaria_global).toBeNull();
  });

  it('sem sessão de login: ReadOnlyError e nenhuma gravação', async () => {
    const { db, src } = setup(true);
    db.session = false;
    await expect(src.setGlobalGoal(40, ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(src.setOperatorRegistration('op-a', 'inativo', ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
  });
});

describe('gravação: meta global', () => {
  it('atualiza id 1 com meta e carimbo, e avisa os ouvintes com a config nova', async () => {
    const { db, src, events } = setup();
    await src.setGlobalGoal(42, ACTOR);
    expect(db.writes).toEqual([
      {
        table: 'configuracoes_gerais',
        action: 'update',
        values: { meta_horaria_global: 42, atualizado_em: NOW.toISOString() },
        eq: { column: 'id', value: 1 },
        undo: false,
      },
    ]);
    const changed = events.find((e) => e.type === 'config-changed');
    expect(changed).toMatchObject({ config: { globalGoal: 42, updatedAt: NOW.toISOString() } });
  });

  it('remover (null) grava null', async () => {
    const { db, src } = setup();
    await src.setGlobalGoal(null, ACTOR);
    expect(db.writes[0]!.values).toMatchObject({ meta_horaria_global: null });
  });

  it('valida de 1 a 300, inteiro, antes de tocar no banco', async () => {
    const { db, src } = setup();
    for (const bad of [0, 301, -3, 1.5, Number.NaN]) {
      await expect(src.setGlobalGoal(bad, ACTOR)).rejects.toThrow('Meta inválida');
    }
    await expect(src.setGlobalGoal(300, ACTOR)).resolves.toBeUndefined();
    expect(db.writes).toHaveLength(1);
    expect(db.sessionChecks).toBe(1);
  });

  it('desfazer leva o cabeçalho; sem withUndo, não', async () => {
    const { db, src } = setup();
    await src.setGlobalGoal(40, ACTOR);
    await withUndo(() => src.setGlobalGoal(35, ACTOR));
    expect(db.writes.map((w) => w.undo)).toEqual([false, true]);
  });

  it('0 linhas afetadas (RLS) vira a mensagem de acesso', async () => {
    const { db, src, events } = setup();
    db.rlsBlocksWrites = true;
    const err = await src.setGlobalGoal(40, ACTOR).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteError);
    expect((err as Error).message).toBe(ACCESS_DENIED_MESSAGE);
    expect(types(events)).not.toContain('config-changed');
  });

  it('erros do banco são traduzidos', async () => {
    const { db, src } = setup();
    db.writeError = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(src.setGlobalGoal(40, ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
    db.writeError = { code: '23514', message: 'violates check constraint' };
    await expect(src.setGlobalGoal(40, ACTOR)).rejects.toThrow(OUT_OF_RANGE_MESSAGE);
    db.failNext = 1;
    await expect(src.setGlobalGoal(40, ACTOR)).rejects.toBeInstanceOf(DataLoadError);
  });
});

describe('gravação: operadores', () => {
  it('setIndividualGoals: update com in() sem repetição', async () => {
    const { db, src, events } = setup();
    await src.setIndividualGoals(['op-a', 'op-b', 'op-a'], 50, ACTOR);
    expect(db.writes).toEqual([
      {
        table: 'operadores_metas',
        action: 'update',
        values: { meta_horaria: 50 },
        in: { column: 'id_operador', values: ['op-a', 'op-b'] },
        undo: false,
      },
    ]);
    expect(db.tables.operadores_metas.map((r) => r.meta_horaria)).toEqual([50, 50]);
    expect(types(events)).toContain('operators-changed');
  });

  it('setIndividualGoals: id que não existe é recusado; meta inválida nem chega ao banco', async () => {
    const { db, src } = setup();
    await expect(src.setIndividualGoals(['op-a', 'fantasma'], 50, ACTOR)).rejects.toThrow('Operador fantasma não encontrado.');
    await expect(src.setIndividualGoals(['op-a'], 0, ACTOR)).rejects.toThrow('Meta inválida');
    await expect(src.setIndividualGoals([], 40, ACTOR)).rejects.toThrow('Escolha ao menos um operador.');
    expect(db.writes).toHaveLength(1);
  });

  it('setIndividualGoals: gravação parcial avisa quantos foram e atualiza a lista antes do erro', async () => {
    const { db, src, events } = setup();
    await expect(src.setIndividualGoals(['op-a', 'fantasma'], 50, ACTOR)).rejects.toThrow('A meta foi gravada para 1 de 2 operadores.');
    expect(db.tables.operadores_metas.find((r) => r.id_operador === 'op-a')?.meta_horaria).toBe(50);
    expect(types(events)).toContain('operators-changed');
  });

  it('setIndividualGoals: RLS barra com 0 linhas', async () => {
    const { db, src } = setup();
    db.rlsBlocksWrites = true;
    await expect(src.setIndividualGoals(['op-a'], 40, ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
  });

  it('saveOperator: existente vira update de nome e meta', async () => {
    const { db, src } = setup();
    await src.saveOperator({ id: 'op-a', name: '  Ana  ', individualGoal: 45 }, ACTOR);
    expect(db.writes).toEqual([
      {
        table: 'operadores_metas',
        action: 'update',
        values: { nome_colaborador: 'Ana', meta_horaria: 45 },
        eq: { column: 'id_operador', value: 'op-a' },
        undo: false,
      },
    ]);
  });

  it('saveOperator: novo vira insert ativo', async () => {
    const { db, src, events } = setup();
    await src.saveOperator({ id: 'op-c', name: 'Carla', individualGoal: 33 }, ACTOR);
    expect(db.writes[0]).toEqual({
      table: 'operadores_metas',
      action: 'insert',
      values: { id_operador: 'op-c', nome_colaborador: 'Carla', meta_horaria: 33, status: 'ativo' },
      undo: false,
    });
    expect(types(events)).toContain('operators-changed');
    await expect(src.listOperators()).resolves.toHaveLength(3);
  });

  it('saveOperator: valida id, nome e meta', async () => {
    const { db, src } = setup();
    await expect(src.saveOperator({ id: ' ', name: 'X', individualGoal: 30 }, ACTOR)).rejects.toThrow('Informe o ID');
    await expect(src.saveOperator({ id: 'x', name: '  ', individualGoal: 30 }, ACTOR)).rejects.toThrow('Informe o nome');
    await expect(src.saveOperator({ id: 'x', name: 'X', individualGoal: 301 }, ACTOR)).rejects.toThrow('Meta inválida');
    expect(db.writes).toEqual([]);
  });

  it('saveOperator: insert barrado pelo RLS (42501)', async () => {
    const { db, src } = setup();
    db.writeError = { code: '42501', message: 'new row violates row-level security policy for table' };
    await expect(src.saveOperator({ id: 'novo', name: 'N', individualGoal: 30 }, ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
  });

  it('setOperatorRegistration: update de status, com e sem desfazer', async () => {
    const { db, src } = setup();
    await src.setOperatorRegistration('op-a', 'inativo', ACTOR);
    await withUndo(() => src.setOperatorRegistration('op-a', 'ativo', ACTOR));
    expect(db.writes).toEqual([
      { table: 'operadores_metas', action: 'update', values: { status: 'inativo' }, eq: { column: 'id_operador', value: 'op-a' }, undo: false },
      { table: 'operadores_metas', action: 'update', values: { status: 'ativo' }, eq: { column: 'id_operador', value: 'op-a' }, undo: true },
    ]);
  });

  it('setOperatorRegistration: id inexistente ou RLS dá a mensagem de acesso', async () => {
    const { src } = setup();
    await expect(src.setOperatorRegistration('fantasma', 'inativo', ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
  });

  it('cabeçalho de desfazer nas metas individuais e no cadastro', async () => {
    const { db, src } = setup();
    await withUndo(() => src.setIndividualGoals(['op-a'], 35, ACTOR));
    await withUndo(() => src.saveOperator({ id: 'op-a', name: 'A', individualGoal: 35 }, ACTOR));
    expect(db.writes.map((w) => w.undo)).toEqual([true, true]);
  });
});

describe('gravação: agenda de metas', () => {
  it('upsert por dia, com nota', async () => {
    const { db, src, events } = setup();
    await src.setGoalSchedule('2026-11-10', 44, ACTOR, '  Black Friday  ');
    expect(db.writes).toEqual([
      {
        table: 'metas_programadas',
        action: 'upsert',
        values: { dia: '2026-11-10', valor: 44, nota: 'Black Friday' },
        onConflict: 'dia',
        undo: false,
      },
    ]);
    expect(types(events)).toContain('goal-schedule-changed');
  });

  it('sem nota grava nota nula; valor nulo é "sem meta"', async () => {
    const { db, src } = setup();
    await src.setGoalSchedule('2026-11-10', null, ACTOR);
    expect(db.writes[0]!.values).toEqual({ dia: '2026-11-10', valor: null, nota: null });
  });

  it('só a partir de amanhã (fuso de São Paulo)', async () => {
    const { db, src } = setup();
    await expect(src.setGoalSchedule('2026-11-05', 40, ACTOR)).rejects.toThrow('a partir de amanhã');
    await expect(src.setGoalSchedule('2026-11-01', 40, ACTOR)).rejects.toThrow('a partir de amanhã');
    await expect(src.setGoalSchedule('2026-11-06', 40, ACTOR)).resolves.toBeUndefined();
    expect(db.writes).toHaveLength(1);
  });

  it('valida meta, dia e tamanho da nota', async () => {
    const { db, src } = setup();
    await expect(src.setGoalSchedule('2026-11-10', 301, ACTOR)).rejects.toThrow('Meta inválida');
    await expect(src.setGoalSchedule('amanhã', 40, ACTOR)).rejects.toThrow('Dia inválido');
    await expect(src.setGoalSchedule('2026-11-10', 40, ACTOR, 'x'.repeat(201))).rejects.toThrow('até 200');
    expect(db.writes).toEqual([]);
  });

  it('desfazer entrada nova (restoreAbsent) apaga a linha, com o cabeçalho', async () => {
    const { db, src, events } = setup();
    await src.setGoalSchedule('2026-11-10', 44, ACTOR);
    await withUndo(() => src.setGoalSchedule('2026-11-10', null, ACTOR), { restoreAbsent: true });
    expect(db.writes[1]).toEqual({ table: 'metas_programadas', action: 'delete', eq: { column: 'dia', value: '2026-11-10' }, undo: true });
    expect(db.tables.metas_programadas).toEqual([]);
    expect(events.filter((e) => e.type === 'goal-schedule-changed')).toHaveLength(2);
  });

  it('desfazer entrada nova: 0 linhas com a linha ainda lá é o RLS barrando, não "já não existia"', async () => {
    const { db, src } = setup();
    await src.setGoalSchedule('2026-11-10', 44, ACTOR);
    db.rlsBlocksWrites = true;
    await expect(withUndo(() => src.setGoalSchedule('2026-11-10', null, ACTOR), { restoreAbsent: true })).rejects.toThrow(ACCESS_DENIED_MESSAGE);
    expect(db.tables.metas_programadas).toHaveLength(1);
  });

  it('desfazer entrada nova que já sumiu não é erro', async () => {
    const { src } = setup();
    await expect(withUndo(() => src.setGoalSchedule('2026-11-10', null, ACTOR), { restoreAbsent: true })).resolves.toBeUndefined();
  });

  it('desfazer depois da meia-noite: a entrada que era "amanhã" ainda pode ser desfeita', async () => {
    const { db, src } = setup();
    db.tables.metas_programadas.push({ dia: '2026-11-05', valor: 44, nota: null });
    await expect(withUndo(() => src.setGoalSchedule('2026-11-05', null, ACTOR), { restoreAbsent: true })).resolves.toBeUndefined();
    expect(db.tables.metas_programadas).toEqual([]);
    // sem desfazer, hoje continua barrado
    await expect(src.setGoalSchedule('2026-11-05', 40, ACTOR)).rejects.toThrow('a partir de amanhã');
  });

  it('desfazer uma troca regrava o valor anterior com o cabeçalho', async () => {
    const { db, src } = setup();
    await withUndo(() => src.setGoalSchedule('2026-11-10', 38, ACTOR, 'antes'));
    expect(db.writes[0]).toMatchObject({ action: 'upsert', undo: true, values: { dia: '2026-11-10', valor: 38, nota: 'antes' } });
  });

  it('RLS barrando o upsert (42501) e o fora do intervalo (23514) são traduzidos', async () => {
    const { db, src } = setup();
    db.writeError = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(src.setGoalSchedule('2026-11-10', 40, ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
    db.writeError = { code: '23514', message: 'check' };
    await expect(src.setGoalSchedule('2026-11-10', 40, ACTOR)).rejects.toThrow(OUT_OF_RANGE_MESSAGE);
  });

  it('listGoalSchedule: intervalo inclusivo, ordenado, mapeado', async () => {
    const { db, src } = setup();
    db.tables.metas_programadas.push(
      { dia: '2026-11-12', valor: null, nota: null, criado_por: 'uuid-1', criado_em: '2026-11-05T10:00:00.123456+00:00' },
      { dia: '2026-11-10', valor: 44, nota: 'Black', criado_por: null, criado_em: '2026-11-04T10:00:00+00:00' },
      { dia: '2026-11-13', valor: 50, nota: null, criado_por: null, criado_em: null },
      { dia: '2026-11-09', valor: 50, nota: null, criado_por: null, criado_em: null },
    );
    const list = await src.listGoalSchedule('2026-11-10', '2026-11-12');
    expect(list).toEqual([
      { day: '2026-11-10', value: 44, note: 'Black', createdBy: { id: '', name: '' }, createdAt: '2026-11-04T10:00:00.000Z' },
      { day: '2026-11-12', value: null, createdBy: { id: 'uuid-1', name: '' }, createdAt: '2026-11-05T10:00:00.123Z' },
    ]);
    const q = db.selects.find((s) => s.table === 'metas_programadas')!;
    expect(q.order).toEqual([{ column: 'dia', ascending: true }]);
  });

  it('listGoalSchedule sem permissão de gravar não consulta o banco', async () => {
    const { db, src } = setup(false);
    await expect(src.listGoalSchedule('2026-11-10', '2026-11-12')).resolves.toEqual([]);
    expect(db.selectsOn('metas_programadas')).toBe(0);
  });

  it('falha de leitura da agenda vira DataLoadError', async () => {
    const { db, src } = setup();
    db.failNext = 1;
    await expect(src.listGoalSchedule('2026-11-10', '2026-11-12')).rejects.toBeInstanceOf(DataLoadError);
  });
});
