import { useEffect, useState, type ReactNode } from 'react';
import { BarCompareChart, Meter } from '@/components/charts';
import { Skeleton } from '@/components/ui';
import type { OverviewModel } from '@/data/types';
import type { ForecastSummary } from '@/features/forecast/public';
import { cn } from '@/lib/cn';
import { formatInt, formatRate, formatSignedPercent, formatTime } from '@/lib/format';
import { percentChange } from '@/lib/metrics';
import { orderOperators, paginate, showsRank, teamGoal, type Privacy } from './model';
import { useViewportHeight } from './tv-hooks';

/** Tamanhos que escalam com a tela (1280x720 a 3840x2160). */
const HUGE = 'text-[clamp(3.5rem,14vh,14rem)] leading-none';
const BIG = 'text-[clamp(2rem,7vh,7rem)] leading-none';
const TEXT = 'text-[clamp(1rem,2.6vh,2.6rem)]';
const SMALL = 'text-[clamp(0.875rem,2vh,2rem)]';

function Stat({ label, children, note, className }: { label: string; children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col justify-between gap-[2vh] rounded-lg border border-line bg-surface p-[3vh]', className)}>
      <h2 className={cn('font-medium text-ink-2', TEXT)}>{label}</h2>
      <div className="tabular font-semibold">{children}</div>
      {note && <p className={cn('text-ink-2', SMALL)}>{note}</p>}
    </section>
  );
}

export function PanelSkeleton() {
  return (
    <div className="grid h-full grid-cols-2 gap-[2vh] max-md:grid-cols-1" aria-busy="true" aria-label="Carregando painel">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-full min-h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}

/* ---------- 1. Agora ---------- */

export function NowPanel({ model, forecast }: { model: OverviewModel; forecast: ForecastSummary | null }) {
  const orders = model.kpis.pedidos;
  const change = percentChange(orders.value, orders.compare);
  const rate = model.kpis.ritmo.value;
  const goal = teamGoal(model.operators, model.globalGoal);
  const active = model.kpis.ativos.value;
  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-[2vh] max-md:grid-cols-1 max-md:grid-rows-none">
      <Stat
        label="Pedidos de hoje"
        note={
          change == null
            ? model.compareLabel
            : `${formatSignedPercent(change)} contra ${model.compareLabel.toLowerCase()} (${formatInt(orders.compare ?? 0)})`
        }
      >
        <span className={HUGE}>{orders.value == null ? 'sem dado' : formatInt(orders.value)}</span>
      </Stat>
      <Stat label={`Ritmo do time, meta ${formatRate(goal)}`}>
        <div className={BIG}>{formatRate(rate)}</div>
        <div className={cn('mt-[2vh] font-normal', TEXT)}>
          <Meter value={rate} goal={goal} className="[&>div:first-child]:h-[1.4vh]" />
        </div>
      </Stat>
      <Stat label="Operadores ativos" note="Na bancada agora">
        <span className={BIG}>{active == null ? 'sem dado' : formatInt(active)}</span>
      </Stat>
      {forecast ? (
        <Stat
          label="Obrigatório pendente"
          note={forecast.projectedFinishAt ? `Término previsto às ${formatTime(forecast.projectedFinishAt)}` : 'Término ainda sem previsão'}
        >
          <span className={BIG}>{formatInt(forecast.mandatoryPending)}</span>
        </Stat>
      ) : (
        <Stat label="Pedidos mistos hoje" note="Parcela de pedidos com dois ou mais SKUs">
          <span className={BIG}>{model.kpis.mistos.value == null ? 'sem dado' : `${Math.round(model.kpis.mistos.value)}%`}</span>
        </Stat>
      )}
    </div>
  );
}

/* ---------- 2. Operadores ---------- */

