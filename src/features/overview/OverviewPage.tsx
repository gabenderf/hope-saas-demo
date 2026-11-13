import { Copy, Download, Gauge, Layers, PackageCheck, RefreshCw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useCan } from '@/auth';
import { BarCompareChart } from '@/components/charts/BarCompareChart';
import { KpiCard } from '@/components/data';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/toast';
import { useNow, useOverview } from '@/data/hooks';
import type { CompareKey, MetricKey, OverviewModel, RangeKey } from '@/data/types';
import { OperatorDrawer } from '@/features/operators/components/OperatorDrawer';
import { OperatorsTable } from '@/features/operators/components/OperatorsTable';
import { OPERATOR_CSV_COLUMNS } from '@/features/operators/components/operatorsCsv';
import { QueryError } from '@/features/operators/components/QueryError';
import { useForecastSummary } from '@/features/forecast/public';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDec1, formatInt, formatRate, formatRelative, formatTime } from '@/lib/format';
import { useUrlEnum } from '@/lib/url-state';
import { GlobalGoalStrip } from './GlobalGoalStrip';
import { COMPARE_KEYS, COMPARE_LABEL, METRIC_KEYS, METRIC_TITLE, RANGE_OPTIONS, averageGoal, chartData, compareOptionsFor, resolveCompare, visibleOverviewRows } from './overviewModel';
import { percentChange, absoluteChange } from '@/lib/metrics';

const RANGES: readonly RangeKey[] = ['hoje', '7d', '30d'];

const METRIC_INFO: Record<MetricKey, { label: string; definition: string; source: string }> = {
  pedidos: {
    label: 'Pedidos separados',
    definition: 'Pedidos bipados no período. Conta pedido, não item: um pedido misto conta 1.',
    source: 'pedidos_separados',
  },
  ritmo: {
    label: 'Ritmo médio',
    definition: 'Pedidos ÷ horas desde o primeiro registro do dia. O ritmo do time é a média simples dos ritmos individuais. É a mesma conta da aba Previsão.',
    source: 'pedidos_separados + logs_acesso',
  },
  ativos: {
    label: 'Operadores ativos',
    definition: 'Hoje: operadores com status ativo na bancada agora. Em período: operadores que biparam ao menos um dia.',
    source: 'operadores_metas + logs_acesso',
  },
  mistos: {
    label: 'Pedidos mistos',
    definition: 'Fatia dos pedidos com dois ou mais SKUs distintos. Mesma definição da aba Planejamento.',
    source: 'pedidos_separados',
  },
};

const METRIC_ICON = { pedidos: <PackageCheck />, ritmo: <Gauge />, ativos: <Users />, mistos: <Layers /> } as const;

function formatKpi(metric: MetricKey, v: number | null): string {
  if (v == null) return 'sem dado';
  return metric === 'pedidos' || metric === 'ativos' ? formatInt(v) : formatDec1(v);
}
const KPI_UNIT: Record<MetricKey, string | undefined> = { pedidos: undefined, ritmo: '/h', ativos: undefined, mistos: '%' };

function kpiCompare(metric: MetricKey, value: number | null, compare: number | null) {
  if (compare == null) return { text: 'sem base de comparação', delta: { value: null } };
  const text = `vs. ${formatKpi(metric, compare)}${KPI_UNIT[metric] ?? ''}`;
  if (metric === 'ativos') return { text, delta: { value: absoluteChange(value, compare), kind: 'absolute' as const } };
  if (metric === 'mistos') return { text, delta: { value: absoluteChange(value, compare), kind: 'points' as const, tone: 'none' as const } };
  return { text, delta: { value: percentChange(value, compare), kind: 'percent' as const } };
}

function metricFormatters(metric: MetricKey): { y: (v: number) => string; value: (v: number) => string } {
  if (metric === 'ritmo') return { y: formatDec1, value: formatRate };
  if (metric === 'mistos') return { y: (v) => `${formatInt(v)}%`, value: (v) => `${formatDec1(v)}%` };
  return { y: formatInt, value: formatInt };
}

function ForecastLine() {
  const f = useForecastSummary();
  if (!f) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-ink-2">
      <span>
        Obrigatório de hoje: <b className="tabular font-semibold text-ink">{formatInt(f.mandatoryPending)} pendentes</b>
        {f.projectedFinishAt ? `, término previsto às ${formatTime(f.projectedFinishAt)}` : ''}
      </span>
      <Link to="/expedicao/previsao" className="text-accent underline-offset-4 hover:underline">
        Ver previsão
      </Link>
    </p>
  );
}

