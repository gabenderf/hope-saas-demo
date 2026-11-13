/**
 * Regras de notificação: registro com metadados e funções PURAS.
 * Cada regra responde "o que a liderança faz com isso?". Nenhum texto julga
 * pessoa: o texto é fato sobre a bancada, a conexão ou a fila.
 */
import type { AuditEntry, ConnectionState, OperatorRow } from '@/data/types';
import { formatInt, formatTime } from '@/lib/format';
import { minutesOfDay } from '@/lib/time';
import type { NotifyInput, RulePref, Severity } from './types';

export interface RuleMeta {
  id: string;
  label: string;
  /** uma linha: o que dispara e o que fazer */
  description: string;
  severity: Severity;
  defaultOn: boolean;
  owner: 'notificacoes' | 'previsao';
}

export const RULES: readonly RuleMeta[] = [
  {
    id: 'conexao',
    label: 'Sem conexão com os dados ao vivo',
    description: 'A conexão ficou fora do ar por mais de 1 minuto. Os números da tela podem estar parados.',
    severity: 'critico',
    defaultOn: true,
    owner: 'notificacoes',
  },
  {
    id: 'bancada-parada',
    label: 'Bancada sem bipes',
    description: 'Operador na bancada há 20 min ou mais sem bipar, dentro do turno. Vale ir até a bancada ver o que travou.',
    severity: 'atencao',
    defaultOn: true,
    owner: 'notificacoes',
  },
  {
    id: 'meta-global',
    label: 'Meta global alterada',
    description: 'Outra pessoa da liderança mudou a meta do dia. A meta efetiva de todos muda junto.',
    severity: 'info',
    defaultOn: true,
    owner: 'notificacoes',
  },
  {
    id: 'marco-do-dia',
    label: 'Marco de pedidos do dia',
    description: 'O time passou de 500, 1.000, 1.500 pedidos e assim por diante.',
    severity: 'info',
    defaultOn: false,
    owner: 'notificacoes',
  },
  {
    id: 'sem-coleta-dados',
    label: 'Sem coleta de dados',
    description: 'Nenhuma coleta de dados da fila no dia. Verifique se a máquina do coletor está ligada.',
    severity: 'critico',
    defaultOn: true,
    owner: 'previsao',
  },
  {
    id: 'fila-incompleta',
    label: 'Fila incompleta na leitura',
    description: 'A leitura da fila veio truncada e a previsão não foi gravada. Aguarde a próxima coleta de dados.',
    severity: 'atencao',
    defaultOn: true,
    owner: 'previsao',
  },
  {
    id: 'obrigatorio-em-risco',
    label: 'Obrigatório de hoje em risco',
    description: 'O término previsto do obrigatório passa do limite do dia. Avalie subir a equipe usada no cálculo.',
    severity: 'atencao',
    defaultOn: true,
    owner: 'previsao',
  },
];

export const RULE_BY_ID: Record<string, RuleMeta> = Object.fromEntries(RULES.map((r) => [r.id, r]));

/** Padrão de uma regra: toast e navegador ligados para atenção e crítico. */
export function defaultPref(rule: string, severity?: Severity): RulePref {
  const meta = RULE_BY_ID[rule];
  const sev = meta?.severity ?? severity ?? 'info';
  const loud = sev !== 'info';
  return { ativa: meta?.defaultOn ?? true, toast: loud, navegador: loud };
}

/* ---------- conexao ---------- */
export const CONNECTION_GRACE_MS = 60_000;

export interface ConnectionTracker {
  /** desde quando a conexão não está 'live' (ms), ou null se está */
  since: number | null;
  alerted: boolean;
}
export const initialConnectionTracker: ConnectionTracker = { since: null, alerted: false };

export type ConnectionAction = 'alert' | 'restored' | null;

export function stepConnection(
  prev: ConnectionTracker,
  state: ConnectionState,
  nowMs: number,
): { next: ConnectionTracker; action: ConnectionAction } {
  if (state === 'live') {
    return { next: initialConnectionTracker, action: prev.alerted ? 'restored' : null };
  }
  const since = prev.since ?? nowMs;
  if (!prev.alerted && nowMs - since > CONNECTION_GRACE_MS) {
    return { next: { since, alerted: true }, action: 'alert' };
  }
  return { next: { since, alerted: prev.alerted }, action: null };
}

