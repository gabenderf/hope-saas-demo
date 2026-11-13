/**
 * Adaptador demo da Previsão: fila plausível e coerente com o horário.
 * De manhã ~640 obrigatórios, caindo ao longo do dia; adiantados (vencem amanhã) à parte.
 * Uma coleta de dados a cada 15 min; a rodada das 09:25 traz o caso real de 27/08
 * (Imprimir 418 incompleta + Imprimir 434 escalada, contra 434 pedidos reais).
 */
import { atTime, addDays, minutesOfDay, type DayKey } from '@/lib/time';
import type { DayPlan, ForecastConfig, ForecastData, ForecastSource, PendingOrder, QueueSnapshot, SkuDemandRow } from './types';

const INITIAL_MANDATORY = 640;
const INITIAL_AHEAD = 380;
const LATE = 40;
const RATE_PER_PERSON = 35;
const START_MIN = 7 * 60 + 40;
const PRODUCTION_MIN = 8 * 60 + 30;
const END_MIN = 17 * 60 + 40;
const ROUND_STEP = 15;
/** índice da rodada (a cada 15 min desde 07:40) com a leitura incompleta seguida de escalada */
const ESCALATION_ROUND = 7;

const CONFIG: ForecastConfig = {
  inicio_turno: '07:40',
  inicio_producao: '08:30',
  fim_turno: '17:40',
  almoco_inicio: '13:00',
  almoco_fim: '14:00',
  equipe_padrao: 3,
  ritmo_padrao: RATE_PER_PERSON,
  fatores_dia_semana: { '1': 1, '2': 1.35, '3': 1.2, '4': 1.15, '5': 1.1 },
  curva_chegada: { '8': 0.13, '9': 0.19, '10': 0.22, '11': 0.21, '12': 0.2 },
  piso_ritmo_necessario: 35,
  ritmo_inclui_pausas: true,
  fator_pessimista: 0.75,
};

const CATALOG = [
  '3X-LEN-ECO-70X50',
  '1X-LEN-ECO-70X50',
  '4X-LEN-ECO-70X50',
  '1X-MASC-BRA',
  '2X-MASC-BRA',
  '10X-LEN-CEL-70X50',
  '5X-LEN-COM-TNT',
  '3L-PERFU-FLEX',
  '100X-TOU-DESC-TNT-BRA',
  '50X-TOU-DESC-TNT-BRA',
  '24X-ATADURA-10CM',
  '60X-ATADURA-10CM',
  '100X-SERIN-5ML',
  '100UN-40X1,20-AGULHA',
  '2CX-LUVA-VINIL-M',
  '20X-LUVA-SOFT-M',
  '1X-GAZE-11FIOS',
  '1X-GAZE-13FIOS',
  '1X-GAZE-ESTÉRIL',
  '1X-500-PAP-INTER',
  '2X-LEN-ECO-50X50',
  '1X-LEN-CEL-50X50',
  '1X-LEN-SEM-TNT',
  '1X-ESPARADRAPO-MICROPORE',
  '1X-ALCOOL-70-1L',
];

/** NX- multiplica (como a view demanda_sku_dia). */
function multiplier(sku: string): number {
  const m = /^(\d+)(X|UN|CX)-/.exec(sku);
  return m ? Number(m[1]) : 1;
}

/** Quantos pedidos obrigatórios já saíram da fila neste instante (3 pessoas a 35/h desde 08:30, com almoço). */
function doneMandatory(minutes: number): number {
  const worked = Math.max(0, Math.min(minutes, END_MIN) - PRODUCTION_MIN);
  return Math.min(INITIAL_MANDATORY, Math.round((worked / 60) * RATE_PER_PERSON * 3 * 0.95));
}

/** Pedidos que entraram depois da primeira rodada (a fila de fato recebe pedido ao longo da manhã). */
function arrivals(minutes: number): number {
  const frac = Math.max(0, Math.min(1, (minutes - START_MIN) / (12 * 60 - START_MIN)));
  return Math.round(180 * frac);
}

function round(n: number): number {
  return Math.round(n);
}

