import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';

export interface MiniBarsDatum {
  label: string;
  value: number | null;
}

export interface MiniBarsProps {
  data: MiniBarsDatum[];
  /** Altura da área das barras, px. */
  height?: number;
  /** Descrição para leitor de tela, ex.: "Pedidos por dia, últimos 7 dias". */
  'aria-label': string;
  className?: string;
}

/** Barras de dias; a última (hoje) em destaque. Cada barra traz o valor no title. */
export function MiniBars({ data, height = 96, className, ...aria }: MiniBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const summary = data.map((d) => `${d.label}: ${d.value == null ? 'sem dado' : formatInt(d.value)}`).join('; ');
  return (
    <div
      role="img"
      aria-label={`${aria['aria-label']}. ${summary}`}
      className={cn('grid items-end gap-2', className)}
      style={{ height, gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
    >
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="grid h-full content-end justify-items-center gap-1 text-xs text-ink-3" title={d.value == null ? undefined : formatInt(d.value)}>
          <span
            className={cn('block w-full rounded-t-[3px]', i === data.length - 1 ? 'bg-brand' : 'bg-chart-neutral')}
            style={{ height: `${d.value == null ? 0 : Math.max(2, (d.value / max) * 100 * 0.78)}%` }}
          />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
