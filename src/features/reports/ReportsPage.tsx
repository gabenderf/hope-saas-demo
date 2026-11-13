import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, Download, FileBarChart, Printer, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCan } from '@/auth';
import { BarCompareChart, Delta } from '@/components/charts';
import { DataTable, KpiCard } from '@/components/data';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  Skeleton,
  Tooltip,
  toast,
} from '@/components/ui';
import { useLastWorkedDays, useNow, useOperators, usePeriodOverview, useToday } from '@/data/hooks';
import type { MetricKey, OperatorRow, ProductRow } from '@/data/types';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDateTime, formatDayShort, formatDayWithWeekday, formatDec1, formatInt, formatRate, formatRatio } from '@/lib/format';
import { absoluteChange, goalTone, mixedShare, percentChange } from '@/lib/metrics';
import { daysBetween } from '@/lib/time';
import { useIntent } from '@/lib/url-state';
import { PERIOD_RATIO_LABEL, periodGoalHint } from '@/features/operators/components/columns';
import {
  OPERATOR_CSV_COLUMNS,
  PRESETS,
  PRESET_LABEL,
  PRODUCT_CSV_COLUMNS,
  type PresetKey,
  dayExtras,
  parseReportQuery,
  previousRange,
  reportFilename,
} from './period';

const PRINT_CSS = `
@media print {
  aside, nav, [role="banner"], [data-app-chrome], [data-no-print] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  tr, li { break-inside: avoid; }
  thead { display: table-header-group; }
  section { break-inside: avoid-page; }
}
`;

const METRIC_OPTIONS: { value: MetricKey; label: string; unit: string }[] = [
  { value: 'pedidos', label: 'Pedidos', unit: 'Pedidos' },
  { value: 'ritmo', label: 'Ritmo', unit: 'Ritmo (pedidos/h)' },
  { value: 'ativos', label: 'Operadores', unit: 'Operadores com pedidos' },
  { value: 'mistos', label: 'Mistos', unit: 'Pedidos mistos (%)' },
];

const PRODUCTS_PREVIEW = 15;

