import { isBusinessDay } from '@/lib/calendar';
import { atTime, minutesOfDay, todayKey, type DayKey } from '@/lib/time';
import { prever, type MotorSaida } from '../engine';
import type { ForecastConfig, ForecastData, QueueSnapshot, SkuDemandRow } from '../data/types';
import { readQueue } from './queue-guard';

/** Depois deste horário, nenhuma coleta de dados no dia é falha (8h15). */
export const WATCH_LIMIT_MIN = 8 * 60 + 15;

export type WatchState = 'aguardando' | 'sem-coleta' | 'ok' | 'dia-parado';

export interface Watch {
  state: WatchState;
  lastAt: string | null;
  /** coletas de dados com status ok no dia */
  count: number;
  minutesAgo: number | null;
}

/**
 * Vigia: só a idade do dado. Vermelho apenas sem nenhuma coleta de dados depois das 08:15, e só em dia
 * útil (segunda a sexta, fora feriado parado): domingo e feriado parado não têm coleta e não é falha.
 */
export function watchOf(snapshots: QueueSnapshot[], now: Date): Watch {
  const ok = snapshots.filter((s) => s.status === 'ok');
  if (ok.length === 0) {
    if (!isBusinessDay(todayKey(now))) return { state: 'dia-parado', lastAt: null, count: 0, minutesAgo: null };
    return {
      state: minutesOfDay(now) > WATCH_LIMIT_MIN ? 'sem-coleta' : 'aguardando',
      lastAt: null,
      count: 0,
      minutesAgo: null,
    };
  }
  const last = ok.reduce((a, b) => (Date.parse(b.raspado_em) > Date.parse(a.raspado_em) ? b : a));
  return {
    state: 'ok',
    lastAt: last.raspado_em,
    count: ok.length,
    minutesAgo: Math.max(0, Math.round((now.getTime() - Date.parse(last.raspado_em)) / 60000)),
  };
}

export function runForecast(data: ForecastData, config: ForecastConfig, now: Date, team = config.equipe_padrao): MotorSaida {
  return prever({
    pendentes: data.pending,
    agora: now,
    equipe: { pessoas: team, ritmo_ped_h: Number(config.ritmo_padrao) },
    config: {
      inicio_turno: config.inicio_turno,
      inicio_producao: config.inicio_producao,
      fim_turno: config.fim_turno,
      almoco_inicio: config.almoco_inicio,
      almoco_fim: config.almoco_fim,
      ritmo_inclui_pausas: config.ritmo_inclui_pausas,
      fator_pessimista: Number(config.fator_pessimista),
      fatores_dia_semana: config.fatores_dia_semana,
      curva_chegada: config.curva_chegada,
      piso_ritmo_necessario: config.piso_ritmo_necessario == null ? null : Number(config.piso_ritmo_necessario),
    },
    vistos_hoje: data.seenToday ?? undefined,
    // Sem vistos_primeira_rodada: a projeção de volume é do coletor. Aqui a previsão viva trabalha sobre o que já está na fila.
  });
}

export interface DivergenceInfo {
  kind: 'sem-meta' | 'nao-fecha' | 'em-linha' | 'atraso' | 'adiantado';
  metaAt: string | null;
  frozenAt: string | null;
  liveAt: string | null;
  hours: number;
}

/** Meta congelada × previsão viva. A meta não se move sozinha. */
export function divergenceOf(data: ForecastData, forecast: MotorSaida): DivergenceInfo {
  const meta = data.plan?.meta_hora_termino;
  if (!meta) return { kind: 'sem-meta', metaAt: null, frozenAt: null, liveAt: null, hours: 0 };
  const base = { metaAt: meta, frozenAt: data.plan?.meta_publicada_em ?? null };
  const live = forecast.termino_para_meta;
  if (!live) return { ...base, kind: 'nao-fecha', liveAt: null, hours: 0 };
  const diffMin = Math.round((live.getTime() - Date.parse(meta)) / 60000);
  const hours = Math.abs(Math.round(diffMin / 6) / 10);
  const kind = Math.abs(diffMin) < 15 ? 'em-linha' : diffMin > 0 ? 'atraso' : 'adiantado';
  return { ...base, kind, liveAt: live.toISOString(), hours };
}

