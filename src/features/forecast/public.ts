/**
 * API PÚBLICA da Previsão para outras telas (Visão Geral, Modo TV, alertas).
 */
import { useEffect, useMemo } from 'react';
import { useNow, useOverview } from '@/data/hooks';
import { useCan } from '@/auth';
import { notify, resolveNotifications } from '@/features/notifications';
import type { DayKey } from '@/lib/time';
import { alertsFor } from './alerts';
import { useForecastData } from './data';
import { summarize } from './model/forecast-model';

export interface ForecastSummary {
  day: DayKey;
  /** obrigatório de hoje = atrasados + vencem hoje, ainda pendentes */
  mandatoryPending: number;
  /** quantos havia na primeira coleta de dados do dia (previsao_dia.obrigatorios_inicial) */
  mandatoryInitial: number | null;
  /** término previsto do obrigatório, no ritmo padrão (ISO) */
  projectedFinishAt: string | null;
  /** horário limite do dia (fim do turno) */
  deadlineAt: string | null;
  requiredRate: number | null;
  /** MESMA fórmula da Visão Geral (src/lib/metrics.ts) */
  currentRate: number | null;
  /** pendentes que não vencem hoje (adiantando amanhã) */
  aheadPending: number;
  lastCollectionAt: string | null;
  collectionsToday: number;
  /** espelho de conferirLeituraDaFila do coletor */
  truncatedQueue: boolean;
  status: 'ok' | 'atencao' | 'sem-coleta';
  /** o obrigatório não fecha antes do fim do turno (mesma decisão do status) */
  atRisk: boolean;
}

/** null enquanto carrega ou quando não há dados da fila. */
export function useForecastSummary(): ForecastSummary | null {
  const data = useForecastData().data;
  const now = useNow();
  const overview = useOverview({ range: 'hoje', compare: 'dia-util-anterior' });
  const currentRate = overview.data?.kpis.ritmo.value ?? null;
  return useMemo(() => {
    if (!data) return null;
    const s = summarize(data, now);
    if (!s) return null;
    return {
      day: data.day,
      mandatoryPending: s.mandatoryPending,
      mandatoryInitial: s.mandatoryInitial,
      projectedFinishAt: s.projectedFinishAt,
      deadlineAt: s.deadlineAt,
      requiredRate: s.requiredRate,
      currentRate,
      aheadPending: s.aheadPending,
      lastCollectionAt: s.lastCollectionAt,
      collectionsToday: s.collectionsToday,
      truncatedQueue: s.truncatedQueue,
      status: s.status,
      atRisk: s.atRisk,
    };
  }, [data, now, currentRate]);
}

/** Montado pelo runtime de notificações: emite alertas da Previsão via notify(). */
export function useForecastAlerts(): void {
  const summary = useForecastSummary();
  // Só reavalia quando o conjunto de alertas muda; a chave de silêncio do notify cuida do resto.
  // 'obrigatorio-em-risco' sugere mexer na equipe: só quem pode configurar a Previsão recebe.
  const canAct = useCan('expedicao.previsao.configurar');
  const alerts = useMemo(
    () => (summary ? alertsFor(summary).filter((a) => canAct || a.rule !== 'obrigatorio-em-risco') : []),
    [summary, canAct],
  );
  const signature = alerts.map((a) => a.dedupeKey).join('|');
  useEffect(() => {
    for (const a of alerts) notify(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // A coleta de dados voltou: o crítico sai do banner na hora, em vez de
  // ficar até a virada do dia.
  const day = summary?.day;
  const status = summary?.status;
  useEffect(() => {
    if (day && status && status !== 'sem-coleta') resolveNotifications(`sem-coleta-dados:${day}`);
  }, [day, status]);
}
