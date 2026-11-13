import type { BarCompareDatum } from '@/components/charts/BarCompareChart';
import type { Bucket, CompareKey, MetricKey, OperatorRow, RangeKey } from '@/data/types';

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias úteis' },
  { value: '30d', label: 'Últimos 30 dias' },
];

export const COMPARE_LABEL: Record<CompareKey, string> = {
  'dia-util-anterior': 'Dia útil anterior, mesmo horário',
  'semana-passada': 'Mesmo dia da semana passada',
  'periodo-anterior': 'Período anterior',
};

export const COMPARE_KEYS: readonly CompareKey[] = ['dia-util-anterior', 'semana-passada', 'periodo-anterior'];

/** Comparações que fazem sentido para cada período. A primeira é a padrão. */
export function compareOptionsFor(range: RangeKey): CompareKey[] {
  return range === 'hoje' ? ['dia-util-anterior', 'semana-passada'] : ['periodo-anterior'];
}

/** Valor da URL inválido para o período cai na comparação padrão. */
export function resolveCompare(range: RangeKey, requested: CompareKey): CompareKey {
  const options = compareOptionsFor(range);
  return options.includes(requested) ? requested : options[0]!;
}

export const METRIC_KEYS: readonly MetricKey[] = ['pedidos', 'ritmo', 'ativos', 'mistos'];

export const METRIC_TITLE: Record<MetricKey, string> = {
  pedidos: 'Pedidos',
  ritmo: 'Ritmo (pedidos por hora)',
  ativos: 'Operadores ativos',
  mistos: 'Pedidos mistos (%)',
};

/** Pontos do gráfico principal. Hora futura fica sem barra; a comparação segue valendo. */
export function chartData(buckets: Bucket[], metric: MetricKey): BarCompareDatum[] {
  return buckets.map((b) => ({
    label: b.label,
    value: b.future ? null : b.values[metric],
    compare: b.compare[metric],
    partial: b.partial,
  }));
}

/** Meta que o gráfico de ritmo desenha: média das metas efetivas de quem não está inativo. */
export function averageGoal(rows: Pick<OperatorRow, 'effectiveGoal' | 'status'>[]): number | undefined {
  const list = rows.filter((r) => r.status !== 'inativo');
  if (list.length === 0) return undefined;
  return list.reduce((s, r) => s + r.effectiveGoal, 0) / list.length;
}

/** Linhas da tabela da Visão Geral: hoje mostra quem está na bancada ou já bipou; períodos, quem teve pedido. */
export function visibleOverviewRows(rows: OperatorRow[], range: RangeKey): OperatorRow[] {
  return rows.filter((r) => (range === 'hoje' ? r.orders > 0 || r.status === 'ativo' : r.orders > 0));
}