export interface SkuRank {
  position: number;
  sku: string;
  orders: number;
  /** a view MULTIPLICA o prefixo NX-: touca, atadura, luva e seringa aparecem infladas */
  pieces: number;
  piecesToday: number;
  piecesTomorrow: number;
}

/** Uma linha por SKU, ranqueada por PEDIDOS (desempate por peças). A posição é a do ranking completo. */
export function rankSkus(rows: SkuDemandRow[]): SkuRank[] {
  const by = new Map<string, SkuRank>();
  for (const l of rows) {
    const s = by.get(l.sku) ?? { position: 0, sku: l.sku, orders: 0, pieces: 0, piecesToday: 0, piecesTomorrow: 0 };
    s.orders += l.pedidos;
    s.pieces += l.pecas;
    // Atrasado soma em "hoje": é obrigação de hoje, e mais urgente ainda.
    if (l.prazo === 'hoje' || l.prazo === 'atrasado') s.piecesToday += l.pecas;
    else if (l.prazo === 'amanha') s.piecesTomorrow += l.pecas;
    by.set(l.sku, s);
  }
  const list = [...by.values()].sort((a, b) => b.orders - a.orders || b.pieces - a.pieces);
  list.forEach((s, i) => (s.position = i + 1));
  return list;
}

/** A busca filtra sem mudar a posição do ranking completo. */
export function searchSkus(ranked: SkuRank[], term: string): SkuRank[] {
  const t = term.trim().toLowerCase();
  return t ? ranked.filter((s) => s.sku.toLowerCase().includes(t)) : ranked;
}

export function deadlineOf(day: DayKey, config: ForecastConfig): Date {
  const [h, m] = config.fim_turno.split(':').map(Number);
  return atTime(day, h ?? 17, m ?? 40);
}

export type SummaryStatus = 'ok' | 'atencao' | 'sem-coleta';

export interface SummaryParts {
  mandatoryPending: number;
  mandatoryInitial: number | null;
  projectedFinishAt: string | null;
  deadlineAt: string | null;
  requiredRate: number | null;
  aheadPending: number;
  lastCollectionAt: string | null;
  collectionsToday: number;
  truncatedQueue: boolean;
  status: SummaryStatus;
  /** o obrigatório não fecha antes do fim do turno */
  atRisk: boolean;
  /** nenhuma coleta de dados no dia: término e ritmo necessário não têm base */
  noData: boolean;
}

export function summarize(data: ForecastData, now: Date): SummaryParts | null {
  if (!data.config) return null;
  const watch = watchOf(data.snapshots, now);
  const reading = readQueue(data.seenToday, data.snapshots, data.pending.length);
  // Sem nenhuma coleta de dados no dia, término e ritmo necessário seriam número sem base.
  const noData = watch.count === 0;
  const f = runForecast(data, data.config, now);
  const deadline = deadlineOf(data.day, data.config);
  const finish = f.termino_hoje_p50;
  const atRisk = !noData && f.obrigatorios > 0 && (f.falta_capacidade || (finish != null && finish.getTime() > deadline.getTime()));
  const status: SummaryStatus = watch.state === 'sem-coleta' ? 'sem-coleta' : reading.refused || atRisk ? 'atencao' : 'ok';
  return {
    mandatoryPending: f.obrigatorios,
    mandatoryInitial: data.plan?.obrigatorios_inicial ?? null,
    projectedFinishAt: !noData && finish ? finish.toISOString() : null,
    deadlineAt: deadline.toISOString(),
    requiredRate: noData ? null : f.ritmo_necessario,
    aheadPending: f.baldes.amanha + f.baldes.depois + f.baldes.sem_prazo,
    lastCollectionAt: watch.lastAt,
    collectionsToday: watch.count,
    truncatedQueue: reading.refused,
    status,
    atRisk,
    noData,
  };
}
