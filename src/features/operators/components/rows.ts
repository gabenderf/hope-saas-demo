import { effectiveGoal } from '@/lib/metrics';
import type { Operator, OperatorRow } from '@/data/types';

/**
 * Junta o cadastro completo com as linhas de hoje. Quem não aparece na Visão Geral
 * (inativo, ou sem nenhum registro no dia) ganha uma linha zerada, para a lista de
 * Operadores mostrar TODO o cadastro.
 */
export function mergeOperatorRows(operators: Operator[], todayRows: OperatorRow[], globalGoal: number | null): OperatorRow[] {
  const byId = new Map(todayRows.map((r) => [r.id, r]));
  return operators.map((op) => {
    const row = byId.get(op.id);
    if (row) return { ...row, name: op.name, individualGoal: op.individualGoal, status: op.registration === 'inativo' ? 'inativo' : row.status };
    const eff = effectiveGoal(op, globalGoal);
    return {
      id: op.id,
      name: op.name,
      station: null,
      status: op.registration === 'inativo' ? 'inativo' : 'ausente',
      awayReason: op.registration === 'inativo' ? null : 'sem-registro',
      startAt: null,
      lastActivityAt: null,
      orders: 0,
      simpleOrders: 0,
      mixedOrders: 0,
      hours: 0,
      rate: null,
      individualGoal: op.individualGoal,
      effectiveGoal: eff.value,
      goalSource: eff.source,
      goalRatio: null,
    };
  });
}

export type StatusFilter = 'todos' | 'ativos' | 'ausentes';

export function filterOperatorRows(rows: OperatorRow[], opts: { query: string; status: StatusFilter; showInactive: boolean }): OperatorRow[] {
  const q = opts.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (r.status === 'inativo' && !opts.showInactive) return false;
    if (opts.status === 'ativos' && r.status !== 'ativo') return false;
    if (opts.status === 'ausentes' && r.status !== 'ausente') return false;
    if (q && !r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false;
    return true;
  });
}