export default function OverviewPage() {
  const [range, setRange] = useUrlEnum<RangeKey>('periodo', RANGES, 'hoje');
  const [vsRaw, setVs] = useUrlEnum<CompareKey>('vs', COMPARE_KEYS, compareOptionsFor(range)[0]!);
  const vs = resolveCompare(range, vsRaw);
  const [metric, setMetric] = useUrlEnum<MetricKey>('metrica', METRIC_KEYS, 'pedidos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canExport = useCan('expedicao.exportar');
  const now = useNow(10_000);

  const q = useOverview({ range, compare: vs });
  const model: OverviewModel | undefined = q.data;
  const rows = useMemo(() => (model ? visibleOverviewRows(model.operators, range) : []), [model, range]);
  const isToday = range === 'hoje';

  const updatedMs = q.dataUpdatedAt;
  const stale = updatedMs > 0 && now.getTime() - updatedMs > 5 * 60_000;
  const updatedText = updatedMs > 0 ? `Atualizado ${formatRelative(new Date(updatedMs), now)}` : 'Carregando';

  const exportCsv = () => {
    if (!canExport) return toast('Exportar exige o perfil Liderança ou Administrador.');
    downloadCsv(`operadores-${range}`, toCsv(rows, OPERATOR_CSV_COLUMNS));
    toast.success(`${rows.length} ${rows.length === 1 ? 'operador exportado' : 'operadores exportados'}.`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Copie o endereço da barra do navegador.');
    }
  };

  const goal = metric === 'ritmo' && model ? averageGoal(model.operators) : undefined;
  const fmt = metricFormatters(metric);

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
      <PageHeader
        title="Visão Geral"
        breadcrumbs={[{ label: 'Expedição', to: '/expedicao' }, { label: 'Visão Geral' }]}
        renderLink={(c) => <Link to={c.to}>{c.label}</Link>}
        meta={<span className={stale ? 'text-warn' : undefined}>{updatedText}</span>}
        actions={
          <>
            <SegmentedControl aria-label="Período" value={range} onValueChange={(v) => setRange(v as RangeKey)} options={RANGE_OPTIONS} />
            <Select
              aria-label="Comparar com"
              className="w-auto min-w-52"
              value={vs}
              onValueChange={(v) => setVs(v as CompareKey)}
              options={compareOptionsFor(range).map((k) => ({ value: k, label: COMPARE_LABEL[k] }))}
            />
            <IconButton aria-label="Atualizar agora" variant="secondary" onClick={() => void q.refetch()}>
              <RefreshCw className={q.isFetching ? 'animate-spin' : undefined} />
            </IconButton>
            <Button icon={<Download />} aria-disabled={!canExport || undefined} onClick={exportCsv} disabled={!model}>
              Exportar
            </Button>
            <Button icon={<Copy />} onClick={() => void copyLink()}>
              Copiar link
            </Button>
          </>
        }
      />

      {q.isError ? (
        <QueryError what="a Visão Geral" onRetry={() => void q.refetch()} />
      ) : (
        <>
          {model ? (
            <GlobalGoalStrip globalGoal={model.globalGoal} globalGoalUpdatedAt={model.globalGoalUpdatedAt} />
          ) : (
            <Skeleton className="h-12 w-full" />
          )}
          <ForecastLine />

          <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {METRIC_KEYS.map((k) => {
              const kpi = model?.kpis[k];
              return (
                <KpiCard
                  key={k}
                  label={METRIC_INFO[k].label}
                  icon={METRIC_ICON[k]}
                  info={{ definition: METRIC_INFO[k].definition, source: METRIC_INFO[k].source }}
                  loading={!model}
                  value={formatKpi(k, kpi?.value ?? null)}
                  unit={kpi?.value == null ? undefined : KPI_UNIT[k]}
                  spark={model?.buckets.filter((b) => !b.future).map((b) => b.values[k])}
                  compare={kpi ? kpiCompare(k, kpi.value, kpi.compare) : undefined}
                  selected={metric === k}
                  onSelect={() => setMetric(k)}
                />
              );
            })}
          </section>

          <Card>
            <CardHeader
              title={`${METRIC_TITLE[metric]} ${isToday ? 'por hora' : 'por dia útil'}`}
              description={model ? `${model.label}, ${model.sublabel}. Linha tracejada: ${model.compareLabel.toLowerCase()}.` : undefined}
            />
            <CardBody>
              {model ? (
                <BarCompareChart
                  data={chartData(model.buckets, metric)}
                  valueLabel={METRIC_TITLE[metric]}
                  compareLabel={model.compareLabel}
                  goal={goal}
                  goalLabel="Meta média"
                  yFormatter={fmt.y}
                  valueFormatter={fmt.value}
                  summary={`${METRIC_TITLE[metric]} ${isToday ? 'por hora' : 'por dia útil'}, ${model.label}`}
                />
              ) : (
                <Skeleton className="h-[260px] w-full" />
              )}
            </CardBody>
          </Card>

          <Card className="py-3">
            <CardHeader title="Operadores" description={model ? `${model.label}. Clique em uma linha para ver o dia do operador.` : undefined} className="pt-0" />
            <OperatorsTable
              aria-label="Operadores"
              rows={rows}
              loading={!model}
              showStart={isToday}
              period={!isToday}
              todayGoal={model?.globalGoal ?? null}
              exportName={`operadores-${range}`}
              onOpen={(r) => setSelectedId(r.id)}
              empty={
                <EmptyState
                  icon={<Users />}
                  title={isToday ? 'Ninguém bipou ainda hoje' : 'Nenhum pedido neste período'}
                  description={
                    isToday
                      ? 'Os operadores aparecem assim que a extensão registrar o primeiro pedido de cada bancada.'
                      : 'Escolha outro período ou confira se a extensão estava registrando os pedidos nesses dias.'
                  }
                />
              }
            />
          </Card>
        </>
      )}

      <OperatorDrawer operatorId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
