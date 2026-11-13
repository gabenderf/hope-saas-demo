/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/cn';
import { formatRate } from '@/lib/format';
import { type GoalTone, goalTone } from '@/lib/metrics';

/** A escala é fixa (0 a 1,5 x meta) para as linhas da tabela serem comparáveis. */
export const METER_SCALE = 1.5;

export interface MeterGeometry {
  /** Largura da barra, 0 a 100. */
  fillPct: number;
  /** Posição da marca da meta, 0 a 100. */
  goalPct: number;
  tone: GoalTone;
}

export function meterGeometry(value: number | null | undefined, goal: number): MeterGeometry {
  const goalPct = 100 / METER_SCALE;
  if (value == null || !Number.isFinite(value) || !(goal > 0)) return { fillPct: 0, goalPct, tone: 'none' };
  const ratio = value / goal;
  const fillPct = Math.min(100, Math.max(0, (ratio / METER_SCALE) * 100));
  return { fillPct, goalPct, tone: goalTone(ratio) };
}

const fillTone: Record<GoalTone, string> = {
  ok: 'bg-brand',
  neutral: 'bg-chart-bar-muted',
  warn: 'bg-warn',
  none: 'bg-chart-neutral',
};

export interface MeterProps {
  value: number | null | undefined;
  goal: number;
  /** mini: 72px, sem rótulo de meta. completa: barra larga com o valor ao lado. */
  variant?: 'mini' | 'full';
  className?: string;
}

/** Realizado contra a meta. Sem trilho cheio: a referência é a marca vertical da meta. */
export function Meter({ value, goal, variant = 'full', className }: MeterProps) {
  const { fillPct, goalPct, tone } = meterGeometry(value, goal);
  const mini = variant === 'mini';
  const label = value == null ? 'sem dado' : `${formatRate(value)}, meta ${formatRate(goal)}`;
  return (
    <div
      role="img"
      aria-label={label}
      data-tone={tone}
      className={cn(
        'inline-grid items-center gap-2',
        mini ? 'grid-cols-[72px_auto]' : 'w-full min-w-40 grid-cols-[minmax(0,1fr)_auto] gap-3',
        className,
      )}
    >
      <div className={cn('relative', mini ? 'h-1.5' : 'h-2')}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div data-part="fill" className={cn('absolute inset-y-0 left-0 rounded-sm', fillTone[tone])} style={{ width: `${fillPct}%` }} />
        <div data-part="goal" className="absolute -inset-y-[3px] w-0.5 rounded-[1px] bg-ink" style={{ left: `${goalPct}%` }} />
      </div>
      <span className={cn('tabular text-right', mini ? 'min-w-[3.2em] text-xs text-ink-2' : 'min-w-[3.4em] font-semibold')}>
        {value == null ? 'sem dado' : formatRate(value)}
      </span>
    </div>
  );
}