export function OperatorsPanel({
  model,
  privacy,
  intervalSec,
  paused,
}: {
  model: OverviewModel;
  privacy: Privacy;
  intervalSec: number;
  paused: boolean;
}) {
  const rows = orderOperators(model.operators, privacy);
  const pages = paginate(rows);
  const [page, setPage] = useState(0);
  const count = pages.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = window.setInterval(() => setPage((p) => (p + 1) % count), (intervalSec * 1000) / count);
    return () => window.clearInterval(id);
  }, [count, paused, intervalSec]);

  const current = pages[Math.min(page, Math.max(0, count - 1))] ?? [];
  const offset = Math.min(page, Math.max(0, count - 1)) * 10;
  const ranked = showsRank(privacy);

  if (rows.length === 0) {
    return (
      <p className={cn('grid h-full place-items-center text-ink-2', TEXT)}>Ninguém bipou pedido ainda hoje. Os operadores aparecem aqui assim que a primeira bipagem chegar.</p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-[1.4vh]">
      <ol className="grid min-h-0 flex-1 auto-rows-fr gap-[1vh]">
        {current.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              'grid min-w-0 items-center gap-[2vh] rounded-md border border-line bg-surface px-[2vh]',
              ranked ? 'grid-cols-[3ch_minmax(0,1.4fr)_9ch_12ch_minmax(0,1.6fr)]' : 'grid-cols-[minmax(0,1.4fr)_9ch_12ch_minmax(0,1.6fr)]',
              'max-md:grid-cols-[minmax(0,1fr)_auto]',
              TEXT,
            )}
          >
            {ranked && <span className="tabular text-ink-3 max-md:hidden">{offset + i + 1}</span>}
            <span className="min-w-0 truncate font-semibold">
              {r.name}
              {r.station && <span className={cn('ml-[1.5vh] font-normal text-ink-3', SMALL)}>Bancada {r.station}</span>}
            </span>
            <span className="tabular text-right font-semibold">{formatInt(r.orders)}</span>
            <span className="tabular text-right text-ink-2 max-md:hidden">{formatRate(r.rate)}</span>
            <Meter value={r.rate} goal={r.effectiveGoal} className="max-md:hidden [&_span]:hidden [&>div:first-child]:h-[1.2vh]" />
            <span className="tabular hidden text-right text-ink-2 max-md:block">{formatRate(r.rate)}</span>
          </li>
        ))}
      </ol>
      {count > 1 && (
        <p className={cn('text-center text-ink-3', SMALL)} aria-live="off">
          Página {page + 1} de {count}
        </p>
      )}
    </div>
  );
}

/* ---------- 3. Por hora ---------- */

export function HourlyPanel({ model }: { model: OverviewModel }) {
  const vh = useViewportHeight();
  const data = model.buckets.map((b) => ({
    label: b.label,
    value: b.future ? null : b.values.pedidos,
    compare: b.compare.pedidos,
    partial: b.partial,
  }));
  return (
    <div className={cn('flex h-full flex-col justify-center', TEXT)}>
      <BarCompareChart
        data={data}
        valueLabel="Hoje"
        compareLabel={model.compareLabel}
        summary={`Pedidos por hora hoje contra ${model.compareLabel.toLowerCase()}`}
        height={Math.round(vh * 0.58)}
        // legível a 5 m: ~2,4% da altura da tela (26px em 1080p, 52px em 4K)
        fontSize={Math.max(14, Math.round(vh * 0.024))}
      />
    </div>
  );
}

/* ---------- 4. Previsão ---------- */

export function ForecastPanel({ forecast }: { forecast: ForecastSummary }) {
  const late =
    forecast.projectedFinishAt != null && forecast.deadlineAt != null && Date.parse(forecast.projectedFinishAt) > Date.parse(forecast.deadlineAt);
  const noCollection = forecast.status === 'sem-coleta';
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      {(noCollection || forecast.truncatedQueue) && (
        <p className={cn('rounded-md border px-[2vh] py-[1.2vh]', SMALL, noCollection ? 'border-crit/30 bg-crit-soft text-ink' : 'border-warn/30 bg-warn-soft text-ink')}>
          {noCollection ? 'Sem coleta de dados hoje. A previsão pode estar desatualizada.' : 'Fila incompleta na leitura. Os números podem estar abaixo do real.'}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-[2vh] max-md:grid-cols-1 max-md:grid-rows-none">
        <Stat
          label="Obrigatório de hoje"
          note={forecast.mandatoryInitial != null ? `Eram ${formatInt(forecast.mandatoryInitial)} no início do dia` : undefined}
        >
          <span className={BIG}>{formatInt(forecast.mandatoryPending)}</span>
        </Stat>
        <Stat
          label="Término previsto"
          note={forecast.deadlineAt ? `Limite do dia às ${formatTime(forecast.deadlineAt)}` : undefined}
        >
          <span className={cn(BIG, late && 'text-warn')}>{forecast.projectedFinishAt ? formatTime(forecast.projectedFinishAt) : 'sem previsão'}</span>
        </Stat>
        <Stat label="Ritmo necessário contra o atual" note="Pedidos por hora">
          <span className={BIG}>
            {formatRate(forecast.requiredRate)}
            <span className="text-ink-3"> / </span>
            {formatRate(forecast.currentRate)}
          </span>
        </Stat>
        <Stat label="Adiantando amanhã" note="Pendentes que não vencem hoje">
          <span className={BIG}>{formatInt(forecast.aheadPending)}</span>
        </Stat>
      </div>
    </div>
  );
}
