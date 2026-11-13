import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { operatorPath } from '@/app/intents';
import { BarCompareChart } from '@/components/charts/BarCompareChart';
import { MiniBars } from '@/components/charts/MiniBars';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet, SheetContent } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOperatorDetail } from '@/data/hooks';
import type { OperatorDetailModel } from '@/data/types';
import { formatDayShort, formatDec1, formatInt, formatRatio, formatTime } from '@/lib/format';
import { ActivityList } from './ActivityList';
import { mixedPercent } from './columns';
import { StatusBadge } from './StatusBadge';
import { OperatorGoalForm } from './OperatorGoalForm';
import { QueryError } from './QueryError';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tabular font-semibold">{children}</dd>
    </div>
  );
}

export function OperatorHourlyChart({ detail, height = 160 }: { detail: OperatorDetailModel; height?: number }) {
  return (
    <BarCompareChart
      height={height}
      valueLabel="Pedidos"
      summary={`Pedidos de ${detail.operator.name} por hora, hoje`}
      data={detail.hourly.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}h`, value: h.future ? null : h.orders, partial: h.partial }))}
    />
  );
}

export function OperatorStats({ detail }: { detail: OperatorDetailModel }) {
  const t = detail.today;
  const mixed = mixedPercent(t);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Stat label="Pedidos hoje">{formatInt(t.orders)}</Stat>
      <Stat label="Ritmo">{t.rate == null ? 'sem dado' : `${formatDec1(t.rate)}/h`}</Stat>
      <Stat label="Contra a meta">{formatRatio(t.goalRatio)}</Stat>
      <Stat label="Meta valendo">
        {formatInt(t.effectiveGoal)}/h <span className="font-normal text-ink-3">{t.goalSource === 'global' ? 'global' : 'individual'}</span>
      </Stat>
      <Stat label="Mistos">{mixed == null ? 'sem dado' : `${formatDec1(mixed)}%`}</Stat>
      <Stat label="Início">{t.startAt ? <span className="font-mono">{formatTime(t.startAt)}</span> : 'sem registro'}</Stat>
    </dl>
  );
}

export interface OperatorDrawerProps {
  operatorId: string | null;
  onClose: () => void;
}

/** Painel lateral (sheet de baixo no celular) com o dia do operador. */
export function OperatorDrawer({ operatorId, onClose }: OperatorDrawerProps) {
  return (
    <Sheet open={operatorId != null} onOpenChange={(o) => !o && onClose()}>
      {operatorId != null && <DrawerBody operatorId={operatorId} />}
    </Sheet>
  );
}

function DrawerBody({ operatorId }: { operatorId: string }) {
  const q = useOperatorDetail(operatorId);
  const d = q.data;

  if (q.isPending) {
    return (
      <SheetContent title="Carregando operador">
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </SheetContent>
    );
  }
  if (q.isError) {
    return (
      <SheetContent title="Operador">
        <QueryError what="o operador" onRetry={() => void q.refetch()} />
      </SheetContent>
    );
  }
  if (!d) {
    return (
      <SheetContent title="Operador não encontrado">
        <EmptyState title="Operador não encontrado" description={`Não existe cadastro com o ID ${operatorId}.`} />
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title={d.operator.name}
      description={`ID ${d.operator.id}${d.today.station ? `, bancada ${d.today.station}` : ', sem bancada'}`}
      header={<Avatar name={d.operator.name} size="lg" />}
      footer={
        <Button asChild variant="primary" className="w-full">
          <Link to={operatorPath(d.operator.id)}>
            Abrir página do operador
            <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      <div>
        <StatusBadge row={d.today} />
      </div>
      <OperatorStats detail={d} />
      <section className="grid gap-2">
        <h3 className="text-md">Pedidos por hora hoje</h3>
        <OperatorHourlyChart detail={d} />
      </section>
      <section className="grid gap-2">
        <h3 className="text-md">Últimos dias úteis</h3>
        {d.recentDays.length === 0 ? (
          <p className="text-ink-3">Sem dias anteriores com pedidos.</p>
        ) : (
          <MiniBars aria-label="Pedidos por dia útil" data={d.recentDays.map((p) => ({ label: formatDayShort(p.day), value: p.orders }))} />
        )}
      </section>
      <section className="grid gap-2">
        <h3 className="text-md">Meta individual</h3>
        <OperatorGoalForm operatorId={d.operator.id} operatorName={d.operator.name} value={d.operator.individualGoal} globalActive={d.today.goalSource === 'global'} />
      </section>
      <section className="grid gap-2">
        <h3 className="text-md">Atividade recente</h3>
        <ActivityList items={d.activity.slice(0, 8)} empty="Nenhuma atividade hoje." />
      </section>
    </SheetContent>
  );
}
