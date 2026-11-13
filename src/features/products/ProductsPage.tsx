import type { ColumnDef } from '@tanstack/react-table';
import { Download, PackageSearch, Search } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useUiStore } from '@/app/ui-store';
import { useCan } from '@/auth';
import { DataTable } from '@/components/data';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/components/ui/toast';
import { useOverview } from '@/data/hooks';
import type { ProductRow, RangeKey } from '@/data/types';
import { QueryError } from '@/features/operators/components/QueryError';
import { RANGE_OPTIONS, compareOptionsFor } from '@/features/overview/overviewModel';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDec1, formatInt } from '@/lib/format';
import { useUrlEnum, useUrlString } from '@/lib/url-state';
import { PRODUCT_CSV_COLUMNS, type ProductOrder, filterAndSortProducts, mixedPercentOfProduct } from './productsModel';

const RANGES: readonly RangeKey[] = ['hoje', '7d', '30d'];
const ORDERS: readonly ProductOrder[] = ['pedidos', 'unidades'];

const columns: ColumnDef<ProductRow>[] = [
  { id: 'sku', header: 'SKU', accessorFn: (r) => r.sku, enableSorting: false, cell: ({ row }) => <span className="font-mono">{row.original.sku}</span> },
  { id: 'orders', header: 'Pedidos', accessorFn: (r) => r.orders, enableSorting: false, meta: { align: 'right' }, cell: ({ row }) => formatInt(row.original.orders) },
  { id: 'units', header: 'Unidades', accessorFn: (r) => r.units, enableSorting: false, meta: { align: 'right' }, cell: ({ row }) => formatInt(row.original.units) },
  {
    id: 'mixed',
    header: 'Em pedido misto',
    accessorFn: (r) => mixedPercentOfProduct(r),
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => {
      const m = mixedPercentOfProduct(row.original);
      return m == null ? 'sem dado' : `${formatDec1(m)}%`;
    },
  },
];

export default function ProductsPage() {
  const [range, setRange] = useUrlEnum<RangeKey>('periodo', RANGES, 'hoje');
  const [order, setOrder] = useUrlEnum<ProductOrder>('ordem', ORDERS, 'pedidos');
  const [query, setQuery] = useUrlString('q');
  const density = useUiStore((s) => s.density);
  const canExport = useCan('expedicao.exportar');
  const q = useOverview({ range, compare: compareOptionsFor(range)[0]! });

  const rows = useMemo(() => filterAndSortProducts(q.data?.products ?? [], query, order), [q.data, query, order]);

  const exportCsv = () => {
    if (!canExport) return toast('Exportar exige o perfil Liderança ou Administrador.');
    downloadCsv(`produtos-${range}`, toCsv(rows, PRODUCT_CSV_COLUMNS));
    toast.success(`${rows.length} produtos exportados.`);
  };

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
      <PageHeader
        title="Produtos"
        breadcrumbs={[{ label: 'Expedição', to: '/expedicao' }, { label: 'Produtos' }]}
        renderLink={(c) => <Link to={c.to}>{c.label}</Link>}
        meta={q.data ? `${q.data.label}, ${q.data.sublabel}` : undefined}
        actions={
          <>
            <SegmentedControl aria-label="Período" value={range} onValueChange={(v) => setRange(v as RangeKey)} options={RANGE_OPTIONS} />
            <Button icon={<Download />} aria-disabled={!canExport || undefined} disabled={!q.data} onClick={exportCsv}>
              Exportar
            </Button>
          </>
        }
      />

      <p className="max-w-[80ch] text-ink-2">
        A lista é ordenada por pedidos, não por unidades: touca e atadura saem em pacotes grandes e dominariam o topo, escondendo o que a equipe separa o dia todo.
      </p>

      {q.isError ? (
        <QueryError what="os produtos" onRetry={() => void q.refetch()} />
      ) : (
        <Card className="py-3">
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <Input type="search" aria-label="Buscar SKU" placeholder="Buscar SKU" className="pl-8 font-mono" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <SegmentedControl
              aria-label="Ordenar por"
              value={order}
              onValueChange={(v) => setOrder(v as ProductOrder)}
              options={[
                { value: 'pedidos', label: 'Ordenar por pedidos' },
                { value: 'unidades', label: 'Ordenar por unidades' },
              ]}
            />
            {q.data && <span className="ml-auto text-ink-3">{formatInt(rows.length)} SKUs</span>}
          </div>
          <DataTable
            aria-label="Produtos do período"
            data={rows}
            columns={columns}
            getRowId={(r) => r.sku}
            loading={q.isPending}
            loadingRows={8}
            density={density}
            empty={
              query ? (
                <EmptyState icon={<PackageSearch />} title="Nenhum SKU com esse trecho" description="Confira a grafia ou limpe a busca." />
              ) : (
                <EmptyState
                  icon={<PackageSearch />}
                  title="Nenhum produto neste período"
                  description="Os produtos aparecem conforme a extensão registra os pedidos, com os SKUs de cada pacote."
                />
              )
            }
            renderMobileCard={(r) => (
              <div className="grid gap-1">
                <span className="font-mono font-medium">{r.sku}</span>
                <span className="tabular text-ink-2">
                  {formatInt(r.orders)} pedidos, {formatInt(r.units)} unidades, {mixedPercentOfProduct(r) == null ? 'sem dado' : `${formatDec1(mixedPercentOfProduct(r) as number)}%`} em pedido misto
                </span>
              </div>
            )}
          />
        </Card>
      )}
    </div>
  );
}
