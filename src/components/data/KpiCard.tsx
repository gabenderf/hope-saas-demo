import type { ReactNode } from 'react';
import { Delta, type DeltaProps } from '@/components/charts/Delta';
import { Sparkline } from '@/components/charts/Sparkline';
import { InfoTip, type InfoTipProps } from '@/components/ui/InfoTip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

export interface KpiCardProps {
  label: string;
  icon?: ReactNode;
  /** Definição da métrica; abre por clique ou toque. */
  info?: Omit<InfoTipProps, 'label'>;
  value: string;
  unit?: string;
  spark?: (number | null | undefined)[];
  /** Linha de comparação: "vs. 999" + variação. */
  compare?: { text: string; delta: Pick<DeltaProps, 'value' | 'kind' | 'tone'> };
  /** Com onSelect o cartão vira botão com aria-pressed. */
  selected?: boolean;
  onSelect?: () => void;
  loading?: boolean;
  className?: string;
}

export function KpiCard({ label, icon, info, value, unit, spark, compare, selected, onSelect, loading, className }: KpiCardProps) {
  const body = loading ? (
    <div className="grid gap-2" aria-busy="true" aria-label={`Carregando ${label}`}>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-3.5 w-32" />
    </div>
  ) : (
    <div className="grid gap-2">
      <span className="flex items-center gap-1.5 pr-6 text-ink-2">
        {icon}
        {label}
      </span>
      <span className="flex items-end gap-3">
        <span className="tabular text-xl font-semibold leading-none">
          {value}
          {unit && <small className="ml-0.5 text-sm font-normal text-ink-3">{unit}</small>}
        </span>
        {spark && <Sparkline values={spark} highlight={selected} className="ml-auto" />}
      </span>
      {compare && (
        <span className="flex items-center gap-1.5 text-ink-3">
          <Delta {...compare.delta} />
          <span>{compare.text}</span>
        </span>
      )}
    </div>
  );

  const frame = cn(
    'block w-full rounded-md border bg-surface px-4 py-3 text-left transition-colors',
    selected ? 'border-accent-fill shadow-[inset_0_0_0_1px_var(--accent-fill)]' : 'border-line hover:border-line-strong',
  );

  return (
    <div className={cn('relative', className)}>
      {onSelect && !loading ? (
        <button type="button" aria-pressed={!!selected} onClick={onSelect} className={cn(frame, 'cursor-pointer')}>
          {body}
        </button>
      ) : (
        <div className={frame}>{body}</div>
      )}
      {info && !loading && (
        <span className="absolute right-3 top-3">
          <InfoTip label={label} {...info} />
        </span>
      )}
    </div>
  );
}
