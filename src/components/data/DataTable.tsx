import {
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useMediaQuery } from './useMediaQuery';

declare module '@tanstack/react-table' {
  // Os parâmetros precisam existir para casar com a declaração original.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Alinhamento do número na coluna. */
    align?: 'left' | 'right';
    /** Classe extra da célula. */
    className?: string;
  }
}

export type DataTableDensity = 'comfortable' | 'compact';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  /** Nome da tabela para leitor de tela. */
  'aria-label': string;

  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  initialSorting?: SortingState;

  /** Mostra a coluna de checkbox. */
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  columnVisibility?: VisibilityState;
  density?: DataTableDensity;
  /** Cabeçalho fixo: distância do topo em px (ex.: altura da barra global). */
  stickyHeaderTop?: number;

  onRowClick?: (row: T) => void;

  loading?: boolean;
  loadingRows?: number;
  /** Mostrado quando não há linhas (e não está carregando). */
  empty?: ReactNode;
  /** Rodapé com totais. */
  footer?: ReactNode;
  /** Barra de ações em lote, mostrada quando há seleção. */
  bulkActions?: (selected: T[]) => ReactNode;
  /** Abaixo de 768px a tabela vira lista destes cards. */
  renderMobileCard?: (row: T) => ReactNode;
  className?: string;
}

const MOBILE_QUERY = '(max-width: 767px)';

export function DataTable<T>({
  data,
  columns,
  getRowId,
  sorting: sortingProp,
  onSortingChange,
  initialSorting = [],
  selectable,
  rowSelection: selectionProp,
  onRowSelectionChange,
  columnVisibility,
  density = 'comfortable',
  stickyHeaderTop,
  onRowClick,
  loading,
  loadingRows = 6,
  empty,
  footer,
  bulkActions,
  renderMobileCard,
  className,
  ...aria
}: DataTableProps<T>) {
  const [sortingState, setSortingState] = useState<SortingState>(initialSorting);
  const [selectionState, setSelectionState] = useState<RowSelectionState>({});
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const sorting = sortingProp ?? sortingState;
  const rowSelection = selectionProp ?? selectionState;

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, rowSelection, columnVisibility: columnVisibility ?? {} },
    onSortingChange: onSortingChange ?? setSortingState,
    onRowSelectionChange: onRowSelectionChange ?? setSelectionState,
    enableRowSelection: !!selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const colCount = table.getVisibleLeafColumns().length + (selectable ? 1 : 0);
  const rowH = density === 'compact' ? 'h-8' : 'h-11';
  const showCards = isMobile && !!renderMobileCard;

  const bulk =
    selectable && bulkActions && selectedRows.length > 0 ? (
      <div className="flex items-center gap-2 border-t border-line bg-accent-soft px-4 py-2 text-sm">
        <b className="mr-2 font-semibold">
          {selectedRows.length} {selectedRows.length === 1 ? 'selecionado' : 'selecionados'}
        </b>
        {bulkActions(selectedRows)}
      </div>
    ) : null;

  const footerEl = footer ? <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-ink-3">{footer}</div> : null;

  if (showCards) {
    return (
      <div className={className}>
        {loading ? (
          <ul aria-busy="true" aria-label="Carregando" className="grid gap-2 p-2">
            {Array.from({ length: Math.min(loadingRows, 4) }, (_, i) => (
              <li key={i} className="rounded-md border border-line p-3">
                <Skeleton className="mb-2 h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          empty
        ) : (
          <ul aria-label={aria['aria-label']} className="grid gap-2 p-2">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="mobile-card"
                aria-selected={selectable ? row.getIsSelected() : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (e) => rowKey(e, () => onRowClick(row.original)) : undefined}
                className={cn(
                  'rounded-md border bg-surface p-3',
                  row.getIsSelected() ? 'border-accent-fill bg-accent-soft' : 'border-line',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {selectable && (
                  <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={row.getIsSelected()}
                      onCheckedChange={(v) => row.toggleSelected(v === true)}
                      aria-label="Selecionar linha"
                    />
                  </div>
                )}
                {renderMobileCard(row.original)}
              </li>
            ))}
          </ul>
        )}
        {bulk}
        {footerEl}
      </div>
    );
  }

  const stickyStyle: CSSProperties | undefined = stickyHeaderTop != null ? { top: stickyHeaderTop } : undefined;
  const allSelected = table.getIsAllRowsSelected();
  const someSelected = table.getIsSomeRowsSelected();

  return (
    <div className={className}>
      <div className={cn(stickyHeaderTop == null && 'overflow-x-auto')}>
        <table
          data-density={density}
          aria-label={aria['aria-label']}
          aria-busy={loading || undefined}
          className="w-full border-separate border-spacing-0 text-base"
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <th scope="col" style={stickyStyle} className={cn('h-[34px] w-9 border-y border-line bg-surface pl-4 pr-0 text-left', stickyHeaderTop != null && 'sticky z-10')}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
                      aria-label="Selecionar todas as linhas"
                      disabled={loading || rows.length === 0}
                    />
                  </th>
                )}
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const right = h.column.columnDef.meta?.align === 'right';
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      style={stickyStyle}
                      aria-sort={canSort ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn(
                        'h-[34px] whitespace-nowrap border-y border-line bg-surface px-3 text-left text-sm font-medium text-ink-3 first:pl-4 last:pr-4',
                        right && 'text-right',
                        stickyHeaderTop != null && 'sticky z-10',
                      )}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            'group inline-flex items-center gap-1 rounded-sm hover:text-ink focus-visible:shadow-focus',
                            dir && 'text-ink',
                            right && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan={colCount} className={cn('border-b border-line px-4', rowH)}>
                      <Skeleton className="h-3.5 w-full max-w-[60%]" />
                    </td>
                  </tr>
                ))
              : rows.length === 0
                ? (
                    <tr>
                      <td colSpan={colCount}>{empty}</td>
                    </tr>
                  )
                : rows.map((row) => {
                    const selected = row.getIsSelected();
                    return (
                      <tr
                        key={row.id}
                        aria-selected={selectable ? selected : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                        onKeyDown={onRowClick ? (e) => rowKey(e, () => onRowClick(row.original)) : undefined}
                        className={cn('group/row focus-visible:shadow-[inset_0_0_0_2px_var(--accent-fill)]', onRowClick && 'cursor-pointer')}
                      >
                        {selectable && (
                          <td
                            onClick={(e) => e.stopPropagation()}
                            className={cn('w-9 border-b border-line pl-4 pr-0 group-last/row:border-b-0', rowH, selected ? 'bg-accent-soft' : 'group-hover/row:bg-hover')}
                          >
                            <Checkbox checked={selected} onCheckedChange={(v) => row.toggleSelected(v === true)} aria-label="Selecionar linha" />
                          </td>
                        )}
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              'whitespace-nowrap border-b border-line px-3 first:pl-4 last:pr-4 group-last/row:border-b-0',
                              rowH,
                              selected ? 'bg-accent-soft' : 'group-hover/row:bg-hover',
                              cell.column.columnDef.meta?.align === 'right' && 'tabular text-right',
                              cell.column.columnDef.meta?.className,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
      {bulk}
      {footerEl}
    </div>
  );
}

function rowKey(e: KeyboardEvent, act: () => void) {
  if (e.key === 'Enter' && e.target === e.currentTarget) {
    e.preventDefault();
    act();
  }
}