export default function ReportsPage() {
  const today = useToday();
  const now = useNow();
  const canExport = useCan('expedicao.exportar');
  const [params, setParams] = useSearchParams();
  const [metric, setMetric] = useState<MetricKey>('pedidos');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [intent, clearIntent] = useIntent();

  const worked = useLastWorkedDays(7);
  const query = useMemo(
    () =>
      parseReportQuery(
        {
          periodo: params.get('periodo'),
          de: params.get('de'),
          ate: params.get('ate'),
          vs: params.get('vs'),
          operadores: params.get('operadores'),
        },
        today,
        worked.data,
      ),
    [params, today, worked.data],
  );

  const compareRange = query.compare === 'anterior' ? previousRange(query, query.preset, worked.data) : null;
  const period = usePeriodOverview({
    from: query.from,
    to: query.to,
    compareFrom: compareRange?.from,
    compareTo: compareRange?.to,
    operatorIds: query.operatorIds.length ? query.operatorIds : undefined,
  });
  const operators = useOperators();
  const model = period.data;

  /* ---------- URL ---------- */
  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v == null || v === '') p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );

  const choosePreset = (preset: PresetKey) => {
    if (preset === 'custom') update({ periodo: 'custom', de: query.from, ate: query.to });
    else update({ periodo: preset === '7u' ? null : preset, de: null, ate: null });
  };
  const setDates = (de: string, ate: string) => update({ periodo: 'custom', de, ate });

  // avisos de correção da URL: o intervalo mostrado já é o corrigido
  const warnKey = query.warnings.join('|');
  const [dismissed, setDismissed] = useState('');
  const notices = dismissed === warnKey ? [] : query.warnings;

  /* ---------- derivados ---------- */
  const extras = useMemo(() => {
    if (!model) return null;
    const cur = dayExtras(model.buckets.map((b) => ({ day: b.key, orders: b.values.pedidos })));
    const cmp = model.compareDays.length
      ? dayExtras(model.buckets.map((b, i) => ({ day: model.compareDays[i] ?? b.key, orders: model.compareDays[i] ? b.compare.pedidos : null })))
      : null;
    return { cur, cmp };
  }, [model]);

  const chartData = useMemo(
    () =>
      (model?.buckets ?? []).map((b) => ({
        label: formatDayWithWeekday(b.key),
        value: b.values[metric],
        compare: b.compare[metric],
      })),
    [model, metric],
  );

  const products = useMemo(() => [...(model?.products ?? [])].sort((a, b) => b.orders - a.orders || a.sku.localeCompare(b.sku)), [model]);

  const hasData = !!model && model.kpis.pedidos.value != null && model.kpis.pedidos.value > 0;
  const periodText = `${formatDayShort(query.from)} a ${formatDayShort(query.to)}`;
  const nDays = daysBetween(query.from, query.to).length;
  const selectedNames = (operators.data ?? []).filter((o) => query.operatorIds.includes(o.id)).map((o) => o.name);

  /* ---------- exportar ---------- */
  const exportOperators = () => {
    if (!canExport) {
      toast.error('Seu perfil não pode exportar. Exportar relatório exige o perfil Leitura ou acima.');
      return;
    }
    if (!model || !model.operators.length) {
      toast.error('Não há dados para exportar neste período.');
      return;
    }
    downloadCsv(reportFilename(query), toCsv(model.operators, OPERATOR_CSV_COLUMNS));
    toast.success('Relatório exportado.');
  };
  const exportProducts = () => {
    if (!canExport) {
      toast.error('Seu perfil não pode exportar. Exportar relatório exige o perfil Leitura ou acima.');
      return;
    }
    if (!products.length) {
      toast.error('Não há produtos para exportar neste período.');
      return;
    }
    downloadCsv(reportFilename(query, 'produtos-expedicao'), toCsv(products.map((p, i) => ({ ...p, position: i + 1 })), PRODUCT_CSV_COLUMNS));
    toast.success('Produtos exportados.');
  };

  const intentDone = useRef(false);
  useEffect(() => {
    if (intent !== 'exportar' || intentDone.current) return;
    if (period.isError) {
      intentDone.current = true;
      clearIntent();
      return;
    }
    if (!model) return;
    intentDone.current = true;
    exportOperators();
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, model, period.isError]);

  /* ---------- KPIs ---------- */
  const kpiCompare = (cur: number | null | undefined, prev: number | null | undefined, text: string, fmtv: (n: number) => string) =>
    query.compare === 'nenhum' || prev == null
      ? undefined
      : { text: `${text} ${fmtv(prev)}`, delta: { value: percentChange(cur ?? null, prev), kind: 'percent' as const } };

  const k = model?.kpis;

  return (
    <div className="grid gap-4">
      <style>{PRINT_CSS}</style>

      <div data-no-print className="print:hidden">
        <PageHeader
          title="Relatórios"
          meta={`${PRESET_LABEL[query.preset]}, ${periodText}`}
          actions={
            <>
              <Button icon={<Printer />} onClick={() => window.print()}>
                Imprimir
              </Button>
              <Button
                variant="primary"
                icon={<Download />}
                aria-disabled={!canExport || undefined}
                onClick={exportOperators}
              >
                Exportar CSV
              </Button>
            </>
          }
        />
      </div>

      {/* cabeçalho só da impressão */}
      <div className="hidden print:block">
        <h1 className="text-lg">Relatório de expedição</h1>
        <p>Período: {periodText}{compareRange ? ` (comparado com ${formatDayShort(compareRange.from)} a ${formatDayShort(compareRange.to)})` : ''}</p>
        <p>Operadores: {selectedNames.length ? selectedNames.join(', ') : 'todos'}</p>
        <p>Gerado em {formatDateTime(now)}</p>
      </div>

      {/* controles */}
      <Card className="print:hidden">
        <CardBody className="flex flex-wrap items-end gap-3 pt-4">
          <label className="grid gap-1">
            <span className="text-ink-2">Período</span>
            <Select
              aria-label="Período"
              className="w-52"
              value={query.preset}
              onValueChange={(v) => choosePreset(v as PresetKey)}
              options={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
            />
          </label>
          {query.preset === 'custom' && (
            <>
              <label className="grid gap-1">
                <span className="text-ink-2">De</span>
                <Input type="date" max={today} value={query.from} onChange={(e) => e.target.value && setDates(e.target.value, query.to)} className="w-40" />
              </label>
              <label className="grid gap-1">
                <span className="text-ink-2">Até</span>
                <Input type="date" max={today} value={query.to} onChange={(e) => e.target.value && setDates(query.from, e.target.value)} className="w-40" />
              </label>
            </>
          )}
          <div className="grid gap-1">
            <span className="text-ink-2">Comparar com</span>
            <SegmentedControl
              aria-label="Comparação"
              value={query.compare}
              onValueChange={(v) => update({ vs: v === 'anterior' ? null : v })}
              options={[
                { value: 'anterior', label: 'Período anterior' },
                { value: 'nenhum', label: 'Sem comparação' },
              ]}
            />
          </div>
          <OperatorFilter
            all={operators.data ?? []}
            selected={query.operatorIds}
            onChange={(ids) => update({ operadores: ids.length ? ids.join(',') : null })}
          />
        </CardBody>
      </Card>

      {notices.length > 0 && (
        <Notice tone="warn" className="print:hidden" action={<Button size="sm" variant="ghost" onClick={() => setDismissed(warnKey)}>Entendi</Button>}>
          {notices.join(' ')}
        </Notice>
      )}

      <details className="rounded-md border border-line bg-surface px-4 py-2 print:hidden">
        <summary className="cursor-pointer font-medium">Como estes números são calculados</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-ink-2">
          <li>O dia é o de São Paulo. O painel antigo agrupava por dia UTC, e pedidos do fim da noite caíam no dia seguinte.</li>
          <li>Cada dia usa os próprios registros de acesso dos operadores. O painel antigo usava os de hoje para todos os dias.</li>
          <li>A média por dia considera só dias com movimento. O painel antigo dividia por dias corridos, contando fim de semana parado.</li>
          <li>O ritmo do período é a média simples dos ritmos individuais, a mesma regra da Visão Geral.</li>
        </ul>
      </details>

      {period.isError ? (
        <Notice tone="crit" title="Não foi possível carregar o relatório" action={<Button size="sm" onClick={() => void period.refetch()}>Tentar de novo</Button>}>
          {period.error instanceof Error ? period.error.message : 'Verifique a conexão e tente novamente.'}
        </Notice>
      ) : period.isPending ? (
        <div aria-busy="true" className="grid gap-4">
          <p className="text-ink-2">
            Carregando {nDays} {nDays === 1 ? 'dia' : 'dias'}. Dias fechados ficam guardados e abrem na hora da próxima vez.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <KpiCard key={i} loading label="Carregando" value="" />
            ))}
          </div>
          <Card>
            <CardBody className="pt-4">
              <Skeleton className="h-[260px] w-full" />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="grid gap-3 pt-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </CardBody>
          </Card>
        </div>
      ) : !hasData || !model || !k || !extras ? (
        <Card>
          <EmptyState
            icon={<FileBarChart />}
            title={`Nenhum pedido entre ${formatDayShort(query.from)} e ${formatDayShort(query.to)}`}
            description="Os pedidos chegam pela extensão do UpSeller, a cada bipagem. Escolha outro período ou tire o filtro de operadores."
            action={
              <Button onClick={() => update({ periodo: null, de: null, ate: null, operadores: null })}>Voltar aos últimos 7 dias úteis</Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Pedidos"
              value={formatInt(k.pedidos.value ?? 0)}
              compare={kpiCompare(k.pedidos.value, k.pedidos.compare, 'vs.', formatInt)}
            />
            <KpiCard
              label="Ritmo"
              info={{ definition: 'Média simples dos ritmos individuais no período. Cada ritmo é pedidos divididos pelas horas trabalhadas.' }}
              value={k.ritmo.value == null ? 'sem dado' : formatDec1(k.ritmo.value)}
              unit={k.ritmo.value == null ? undefined : '/h'}
              compare={kpiCompare(k.ritmo.value, k.ritmo.compare, 'vs.', (n) => formatRate(n))}
            />
            <KpiCard
              label="Média por dia com movimento"
              value={extras.cur.avgPerWorkedDay == null ? 'sem dado' : formatInt(extras.cur.avgPerWorkedDay)}
              compare={kpiCompare(extras.cur.avgPerWorkedDay, extras.cmp?.avgPerWorkedDay, 'vs.', formatInt)}
            />
            <KpiCard
              label="Dias com movimento"
              value={formatInt(extras.cur.workedDays)}
              compare={
                extras.cmp && query.compare !== 'nenhum'
                  ? { text: `vs. ${formatInt(extras.cmp.workedDays)}`, delta: { value: extras.cur.workedDays - extras.cmp.workedDays, kind: 'absolute', tone: 'none' } }
                  : undefined
              }
            />
            <KpiCard
              label="Sábados trabalhados"
              value={formatInt(extras.cur.saturdays)}
              compare={
                extras.cmp && query.compare !== 'nenhum'
                  ? { text: `vs. ${formatInt(extras.cmp.saturdays)}`, delta: { value: extras.cur.saturdays - extras.cmp.saturdays, kind: 'absolute', tone: 'none' } }
                  : undefined
              }
            />
            <KpiCard
              label="Pedidos mistos"
              value={k.mistos.value == null ? 'sem dado' : formatDec1(k.mistos.value)}
              unit={k.mistos.value == null ? undefined : '%'}
              compare={
                query.compare === 'nenhum' || k.mistos.compare == null
                  ? undefined
                  : {
                      text: `vs. ${formatDec1(k.mistos.compare)}%`,
                      delta: { value: absoluteChange(k.mistos.value, k.mistos.compare), kind: 'points', tone: 'none' },
                    }
              }
            />
          </div>

          <Card>
            <CardHeader
              title="Por dia"
              description={compareRange ? `Linha tracejada: ${formatDayShort(compareRange.from)} a ${formatDayShort(compareRange.to)}` : undefined}
              actions={
                <span data-no-print className="print:hidden">
                  <SegmentedControl
                    aria-label="Métrica do gráfico"
                    value={metric}
                    onValueChange={(v) => setMetric(v as MetricKey)}
                    options={METRIC_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
                  />
                </span>
              }
            />
            <CardBody>
              <BarCompareChart
                data={chartData}
                valueLabel={METRIC_OPTIONS.find((m) => m.value === metric)?.unit ?? 'Valor'}
                compareLabel="Período de comparação"
                valueFormatter={metric === 'ritmo' || metric === 'mistos' ? (v) => formatDec1(v) : formatInt}
                summary={`${METRIC_OPTIONS.find((m) => m.value === metric)?.unit ?? ''} por dia, de ${periodText}`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Operadores"
              description="Clique no cabeçalho para ordenar."
              actions={
                <Button size="sm" icon={<Download />} aria-disabled={!canExport || undefined} onClick={exportOperators} className="print:hidden">
                  Exportar CSV
                </Button>
              }
            />
            <OperatorsTable rows={model.operators} todayGoal={model.globalGoal} />
          </Card>

          <Card>
            <CardHeader
              title="Produtos do período"
              description="Ordenados por pedidos. Um pedido misto conta uma vez para cada SKU."
              actions={
                <Button size="sm" icon={<Download />} aria-disabled={!canExport || undefined} onClick={exportProducts} className="print:hidden">
                  Exportar CSV
                </Button>
              }
            />
            <ProductsTable rows={showAllProducts ? products : products.slice(0, PRODUCTS_PREVIEW)} offset={0} />
            {products.length > PRODUCTS_PREVIEW && (
              <div className="border-t border-line px-4 py-2 print:hidden">
                <Button size="sm" variant="ghost" onClick={() => setShowAllProducts((v) => !v)}>
                  {showAllProducts ? 'Mostrar só os primeiros' : `Mostrar os ${products.length} produtos`}
                </Button>
              </div>
            )}
          </Card>
          {query.compare !== 'nenhum' && compareRange && (
            <p className="text-ink-3">
              Comparação com {formatDayShort(compareRange.from)} a {formatDayShort(compareRange.to)}.{' '}
              <Delta value={percentChange(k.pedidos.value, k.pedidos.compare)} /> em pedidos.
            </p>
          )}
          <p className="hidden text-ink-3 print:block">Gerado em {formatDateTime(now)}.</p>
        </>
      )}
    </div>
  );
}

