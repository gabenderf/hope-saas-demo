import { EmptyState } from '@/components/ui/EmptyState';
import type { DadosPlanejamento } from '../data/carregar';
import { rotuloMes } from '../model/datas';
import { Expectativa } from './ExpectativaSection';
import { PecasTable } from './PecasTable';
import { ProdutosTable } from './ProdutosTable';
import { CartoesComparativo, FaixaCombinacoes, GraficoDiario, GraficosConcentracao } from './ResumoSection';

/** Corpo da tela, na ordem em que a liderança precisa das respostas. */
export function PlanningContent({ dados }: { dados: DadosPlanejamento }) {
  const { ctx, comparativo: c, projecao } = dados;
  const semHistorico = c.somaA === 0 && c.somaB === 0;
  if (semHistorico) {
    return (
      <EmptyState
        title="Ainda não há dois meses fechados para comparar"
        description="O Planejamento compara os dois últimos meses fechados e projeta o corrente. Ele aparece quando houver pedidos separados nesses meses; a extensão grava esses pedidos a cada bipagem."
      />
    );
  }
  return (
    <div className="grid gap-4">
      <FaixaCombinacoes c={c} />
      <section aria-label={`Comparativo ${rotuloMes(c.chaveA)} e ${rotuloMes(c.chaveB)}`}>
        <CartoesComparativo c={c} />
      </section>
      <GraficoDiario ctx={ctx} c={c} />
      <GraficosConcentracao c={c} />
      <ProdutosTable c={c} />
      <PecasTable c={c} />
      <Expectativa pr={projecao} c={c} />
    </div>
  );
}
