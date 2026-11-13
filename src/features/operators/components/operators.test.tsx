import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OperatorRow } from '@/data/types';
import { DEFAULT_SORTING, buildOperatorColumns } from './columns';
import { parseGoal } from './goal';
import { filterOperatorRows, mergeOperatorRows } from './rows';

const gate = vi.hoisted(() => ({ value: { allowed: true, reason: null as 'perfil' | null, message: null as string | null } }));
const toastFn = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn());

vi.mock('@/data/hooks', () => ({
  useWriteGate: () => gate.value,
  useSetIndividualGoals: () => ({ mutateAsync: mutate, isPending: false }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: Object.assign(toastFn, { undoable: vi.fn(), error: vi.fn(), success: vi.fn() }) }));

import { GoalCell } from './GoalCell';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  gate.value = { allowed: true, reason: null, message: null };
});

const row = (over: Partial<OperatorRow>): OperatorRow => ({
  id: '1', name: 'Ana', station: '01', status: 'ativo', awayReason: null, startAt: null, lastActivityAt: null,
  orders: 10, simpleOrders: 8, mixedOrders: 2, hours: 1, rate: 10, individualGoal: 35, effectiveGoal: 35, goalSource: 'individual', goalRatio: 0.3, ...over,
});

describe('colunas e ordenação', () => {
  it('monta as colunas na ordem do brief, com Início só em hoje', () => {
    const ids = (showStart: boolean) => buildOperatorColumns({ showStart, editableGoal: false }).map((c) => c.id);
    expect(ids(true)).toEqual(['name', 'station', 'orders', 'mixed', 'rate', 'goal', 'ratio', 'start', 'status']);
    expect(ids(false)).not.toContain('start');
  });
  it('ordena por ritmo decrescente por padrão', () => {
    expect(DEFAULT_SORTING).toEqual([{ id: 'rate', desc: true }]);
  });
});

describe('meta', () => {
  it('valida inteiro de 1 a 200', () => {
    expect(parseGoal('40')).toEqual({ ok: true, value: 40 });
    expect(parseGoal('0').ok).toBe(false);
    expect(parseGoal('201').ok).toBe(false);
    expect(parseGoal('3,5').ok).toBe(false);
    expect(parseGoal('').ok).toBe(false);
  });
  it('sem permissão, o clique explica e não abre edição', async () => {
    gate.value = { allowed: false, reason: 'perfil', message: 'Seu perfil é Leitura.' };
    render(<GoalCell operatorId="1" operatorName="Ana" value={35} overridden={false} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(btn);
    expect(toastFn).toHaveBeenCalledWith('Seu perfil é Leitura.');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('com permissão, abre o campo de edição', async () => {
    render(<GoalCell operatorId="1" operatorName="Ana" value={35} overridden={false} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toHaveValue('35');
  });
});

describe('linhas de operadores', () => {
  it('lista todo o cadastro e esconde inativos por padrão', () => {
    const merged = mergeOperatorRows(
      [
        { id: '1', name: 'Ana', individualGoal: 35, registration: 'ativo' },
        { id: '2', name: 'Bia', individualGoal: 30, registration: 'inativo' },
      ],
      [row({})],
      40,
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ status: 'inativo', effectiveGoal: 40, goalSource: 'global' });
    expect(filterOperatorRows(merged, { query: '', status: 'todos', showInactive: false })).toHaveLength(1);
    expect(filterOperatorRows(merged, { query: 'bi', status: 'todos', showInactive: true })).toHaveLength(1);
    expect(filterOperatorRows(merged, { query: '', status: 'ausentes', showInactive: true })).toHaveLength(0);
  });
});
