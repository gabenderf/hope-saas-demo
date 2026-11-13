import { Lock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { useCapabilities, useGeneralConfig, useWriteGate } from '@/data/hooks';
import { Button, Card, CardBody, EmptyState, Notice, PageHeader, Skeleton } from '@/components/ui';
import { GlobalGoalCard } from './GlobalGoalCard';
import { GoalScheduleCard } from './GoalScheduleCard';
import { IndividualGoalsCard } from './IndividualGoalsCard';

export default function GoalsPage() {
  const gate = useWriteGate('expedicao.metas.editar');
  const caps = useCapabilities();
  const config = useGeneralConfig();

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 p-4 sm:p-6">
      <PageHeader title="Metas" breadcrumbs={[{ label: 'Expedição' }, { label: 'Metas' }]} />

      {!gate.allowed && gate.message ? (
        <Notice tone="info" title="Somente consulta">
          {gate.message}
        </Notice>
      ) : null}

      {config.isPending ? (
        <Card>
          <CardBody className="grid gap-3" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-8 w-full max-w-sm" />
          </CardBody>
        </Card>
      ) : config.isError ? (
        <Card>
          <EmptyState
            icon={<Lock />}
            title="Não foi possível carregar as metas"
            description="A leitura do banco falhou. Nada foi alterado."
            action={
              <Button size="sm" icon={<RefreshCw />} onClick={() => void config.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        </Card>
      ) : (
        <GlobalGoalCard key={config.data.globalGoal ?? 'sem-meta'} config={config.data} gate={gate} />
      )}

      <p className="px-1 text-xs text-ink-3">
        A meta de hoje é a do cartão acima: é ela que a Visão Geral e a extensão usam. A agenda começa amanhã e é copiada para esse
        cartão no começo de cada dia; ajustes feitos no cartão durante o dia valem sobre a agenda.
      </p>

      <GoalScheduleCard enabled={caps.goalSchedule} gate={gate} globalGoal={config.data?.globalGoal ?? null} />

      <IndividualGoalsCard globalGoal={config.data?.globalGoal ?? null} gate={gate} />

      <ReadingNote />
    </div>
  );
}

function ReadingNote() {
  return (
    <details className="group rounded-md border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-md focus-visible:shadow-focus">Como ler a meta</summary>
      <div className="grid gap-2 border-t border-line px-4 py-3 text-ink-2">
        <p>
          Em dia de fila curta, todo mundo cai junto: o ritmo mede volume de pedidos tanto quanto desempenho. Em 11/08 a equipe fez 43,6
          pedidos por hora; em 14/08, com a fila curta, 18,8.
        </p>
        <p>A capacidade real só se mede em dia de fila cheia. Um operador pode ficar abaixo da meta sem ter feito nada errado.</p>
        <p>
          Por isso a meta global existe: ajuste o número ao volume do dia. Veja a fila do dia na{' '}
          <Link to="/expedicao/previsao" className="text-accent underline underline-offset-2">
            Previsão
          </Link>
          .
        </p>
      </div>
    </details>
  );
}
