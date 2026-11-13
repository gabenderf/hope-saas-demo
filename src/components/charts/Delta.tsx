/* eslint-disable react-refresh/only-export-components */
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDec1, formatSignedPercent, formatSignedPoints } from '@/lib/format';

export type DeltaKind = 'percent' | 'points' | 'absolute';
export type DeltaTone = 'auto' | 'none';

export interface DeltaInfo {
  direction: 'up' | 'down' | 'flat';
  /** up = melhor (teal), down = pior (âmbar), flat = sem cor. */
  color: 'up' | 'down' | 'flat';
  text: string;
}

const FLAT_BELOW: Record<DeltaKind, number> = { percent: 0.5, points: 0.3, absolute: 0.5 };

/** Lógica pura: sinal, tom e texto. Variação nunca é vermelha (vermelho é falha de sistema). */
export function deltaInfo(value: number | null | undefined, kind: DeltaKind = 'percent', tone: DeltaTone = 'auto'): DeltaInfo {
  if (value == null || !Number.isFinite(value)) return { direction: 'flat', color: 'flat', text: 'sem base' };
  const flat = Math.abs(value) < FLAT_BELOW[kind];
  const direction = flat ? 'flat' : value > 0 ? 'up' : 'down';
  const text =
    kind === 'percent'
      ? formatSignedPercent(value)
      : kind === 'points'
        ? formatSignedPoints(value)
        : `${value > 0 ? '+' : ''}${formatDec1(value).replace(/,0$/, '')}`;
  return { direction, color: tone === 'none' ? 'flat' : direction, text };
}

const colorClass = { up: 'text-ok', down: 'text-warn', flat: 'text-ink-3' } as const;
const icons = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

export interface DeltaProps {
  value: number | null | undefined;
  kind?: DeltaKind;
  /** `none` para métrica que não é boa nem ruim (pedidos mistos). */
  tone?: DeltaTone;
  className?: string;
}

export function Delta({ value, kind = 'percent', tone = 'auto', className }: DeltaProps) {
  const info = deltaInfo(value, kind, tone);
  const Icon = icons[info.direction];
  return (
    <span
      data-direction={info.direction}
      data-color={info.color}
      className={cn('tabular inline-flex items-center gap-0.5 font-medium', colorClass[info.color], className)}
    >
      {value != null && Number.isFinite(value) && <Icon className="size-3" aria-hidden="true" />}
      {info.text}
    </span>
  );
}