export const connectionAlert = (): NotifyInput => ({
  rule: 'conexao',
  severity: 'critico',
  title: 'Sem conexão com os dados ao vivo',
  body: 'Os números podem estar desatualizados até a conexão voltar.',
  dedupeKey: 'conexao',
  cooldownMin: 5,
});
export const connectionRestored = (): NotifyInput => ({
  rule: 'conexao',
  severity: 'info',
  title: 'Conexão restabelecida',
  dedupeKey: 'conexao-restabelecida',
  cooldownMin: 1,
});

/* ---------- bancada-parada ---------- */
export const STATION_IDLE_MIN = 20;
export const STATION_SILENCE_MIN = 60;

/** Turno: 07:40 a 17:40, fora do intervalo de 13:00 a 14:00. */
export function isShiftTime(now: Date): boolean {
  const m = minutesOfDay(now);
  if (m < 7 * 60 + 40 || m > 17 * 60 + 40) return false;
  return !(m >= 13 * 60 && m < 14 * 60);
}

export function stationAlerts(
  operators: Pick<OperatorRow, 'name' | 'station' | 'status' | 'lastActivityAt'>[],
  now: Date,
): NotifyInput[] {
  if (!isShiftTime(now)) return [];
  const out: NotifyInput[] = [];
  for (const op of operators) {
    if (op.status !== 'ativo' || !op.station || !op.lastActivityAt) continue;
    const idle = Math.floor((now.getTime() - Date.parse(op.lastActivityAt)) / 60_000);
    if (idle < STATION_IDLE_MIN) continue;
    out.push({
      rule: 'bancada-parada',
      severity: 'atencao',
      title: `Bancada ${op.station} sem bipes há ${idle} min`,
      body: op.name,
      href: '/expedicao/operadores',
      dedupeKey: `bancada-parada:${op.station}`,
      cooldownMin: STATION_SILENCE_MIN,
    });
  }
  return out;
}

/* ---------- meta-global ---------- */
function goalFromEntry(entry: AuditEntry): number | null {
  const a = entry.after;
  if (typeof a === 'number') return a;
  if (a && typeof a === 'object') {
    const v = (a as Record<string, unknown>).globalGoal ?? (a as Record<string, unknown>).value;
    if (typeof v === 'number') return v;
  }
  const m = /para\s+(\d+(?:[.,]\d+)?)/.exec(entry.summary);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

export function globalGoalAlert(entry: AuditEntry, currentUserId: string | null): NotifyInput | null {
  if (entry.action !== 'meta-global.definir' && entry.action !== 'meta-global.remover') return null;
  if (currentUserId && entry.actor.id === currentUserId) return null;
  const removed = entry.action === 'meta-global.remover';
  const goal = removed ? null : goalFromEntry(entry);
  const title = removed ? 'Meta global removida' : goal == null ? 'Meta global alterada' : `Meta global alterada para ${formatInt(goal)}/h`;
  return {
    rule: 'meta-global',
    severity: 'info',
    title,
    body: `por ${entry.actor.name} às ${formatTime(entry.at)}`,
    href: '/expedicao/metas',
    dedupeKey: `meta-global:${entry.id}`,
    cooldownMin: 1440,
  };
}

/* ---------- marco-do-dia ---------- */
export const MILESTONE_STEP = 500;

/** Maior marco (múltiplo de 500) já ultrapassado, ou null. */
export function reachedMilestone(orders: number | null | undefined): number | null {
  if (!orders || orders < MILESTONE_STEP) return null;
  return Math.floor(orders / MILESTONE_STEP) * MILESTONE_STEP;
}

export function milestoneAlert(milestone: number, day: string): NotifyInput {
  return {
    rule: 'marco-do-dia',
    severity: 'info',
    title: `Time passou de ${formatInt(milestone)} pedidos hoje`,
    href: '/expedicao',
    dedupeKey: `marco-do-dia:${day}:${milestone}`,
    cooldownMin: 1440,
  };
}