export function createDemoForecastSource(): ForecastSource {
  let teamSize = CONFIG.equipe_padrao;

  return {
    canWrite: true,

    async load(day: DayKey, now: Date): Promise<ForecastData> {
      const minutes = minutesOfDay(now);
      const config: ForecastConfig = { ...CONFIG, equipe_padrao: teamSize };

      if (minutes < START_MIN) {
        return { day, config, pending: [], seenToday: 0, snapshots: [], plan: null, skus: [] };
      }

      const effective = Math.min(minutes, END_MIN);
      const mandatoryNow = INITIAL_MANDATORY - doneMandatory(effective) + arrivals(effective) * 0.1;
      const mandatory = Math.max(0, Math.round(mandatoryNow));
      const ahead = INITIAL_AHEAD + Math.round(arrivals(effective) * 0.9);
      const lateCount = Math.min(LATE, mandatory);

      const pending: PendingOrder[] = [];
      const lateAt = atTime(addDays(day, -1), 12, 59).toISOString();
      const todayAt = atTime(day, 12, 59).toISOString();
      const tomorrowAt = atTime(addDays(day, 1), 12, 59).toISOString();
      for (let i = 0; i < mandatory; i++) {
        pending.push({ num_pedido: `DM${String(i).padStart(5, '0')}`, expira_em: i < lateCount ? lateAt : todayAt, prazo_origem: 'pago' });
      }
      for (let i = 0; i < ahead; i++) {
        pending.push({ num_pedido: `DA${String(i).padStart(5, '0')}`, expira_em: tomorrowAt, prazo_origem: 'pago' });
      }

      // fila_do_dia = união do dia: o que já saiu + o que ainda está pendente.
      const seenToday = INITIAL_MANDATORY + INITIAL_AHEAD + arrivals(effective);

      const snapshots: QueueSnapshot[] = [];
      for (let k = 0; START_MIN + k * ROUND_STEP <= effective; k++) {
        const at = START_MIN + k * ROUND_STEP;
        const at0 = atTime(day, Math.floor(at / 60), at % 60);
        const real = INITIAL_MANDATORY + INITIAL_AHEAD + arrivals(at);
        const rodada = `${day}T${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
        const send = k === ESCALATION_ROUND ? 0 : round(real * 0.08);
        const print = real - send;
        const mk = (etapa: string, total: number, status: string, offsetS: number): QueueSnapshot => ({
          raspado_em: new Date(at0.getTime() + offsetS * 1000).toISOString(),
          etapa,
          status,
          total_capturado: total,
          rodada,
          sub_aba: null,
        });
        snapshots.push(mk('para_enviar', send, 'ok', 5));
        if (k === ESCALATION_ROUND) {
          snapshots.push(mk('para_imprimir', round(print * 0.963), 'incompleto', 20));
          snapshots.push(mk('para_imprimir', print, 'ok', 50));
        } else {
          snapshots.push(mk('para_imprimir', print, 'ok', 20));
        }
      }

      const first = atTime(day, 7, 40);
      const plan: DayPlan = {
        meta_hora_termino: atTime(day, 15, 40).toISOString(),
        meta_publicada_em: new Date(first.getTime() + 60000).toISOString(),
        obrigatorios_inicial: INITIAL_MANDATORY,
        pendentes_inicial: INITIAL_MANDATORY + INITIAL_AHEAD,
      };

      const skus: SkuDemandRow[] = [];
      CATALOG.forEach((sku, i) => {
        const weight = Math.max(2, Math.round(160 / (i + 1.5)));
        const today = Math.round((weight * mandatory) / INITIAL_MANDATORY);
        const tomorrow = Math.round((weight * ahead) / INITIAL_AHEAD / 2.5);
        const mult = multiplier(sku);
        if (today > 0) skus.push({ sku, prazo: 'hoje', pedidos: today, unidades_anuncio: today, pecas: today * mult });
        if (tomorrow > 0) skus.push({ sku, prazo: 'amanha', pedidos: tomorrow, unidades_anuncio: tomorrow, pecas: tomorrow * mult });
      });

      return { day, config, pending, seenToday, snapshots, plan, skus };
    },

    async setTeamSize(value: number) {
      const before = teamSize;
      teamSize = value;
      return {
        undo: async () => {
          teamSize = before;
        },
      };
    },
  };
}