/* ---------- filtro de operadores ---------- */

function OperatorFilter({
  all,
  selected,
  onChange,
}: {
  all: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const shown = all.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="grid gap-1">
      <span className="text-ink-2">Operadores</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button icon={<Users />} className="w-52 justify-between" aria-label="Filtrar operadores">
            <span className="truncate">{selected.length === 0 ? 'Todos' : `${selected.length} selecionado${selected.length > 1 ? 's' : ''}`}</span>
            <ChevronDown className="ml-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <Input placeholder="Buscar operador" aria-label="Buscar operador" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="mt-2 max-h-60 overflow-auto">
            {shown.length === 0 && <li className="px-1 py-2 text-ink-3">Nenhum operador encontrado.</li>}
            {shown.map((o) => (
              <li key={o.id}>
                <label className="flex min-h-[30px] cursor-pointer items-center gap-2 rounded-sm px-1 hover:bg-hover">
                  <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                  <span className="truncate">{o.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={selected.length === 0}>
              Limpar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ---------- tabelas ---------- */

const toneClass = { ok: 'text-ok', warn: 'text-warn', neutral: '', none: '' } as const;

function OperatorsTable({ rows, todayGoal }: { rows: OperatorRow[]; todayGoal: number | null }) {
  const columns = useMemo<ColumnDef<OperatorRow>[]>(
    () => [
      { accessorKey: 'name', header: 'Operador', cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
      { accessorKey: 'orders', header: 'Pedidos', cell: (c) => formatInt(c.row.original.orders), meta: { align: 'right' } },
      { id: 'daysWorked', accessorFn: (r) => r.daysWorked ?? 0, header: 'Dias', cell: (c) => formatInt(c.row.original.daysWorked ?? 0), meta: { align: 'right' } },
      { accessorKey: 'hours', header: 'Horas', cell: (c) => formatDec1(c.row.original.hours), meta: { align: 'right' } },
      { id: 'rate', accessorFn: (r) => r.rate ?? -1, header: 'Ritmo', cell: (c) => formatRate(c.row.original.rate), meta: { align: 'right' } },
      {
        id: 'mixed',
        accessorFn: (r) => mixedShare(r.simpleOrders, r.mixedOrders) ?? -1,
        header: 'Mistos',
        cell: (c) => {
          const s = mixedShare(c.row.original.simpleOrders, c.row.original.mixedOrders);
          return s == null ? 'sem dado' : `${formatInt(c.row.original.mixedOrders)} (${formatDec1(s)}%)`;
        },
        meta: { align: 'right' },
      },
      { accessorKey: 'effectiveGoal', header: 'Meta', cell: (c) => formatRate(c.row.original.effectiveGoal), meta: { align: 'right' } },
      {
        id: 'goalRatio',
        accessorFn: (r) => r.goalRatio ?? -1,
        header: () => (
          <Tooltip content={periodGoalHint(todayGoal)}>
            <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:shadow-focus">
              {PERIOD_RATIO_LABEL}
            </span>
          </Tooltip>
        ),
        cell: (c) => <span className={toneClass[goalTone(c.row.original.goalRatio)]}>{formatRatio(c.row.original.goalRatio)}</span>,
        meta: { align: 'right' },
      },
    ],
    [todayGoal],
  );
  return (
    <DataTable
      aria-label="Operadores no período"
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      initialSorting={[{ id: 'orders', desc: true }]}
      empty={<EmptyState title="Nenhum operador com pedidos neste período" description="Mude o período ou tire o filtro de operadores." />}
      renderMobileCard={(r) => (
        <div className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <b>{r.name}</b>
            <span className="tabular">{formatInt(r.orders)} pedidos</span>
          </div>
          <p className="tabular text-ink-2">
            {formatRate(r.rate)} em {formatDec1(r.hours)} h, {formatInt(r.daysWorked ?? 0)} dias
          </p>
          <p className="tabular text-ink-3">
            Meta atual {formatRate(r.effectiveGoal)}, <span className={toneClass[goalTone(r.goalRatio)]}>{formatRatio(r.goalRatio)}</span>
          </p>
        </div>
      )}
    />
  );
}

function ProductsTable({ rows, offset }: { rows: ProductRow[]; offset: number }) {
  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      { id: 'pos', header: '#', enableSorting: false, cell: (c) => <span className="tabular text-ink-3">{offset + c.row.index + 1}</span> },
      { accessorKey: 'sku', header: 'SKU', cell: (c) => <span className="font-mono">{c.row.original.sku}</span> },
      { accessorKey: 'orders', header: 'Pedidos', cell: (c) => formatInt(c.row.original.orders), meta: { align: 'right' } },
      { accessorKey: 'mixedOrders', header: 'Em pedido misto', cell: (c) => formatInt(c.row.original.mixedOrders), meta: { align: 'right' } },
      { accessorKey: 'units', header: 'Unidades', cell: (c) => formatInt(c.row.original.units), meta: { align: 'right' } },
    ],
    [offset],
  );
  return (
    <DataTable
      aria-label="Produtos do período"
      data={rows}
      columns={columns}
      getRowId={(r) => r.sku}
      density="compact"
      empty={<EmptyState title="Nenhum produto neste período" />}
      renderMobileCard={(r) => (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono">{r.sku}</span>
          <span className="tabular">{formatInt(r.orders)} pedidos</span>
        </div>
      )}
    />
  );
}
