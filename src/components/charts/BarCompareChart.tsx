import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';

export interface BarCompareDatum {
  label: string;
  /** null = hora futura: sem barra. */
  value: number | null;
  /** Mesmo ponto no período de comparação. */
  compare?: number | null;
  /** Hora em andamento: barra em tom claro. */
  partial?: boolean;
}

export interface BarCompareChartProps {
  data: BarCompareDatum[];
  /** Nome da série, ex.: "Pedidos". */
  valueLabel: string;
  compareLabel?: string;
  /** Linha horizontal da meta. */
  goal?: number;
  goalLabel?: string;
  yFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  /** Resumo para leitor de tela, ex.: "Pedidos por hora, de 07h a 19h". */
  summary: string;
  /** Legenda fora do gráfico (padrão: ligada quando há comparação ou meta). */
  legend?: boolean;
  height?: number;
  /** Tamanho do texto dos eixos e da legenda em px (padrão 12). O Modo TV passa maior, para ler a 5 m. */
  fontSize?: number;
  className?: string;
}

interface TipProps {
  active?: boolean;
  payload?: readonly { payload?: BarCompareDatum }[];
}

function ChartTip({ active, payload, valueLabel, compareLabel, fmt }: TipProps & { valueLabel: string; compareLabel?: string; fmt: (v: number) => string }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="min-w-36 rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-popover">
      <p className="font-semibold">
        {d.label}
        {d.partial && <span className="ml-1.5 font-normal text-ink-3">hora em andamento</span>}
      </p>
      <p className="tabular mt-1 flex justify-between gap-4 text-ink-2">
        <span>{valueLabel}</span>
        <b className="font-semibold text-ink">{d.value == null ? 'sem dado' : fmt(d.value)}</b>
      </p>
      {d.compare != null && (
        <p className="tabular flex justify-between gap-4 text-ink-2">
          <span>{compareLabel ?? 'Comparação'}</span>
          <b className="font-semibold text-ink">{fmt(d.compare)}</b>
        </p>
      )}
    </div>
  );
}

export function BarCompareChart({
  data,
  valueLabel,
  compareLabel,
  goal,
  goalLabel = 'Meta',
  yFormatter = formatInt,
  valueFormatter = formatInt,
  summary,
  legend,
  height = 260,
  fontSize = 12,
  className,
}: BarCompareChartProps) {
  const hasCompare = data.some((d) => d.compare != null);
  const showLegend = legend ?? (hasCompare || goal != null);
  const scale = fontSize / 12;
  const tick = { fill: 'var(--text-3)', fontSize };
  return (
    <div className={cn('grid gap-3', className)}>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3" style={fontSize !== 12 ? { fontSize: fontSize + 1 } : undefined}>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-[2px] bg-chart-bar" aria-hidden="true" />
            {valueLabel}
          </span>
          {hasCompare && (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-3.5 border-t-2 border-dashed border-chart-line" aria-hidden="true" />
              {compareLabel ?? 'Comparação'}
            </span>
          )}
          {goal != null && (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-3.5 rounded-[1px] bg-chart-neutral" aria-hidden="true" />
              {goalLabel}
            </span>
          )}
        </div>
      )}
      <div role="img" aria-label={summary} style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={tick} interval="preserveStartEnd" />
            <YAxis width={Math.round(40 * scale)} tickLine={false} axisLine={false} tick={tick} tickFormatter={yFormatter} />
            <Tooltip
              cursor={{ fill: 'var(--surface-hover)' }}
              isAnimationActive={false}
              content={(p) => <ChartTip active={p.active} payload={p.payload as TipProps['payload']} valueLabel={valueLabel} compareLabel={compareLabel} fmt={valueFormatter} />}
            />
            {goal != null && <ReferenceLine y={goal} stroke="var(--chart-neutral)" strokeWidth={2} ifOverflow="extendDomain" />}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={Math.round(28 * scale)} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.partial ? 'var(--chart-bar-muted)' : 'var(--chart-bar)'} />
              ))}
            </Bar>
            {hasCompare && (
              <Line dataKey="compare" type="monotone" stroke="var(--chart-line)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <VisuallyHidden>
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Período</th>
              <th scope="col">{valueLabel}</th>
              {hasCompare && <th scope="col">{compareLabel ?? 'Comparação'}</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.partial ? `${d.label} (em andamento)` : d.label}</th>
                <td>{d.value == null ? 'sem dado' : valueFormatter(d.value)}</td>
                {hasCompare && <td>{d.compare == null ? 'sem dado' : valueFormatter(d.compare)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </div>
  );
}
