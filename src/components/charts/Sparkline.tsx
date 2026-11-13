/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/cn';

const W = 96;
const H = 28;

/** Caminhos SVG de linha e área. Valores nulos são pulados. Retorna null com menos de 2 pontos. */
export function sparklinePaths(values: (number | null | undefined)[]): { line: string; area: string } | null {
  const n = values.length - 1;
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pts = values
    .map((v, i) => (v == null || !Number.isFinite(v) ? null : ([(i / n) * W, H - 2 - ((v - min) / (max - min || 1)) * (H - 4)] as const)))
    .filter((p): p is readonly [number, number] => p !== null);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  return { line, area: `${line}L${last[0].toFixed(1)},${H}L${first[0].toFixed(1)},${H}Z` };
}

export interface SparklineProps {
  values: (number | null | undefined)[];
  /** Destaque em teal (ex.: KPI selecionado). */
  highlight?: boolean;
  className?: string;
}

/** Decorativo (aria-hidden): o número ao lado carrega a informação. */
export function Sparkline({ values, highlight, className }: SparklineProps) {
  const paths = sparklinePaths(values);
  if (!paths) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={cn('h-7 w-24 shrink-0', className)}>
      <path d={paths.area} className={highlight ? 'fill-accent-soft' : 'fill-sunk'} />
      <path
        d={paths.line}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={highlight ? 'stroke-brand' : 'stroke-ink-3'}
      />
    </svg>
  );
}
