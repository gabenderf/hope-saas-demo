/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';

/** Escala: um pouco além do maior entre realizado e esperado, para a marca nunca colar na ponta. */
export function dayLineGeometry(realized: number, expected: number): { fillPct: number; markPct: number } {
  const scale = Math.max(realized, expected, 1) * 1.1;
  return { fillPct: Math.min(100, (Math.max(0, realized) / scale) * 100), markPct: Math.min(100, (Math.max(0, expected) / scale) * 100) };
}

export interface DayLineProps {
  realized: number;
  /** Quanto já deveria ter saído a esta hora para fechar o dia no ritmo. */
  expected: number;
  unit?: string;
  className?: string;
}

/** Barra fina do dia: realizado contra o esperado, com marca vertical no esperado. */
export function DayLine({ realized, expected, unit = 'pedidos', className }: DayLineProps) {
  const { fillPct, markPct } = dayLineGeometry(realized, expected);
  return (
    <div
      role="img"
      aria-label={`${formatInt(realized)} ${unit} feitos, ${formatInt(expected)} esperados até agora`}
      className={cn('relative h-1.5', className)}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      <div data-part="fill" className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${fillPct}%` }} />
      <div data-part="mark" className="absolute -inset-y-[3px] w-0.5 rounded-[1px] bg-ink" style={{ left: `${markPct}%` }} />
    </div>
  );
}
