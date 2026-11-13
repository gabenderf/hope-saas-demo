import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { formatInt } from '@/lib/format';
import { PlanningContent } from './components/PlanningContent';
import { type Progresso, usePlanejamento } from './data';
import { rotuloMes } from './model/datas';

function Carregando({ progresso }: { progresso: Progresso | null }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      <p role="status" className="flex items-center gap-2 text-ink-2">
        <Spinner />
        {progresso
          ? `Carregando ${rotuloMes(progresso.mes)}: ${formatInt(progresso.linhas)} bipagens lidas`
          : 'Carregando os três meses'}
        <span className="text-ink-3">(a primeira leitura é a demorada; depois fica guardada neste navegador)</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-line bg-surface px-4 py-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-md" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-60 w-full rounded-md" />
        <Skeleton className="h-60 w-full rounded-md" />
      </div>
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}

export default function PlanningPage() {
  const p = usePlanejamento();
  const c = p.dados?.comparativo;
  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
      <PageHeader
        title="Planejamento"
        breadcrumbs={[{ label: 'Expedição', to: '/expedicao' }, { label: 'Planejamento' }]}
        renderLink={(i) => <Link to={i.to}>{i.label}</Link>}
        meta={c ? `${rotuloMes(c.chaveA)} e ${rotuloMes(c.chaveB)}, com projeção de ${rotuloMes(p.dados?.ctx.chaveAtual ?? '')}` : 'Comparativo dos dois últimos meses e projeção do mês corrente'}
        actions={
          <Button icon={<RefreshCw />} loading={p.recarregando} onClick={() => void p.recarregar()}>
            Recarregar
          </Button>
        }
      />
      {p.carregando ? (
        <Carregando progresso={p.progresso} />
      ) : p.erro || !p.dados ? (
        <Notice
          tone="crit"
          title="Não foi possível montar o Planejamento."
          action={
            <Button size="sm" onClick={() => void p.recarregar()}>
              Tentar de novo
            </Button>
          }
        >
          {p.erro?.message ?? 'Os dados não chegaram.'} Confira a conexão; se continuar, a fonte de dados pode estar fora do ar.
        </Notice>
      ) : (
        <PlanningContent dados={p.dados} />
      )}
    </div>
  );
}
