import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Avatar } from '@/components/ui/Avatar';
import { Meter } from '@/components/charts/Meter';
import { Tooltip } from '@/components/ui';
import { formatDec1, formatInt, formatTime } from '@/lib/format';
import { mixedShare } from '@/lib/metrics';
import type { OperatorRow } from '@/data/types';
import { GoalCell } from './GoalCell';
import { StatusBadge } from './StatusBadge';

export type OperatorColumnId = 'name' | 'station' | 'orders' | 'mixed' | 'rate' | 'goal' | 'ratio' | 'start' | 'status';

/** Ordem padrão: ritmo, do maior para o menor. */
export const DEFAULT_SORTING: SortingState = [{ id: 'rate', desc: true }];

export const COLUMN_LABEL: Record<OperatorColumnId, string> = {
  name: 'Operador',
  station: 'Bancada',
  orders: 'Pedidos',
  mixed: 'Mistos %',
  rate: 'Ritmo /h',
  goal: 'Meta individual',
  ratio: 'Contra a meta',
  start: 'Início',
  status: 'Status',
};

/** O nome nunca some. */
export const HIDEABLE_COLUMNS: OperatorColumnId[] = ['station', 'orders', 'mixed', 'rate', 'goal', 'ratio', 'start', 'status'];

export function mixedPercent(row: Pick<OperatorRow, 'simpleOrders' | 'mixedOrders'>): number | null {
  return mixedShare(row.simpleOrders, row.mixedOrders);
}

/** Rótulo da coluna de meta quando o período já fechou (o banco não guarda a meta de cada dia). */
export const PERIOD_RATIO_LABEL = 'Contra a meta atual';

export function periodGoalHint(todayGoal: number | null | undefined): string {
  const compared = todayGoal != null ? `a meta de hoje (${formatInt(todayGoal)}/h)` : 'a meta de hoje';
  return `Comparado com ${compared}. O banco ainda não guarda a meta de cada dia.`;
}

export interface ColumnOptions {
  /** Mostrar Início (só faz sentido no dia de hoje). */
  showStart: boolean;
  /** A meta individual é editável na célula. */
  editableGoal: boolean;
  /** Visão por período (7d, 30d, Relatórios): a coluna vira "Contra a meta atual", com explicação. */
  period?: boolean;
  /** Meta global de hoje, citada na explicação do período. */
  todayGoal?: number | null;
}

/** Colunas da tabela de operadores. Montagem separada para ser testável sem tela. */
export function buildOperatorColumns({ showStart, editableGoal, period = false, todayGoal }: ColumnOptions): ColumnDef<OperatorRow>[] {
  const cols: ColumnDef<OperatorRow>[] = [
    {
      id: 'name',
      header: COLUMN_LABEL.name,
      accessorFn: (r) => r.name,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'pt-BR'),
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.original.name} />
          <span className="grid leading-tight">
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-ink-3">{row.original.id}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'station',
      header: COLUMN_LABEL.station,
      accessorFn: (r) => r.station ?? undefined,
      sortUndefined: 'last',
      cell: ({ row }) => (row.original.station ? <span className="font-mono">{row.original.station}</span> : <span className="text-ink-3">sem bancada</span>),
    },
    {
      id: 'orders',
      header: COLUMN_LABEL.orders,
      accessorFn: (r) => r.orders,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="inline-grid justify-items-end leading-tight">
          <span className="font-medium">{formatInt(row.original.orders)}</span>
          <span className="text-xs text-ink-3">
            {formatInt(row.original.simpleOrders)} simples, {formatInt(row.original.mixedOrders)} mistos
          </span>
        </span>
      ),
    },
    {
      id: 'mixed',
      header: COLUMN_LABEL.mixed,
      accessorFn: (r) => mixedPercent(r) ?? undefined,
      sortUndefined: 'last',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const m = mixedPercent(row.original);
        return m == null ? <span className="text-ink-3">sem dado</span> : `${formatDec1(m)}%`;
      },
    },
    {
      id: 'rate',
      header: COLUMN_LABEL.rate,
      accessorFn: (r) => r.rate ?? undefined,
      sortUndefined: 'last',
      meta: { align: 'right' },
      cell: ({ row }) => (row.original.rate == null ? <span className="text-ink-3">sem dado</span> : <b className="font-semibold">{formatDec1(row.original.rate)}</b>),
    },
    {
      id: 'goal',
      header: COLUMN_LABEL.goal,
      accessorFn: (r) => r.individualGoal,
      meta: { align: 'right' },
      cell: ({ row }) =>
        editableGoal ? (
          <GoalCell
            operatorId={row.original.id}
            operatorName={row.original.name}
            value={row.original.individualGoal}
            overridden={row.original.goalSource === 'global'}
          />
        ) : (
          <span className={row.original.goalSource === 'global' ? 'text-ink-3 line-through' : undefined}>{formatInt(row.original.individualGoal)}</span>
        ),
    },
    {
      id: 'ratio',
      header: period
        ? () => (
            <Tooltip content={periodGoalHint(todayGoal)}>
              <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:shadow-focus">
                {PERIOD_RATIO_LABEL}
              </span>
            </Tooltip>
          )
        : COLUMN_LABEL.ratio,
      accessorFn: (r) => r.goalRatio ?? undefined,
      sortUndefined: 'last',
      cell: ({ row }) => <Meter variant="mini" value={row.original.rate} goal={row.original.effectiveGoal} />,
    },
  ];
  if (showStart) {
    cols.push({
      id: 'start',
      header: COLUMN_LABEL.start,
      accessorFn: (r) => (r.startAt ? Date.parse(r.startAt) : undefined),
      sortUndefined: 'last',
      cell: ({ row }) => (row.original.startAt ? <span className="font-mono">{formatTime(row.original.startAt)}</span> : <span className="text-ink-3">sem registro</span>),
    });
  }
  cols.push({
    id: 'status',
    header: COLUMN_LABEL.status,
    accessorFn: (r) => r.status,
    cell: ({ row }) => <StatusBadge row={row.original} />,
  });
  return cols;
}
