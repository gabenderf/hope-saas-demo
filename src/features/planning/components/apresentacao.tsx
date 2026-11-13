/* eslint-disable react-refresh/only-export-components */
/**
 * Pequenas peças de apresentação do Planejamento: texto de variação, cartão
 * de número e moldura de gráfico. Nada aqui calcula regra de negócio.
 */
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { cn } from '@/lib/cn';
import { formatDec1 } from '@/lib/format';
import { type DayKey, weekdayOf } from '@/lib/time';
import { NOME_DIA } from '../model/datas';

/** "+12%" / "-3,5%" / "sem base" (nunca travessão). */
export function pctTxt(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return 'sem base';
  return `${v >= 0 ? '+' : ''}${v.toFixed(casas).replace('.', ',')}%`;
}

/** "+3,2" / "-1,0" com uma casa. */
export function sinalDec1(v: number): string {
  return `${v >= 0 ? '+' : ''}${formatDec1(v)}`;
}

export const nomeDia = (dia: DayKey): string => NOME_DIA[weekdayOf(dia)] ?? '';
export const nomeDiaMin = (dia: DayKey): string => nomeDia(dia).toLowerCase();

/** Cor da variação: subiu = teal, caiu = âmbar, parado = neutro. Nunca vermelho. */
export function corVariacao(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'text-ink-3';
  if (v > 2) return 'text-ok';
  if (v < -2) return 'text-warn';
  return 'text-ink-2';
}

export function Variacao({ valor, casas = 0, className }: { valor: number | null | undefined; casas?: number; className?: string }) {
  const up = valor != null && valor > 2;
  const down = valor != null && valor < -2;
  return (
    <span className={cn('tabular inline-flex items-center gap-0.5 font-medium', corVariacao(valor), className)}>
      {up && <ArrowUpRight className="size-3" aria-hidden="true" />}
      {down && <ArrowDownRight className="size-3" aria-hidden="true" />}
      {pctTxt(valor, casas)}
    </span>
  );
}

/** Cartão de número com linha de detalhe livre. Mesma moldura do KpiCard. */
export function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="grid gap-2">
        <span className="text-ink-2">{label}</span>
        <span className={cn('tabular text-xl font-semibold leading-none', tone === 'warn' && 'text-warn', tone === 'ok' && 'text-ok')}>{value}</span>
        {detail && <span className="text-ink-3">{detail}</span>}
      </div>
    </div>
  );
}

/**
 * Moldura de gráfico: legenda fora, resumo para leitor de tela e rolagem
 * horizontal no celular (o gráfico não encolhe abaixo de `minWidth`).
 */
export function ChartFrame({
  summary,
  legend,
  height = 260,
  minWidth = 520,
  children,
  rows,
}: {
  summary: string;
  legend: { label: string; swatch: 'bar' | 'bar-muted' | 'line' | 'dashed' | 'neutral' | 'warn' }[];
  height?: number;
  minWidth?: number;
  children: ReactNode;
  /** tabela equivalente, só para leitor de tela */
  rows?: { head: string[]; body: (string | number)[][] };
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <i
              aria-hidden="true"
              className={cn(
                'inline-block',
                l.swatch === 'bar' && 'size-2.5 rounded-[2px] bg-chart-bar',
                l.swatch === 'bar-muted' && 'size-2.5 rounded-[2px] bg-chart-bar-muted',
                l.swatch === 'warn' && 'size-2.5 rounded-[2px] bg-warn',
                l.swatch === 'line' && 'h-0.5 w-3.5 rounded-[1px] bg-chart-line',
                l.swatch === 'neutral' && 'h-0.5 w-3.5 rounded-[1px] bg-chart-neutral',
                l.swatch === 'dashed' && 'w-3.5 border-t-2 border-dashed border-chart-line',
              )}
            />
            {l.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div role="img" aria-label={summary} style={{ height, minWidth }} className="w-full">
          {children}
        </div>
      </div>
      {rows && (
        <VisuallyHidden>
          <table>
            <caption>{summary}</caption>
            <thead>
              <tr>
                {rows.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.body.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </VisuallyHidden>
      )}
    </div>
  );
}

export const EIXO = { fill: 'var(--text-3)', fontSize: 12 } as const;

/** Caixa do tooltip dos gráficos, no mesmo estilo do BarCompareChart. */
export function TipBox({ title, lines }: { title: string; lines: { label: string; value: string }[] }) {
  return (
    <div className="min-w-36 rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-popover">
      <p className="font-semibold">{title}</p>
      {lines.map((l) => (
        <p key={l.label} className="tabular mt-1 flex justify-between gap-4 text-ink-2">
          <span>{l.label}</span>
          <b className="font-semibold text-ink">{l.value}</b>
        </p>
      ))}
    </div>
  );
}
