import type { NotifyInput } from '@/features/notifications';
import type { ForecastSummary } from './public';

const HREF = '/expedicao/previsao';

/** Alertas que o resumo pede. Puro: a chave de silêncio é por dia. */
export function alertsFor(s: ForecastSummary): NotifyInput[] {
  const out: NotifyInput[] = [];
  if (s.status === 'sem-coleta') {
    out.push({
      rule: 'sem-coleta-dados',
      severity: 'critico',
      title: 'Sem coleta de dados hoje',
      body: 'Verifique a máquina do coletor. Os números da Previsão não são de hoje.',
      href: HREF,
      dedupeKey: `sem-coleta-dados:${s.day}`,
    });
  }
  if (s.truncatedQueue) {
    out.push({
      rule: 'fila-incompleta',
      severity: 'atencao',
      title: 'Fila incompleta na leitura',
      body: 'Os números da Previsão estão subestimados. Não republique a meta.',
      href: HREF,
      dedupeKey: `fila-incompleta:${s.day}`,
    });
  }
  // Mesma decisão do resumo (falta de capacidade ou término depois do fim do turno).
  if (s.atRisk) {
    out.push({
      rule: 'obrigatorio-em-risco',
      severity: 'atencao',
      title: 'Obrigatório de hoje em risco',
      body: 'O obrigatório não fecha antes do fim do turno no ritmo padrão.',
      href: HREF,
      dedupeKey: `obrigatorio-em-risco:${s.day}`,
    });
  }
  return out;
}
