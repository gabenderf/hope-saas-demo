import type { RowSelectionState, SortingState, VisibilityState } from '@tanstack/react-table';
import { Columns3, Download, Target } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useUiStore } from '@/app/ui-store';
import { useCan } from '@/auth';
import { Meter } from '@/components/charts/Meter';
import { DataTable } from '@/components/data';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Input } from '@/components/ui/Input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { toast } from '@/components/ui/toast';
import { useSetIndividualGoals, useWriteGate } from '@/data/hooks';
import type { OperatorRow } from '@/data/types';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatDec1, formatInt } from '@/lib/format';
import { teamRate } from '@/lib/metrics';
import { COLUMN_LABEL, DEFAULT_SORTING, HIDEABLE_COLUMNS, type OperatorColumnId, buildOperatorColumns } from './columns';
import { StatusBadge } from './StatusBadge';
import { parseGoal } from './goal';
import { OPERATOR_CSV_COLUMNS } from './operatorsCsv';
import { useColumnVisibility } from './useColumnVisibility';

export interface OperatorsTableProps {
  rows: OperatorRow[];
  loading?: boolean;
  /** Início só existe para o dia de hoje. */
  showStart: boolean;
  /** Período fechado (7d, 30d): a razão é contra a meta ATUAL, e o cabeçalho diz isso. */
  period?: boolean;
  /** Meta global de hoje, para o texto de ajuda do modo período. */
  todayGoal?: number | null;
  empty: ReactNode;
  onOpen: (row: OperatorRow) => void;
  /** Coluna extra no fim (menu da linha). */
  rowActions?: (row: OperatorRow) => ReactNode;
  /** Nome do arquivo ao exportar a seleção. */
  exportName?: string;
  storageKey?: string;
  'aria-label': string;
  /** Barra acima da tabela (busca, filtros). */
  toolbar?: ReactNode;
}

function BulkGoal({ rows, onDone }: { rows: OperatorRow[]; onDone: () => void }) {
  const gate = useWriteGate('expedicao.metas.editar');
  const mutation = useSetIndividualGoals();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = parseGoal(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      const result = await mutation.mutateAsync({ operatorIds: rows.map((r) => r.id), value: parsed.value });
      toast.undoable(`Meta de ${rows.length} ${rows.length === 1 ? 'operador' : 'operadores'} agora é ${formatInt(parsed.value)}/h.`, result.undo);
      setOpen(false);
      setText('');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as metas.');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o && !gate.allowed) {
          toast(gate.message ?? 'Seu perfil não permite alterar metas.');
          return;
        }
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" icon={<Target />} aria-disabled={!gate.allowed || undefined}>
          Definir meta individual
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="bulk-goal" className="text-xs font-medium">
            Nova meta individual, pedidos por hora
          </label>
          <Input
            id="bulk-goal"
            inputMode="numeric"
            autoFocus
            value={text}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p role="alert" className="text-xs text-crit">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="sm" loading={mutation.isPending}>
            Aplicar a {rows.length}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Tabela de operadores compartilhada pela Visão Geral e pela lista de Operadores. */
export function OperatorsTable({
  rows,
  loading,
  showStart,
  period = false,
  todayGoal = null,
  empty,
  onOpen,
  rowActions,
  exportName = 'operadores',
  storageKey = 'hope-operators-columns',
  toolbar,
  ...aria
}: OperatorsTableProps) {
  const density = useUiStore((s) => s.density);
  const canExport = useCan('expedicao.exportar');
  const gate = useWriteGate('expedicao.metas.editar');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [hidden, setHidden] = useColumnVisibility(storageKey);

  const columns = useMemo(() => {
    const base = buildOperatorColumns({ showStart, editableGoal: gate.allowed, period, todayGoal });
    if (!rowActions) return base;
    return [
      ...base,
      {
        id: 'actions',
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        meta: { align: 'right' as const },
        cell: ({ row }: { row: { original: OperatorRow } }) => (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {rowActions(row.original)}
          </span>
        ),
      },
    ];
  }, [showStart, gate.allowed, rowActions, period, todayGoal]);

  const visibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {};
    for (const id of hidden) v[id] = false;
    return v;
  }, [hidden]);

  const worked = rows.filter((r) => r.orders > 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const avgRate = teamRate(rows);

  const toggleColumn = (id: OperatorColumnId, visible: boolean) => setHidden(visible ? hidden.filter((h) => h !== id) : [...hidden, id]);

  const exportRows = (list: OperatorRow[]) => {
    downloadCsv(exportName, toCsv(list, OPERATOR_CSV_COLUMNS));
    toast.success(`${list.length} ${list.length === 1 ? 'linha exportada' : 'linhas exportadas'}.`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {toolbar}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" icon={<Columns3 />}>
                Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {HIDEABLE_COLUMNS.filter((id) => showStart || id !== 'start').map((id) => (
                <DropdownMenuCheckboxItem key={id} checked={!hidden.includes(id)} onCheckedChange={(v) => toggleColumn(id, v === true)} onSelect={(e) => e.preventDefault()}>
                  {COLUMN_LABEL[id]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DataTable
        aria-label={aria['aria-label']}
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={loading}
        sorting={sorting}
        onSortingChange={setSorting}
        selectable
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        columnVisibility={visibility}
        density={density}
        onRowClick={onOpen}
        empty={empty}
        bulkActions={(selected) => (
          <>
            <BulkGoal rows={selected} onDone={() => setSelection({})} />
            <Button
              size="sm"
              icon={<Download />}
              aria-disabled={!canExport || undefined}
              onClick={() => (canExport ? exportRows(selected) : toast('Exportar exige o perfil Liderança ou Administrador.'))}
            >
              Exportar seleção
            </Button>
          </>
        )}
        footer={
          rows.length > 0 ? (
            <>
              <span>
                <b className="tabular font-semibold text-ink">{formatInt(totalOrders)}</b> pedidos
              </span>
              <span>
                Ritmo médio <b className="tabular font-semibold text-ink">{avgRate == null ? 'sem dado' : `${formatDec1(avgRate)}/h`}</b>
              </span>
              <span className="ml-auto">{worked.length} com pedidos</span>
            </>
          ) : undefined
        }
        renderMobileCard={(r) => (
          <div className="grid gap-2">
            <div className="flex items-center gap-2.5">
              <Avatar name={r.name} />
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <StatusBadge row={r} />
            </div>
            <div className="flex items-center justify-between text-ink-2">
              <span>
                <b className="tabular font-semibold text-ink">{formatInt(r.orders)}</b> pedidos
              </span>
              <span className="tabular">{r.rate == null ? 'sem dado' : `${formatDec1(r.rate)}/h`}</span>
            </div>
            <Meter variant="mini" value={r.rate} goal={r.effectiveGoal} />
            {rowActions && (
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {rowActions(r)}
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
