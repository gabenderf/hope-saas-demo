import { Pencil, Power, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BarCompareChart } from '@/components/charts/BarCompareChart';
import { KpiCard } from '@/components/data';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/toast';
import { useOperatorDetail, useOperators, useSetOperatorRegistration, useWriteGate } from '@/data/hooks';
import { formatDayWithWeekday, formatDec1, formatInt, formatRate, formatRatio } from '@/lib/format';
import { ActivityList } from './components/ActivityList';
import { mixedPercent } from './components/columns';
import { StatusBadge } from './components/StatusBadge';
import { OperatorHourlyChart } from './components/OperatorDrawer';
import { OperatorFormDialog } from './components/OperatorFormDialog';
import { OperatorGoalForm } from './components/OperatorGoalForm';
import { QueryError } from './components/QueryError';

export default function OperatorDetailPage() {
  const { operatorId = '' } = useParams();
  const q = useOperatorDetail(operatorId);
  const operatorsQ = useOperators();
  const gate = useWriteGate('expedicao.operadores.gerenciar');
  const registration = useSetOperatorRegistration();
  const [formOpen, setFormOpen] = useState(false);
  const d = q.data;
  const crumbs = (name: string) => [{ label: 'Expedição', to: '/expedicao' }, { label: 'Operadores', to: '/expedicao/operadores' }, { label: name }];
  const renderLink = (c: { label: string; to: string }) => <Link to={c.to}>{c.label}</Link>;

  if (q.isError) {
    return (
      <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
        <PageHeader title="Operador" breadcrumbs={crumbs('Operador')} renderLink={renderLink} />
        <QueryError what="o operador" onRetry={() => void q.refetch()} />
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6" aria-busy="true">
        <PageHeader title="Carregando operador" breadcrumbs={crumbs('...')} renderLink={renderLink} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <KpiCard key={i} label="" value="" loading />
          ))}
        </div>
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!d) {
    return (
      <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
        <PageHeader title="Operador" breadcrumbs={crumbs('Não encontrado')} renderLink={renderLink} />
        <Card>
          <EmptyState
            icon={<UserX />}
            title="Operador não encontrado"
            description={`Não existe cadastro com o ID ${operatorId}. Confira o endereço ou volte à lista.`}
            action={
              <Button asChild>
                <Link to="/expedicao/operadores">Voltar para Operadores</Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const t = d.today;
  const inativo = d.operator.registration === 'inativo';
  const mixed = mixedPercent(t);
  const guarded = (fn: () => void) => () => {
    if (!gate.allowed) {
      toast(gate.message ?? 'Seu perfil não permite gerenciar operadores.');
      return;
    }
    fn();
  };

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
      <PageHeader
        title={d.operator.name}
        breadcrumbs={crumbs(d.operator.name)}
        renderLink={renderLink}
        meta={
          <span className="flex items-center gap-2">
            <Avatar name={d.operator.name} size="sm" />
            <span className="font-mono">ID {d.operator.id}</span>
            {t.station && <span className="font-mono">Bancada {t.station}</span>}
            <StatusBadge row={t} />
          </span>
        }
        actions={
          <>
            <Button icon={<Pencil />} aria-disabled={!gate.allowed || undefined} onClick={guarded(() => setFormOpen(true))}>
              Editar
            </Button>
            <Button
              icon={<Power />}
              aria-disabled={!gate.allowed || undefined}
              loading={registration.isPending}
              onClick={guarded(() =>
                registration.mutate(
                  { id: d.operator.id, registration: inativo ? 'ativo' : 'inativo' },
                  {
                    onSuccess: (r) => toast.undoable(inativo ? `${d.operator.name} foi reativado.` : `${d.operator.name} foi inativado.`, r.undo),
                    onError: (e) => toast.error(e.message),
                  },
                ),
              )}
            >
              {inativo ? 'Reativar' : 'Inativar'}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pedidos hoje" value={formatInt(t.orders)} />
        <KpiCard label="Ritmo" value={t.rate == null ? 'sem dado' : formatDec1(t.rate)} unit={t.rate == null ? undefined : '/h'} />
        <KpiCard label="Contra a meta" value={formatRatio(t.goalRatio)} unit={` de ${formatInt(t.effectiveGoal)}/h`} />
        <KpiCard label="Pedidos mistos" value={mixed == null ? 'sem dado' : formatDec1(mixed)} unit={mixed == null ? undefined : '%'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pedidos por hora hoje" />
          <CardBody>
            <OperatorHourlyChart detail={d} height={220} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Últimos 10 dias úteis"
            description={d.teamRateToday == null ? undefined : `A linha é o ritmo do time hoje, ${formatRate(d.teamRateToday)}.`}
          />
          <CardBody>
            {d.recentDays.length === 0 ? (
              <p className="text-ink-3">Sem dias anteriores com pedidos.</p>
            ) : (
              <BarCompareChart
                height={220}
                valueLabel="Ritmo por hora"
                goal={d.teamRateToday ?? undefined}
                goalLabel="Ritmo do time hoje"
                yFormatter={formatDec1}
                valueFormatter={formatRate}
                summary="Ritmo do operador nos últimos dias úteis"
                data={d.recentDays.map((p) => ({ label: formatDayWithWeekday(p.day), value: p.rate }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Últimos 30 dias" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-ink-3">Pedidos</dt>
                <dd className="tabular text-xl font-semibold">{formatInt(d.last30.orders)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Ritmo</dt>
                <dd className="tabular text-xl font-semibold">{d.last30.rate == null ? 'sem dado' : formatRate(d.last30.rate)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Dias trabalhados</dt>
                <dd className="tabular font-semibold">{formatInt(d.last30.daysWorked)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Pedidos mistos</dt>
                <dd className="tabular font-semibold">{d.last30.mixedShare == null ? 'sem dado' : `${formatDec1(d.last30.mixedShare)}%`}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Meta individual" />
          <CardBody>
            <OperatorGoalForm operatorId={d.operator.id} operatorName={d.operator.name} value={d.operator.individualGoal} globalActive={t.goalSource === 'global'} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Atividade de hoje" />
          <CardBody className="max-h-80 overflow-y-auto">
            <ActivityList items={d.activity} empty="Nenhuma atividade hoje." />
          </CardBody>
        </Card>
      </div>

      <OperatorFormDialog open={formOpen} onOpenChange={setFormOpen} operator={d.operator} allOperators={operatorsQ.data ?? []} />
    </div>
  );
}
