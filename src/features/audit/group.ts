/** Agrupamento, filtros e rótulos do histórico (puro, testado em group.test.ts). */
import type { AuditAction, AuditEntry } from '@/data/types';
import { formatDayWithWeekday } from '@/lib/format';
import { type DayKey, addDays, dayKeyOf } from '@/lib/time';

export type ActionGroup = 'metas' | 'operadores' | 'usuarios' | 'dispositivos' | 'previsao';

export const ACTION_GROUP_LABEL: Record<ActionGroup, string> = {
  metas: 'Metas',
  operadores: 'Operadores',
  usuarios: 'Usuários',
  dispositivos: 'Dispositivos',
  previsao: 'Previsão',
};

export function groupOfAction(action: AuditAction): ActionGroup | null {
  if (action.startsWith('meta-')) return 'metas';
  if (action.startsWith('operador.')) return 'operadores';
  if (action.startsWith('usuario.')) return 'usuarios';
  if (action.startsWith('dispositivo.')) return 'dispositivos';
  if (action.startsWith('previsao.')) return 'previsao';
  return null; // 'desfazer' e 'outro'
}

export type PeriodKey = 'tudo' | 'hoje' | '7d' | '30d';

export interface AuditFilters {
  group: ActionGroup | 'todos';
  actorId: string;
  period: PeriodKey;
  query: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterEntries(entries: readonly AuditEntry[], f: AuditFilters, today: DayKey): AuditEntry[] {
  const since = f.period === 'hoje' ? today : f.period === '7d' ? addDays(today, -6) : f.period === '30d' ? addDays(today, -29) : null;
  const q = norm(f.query.trim());
  return entries.filter((e) => {
    if (f.group !== 'todos' && groupOfAction(e.action) !== f.group) return false;
    if (f.actorId !== 'todos' && e.actor.id !== f.actorId) return false;
    if (since && dayKeyOf(e.at) < since) return false;
    if (q && !norm(`${e.actor.name} ${e.summary} ${e.target?.label ?? ''}`).includes(q)) return false;
    return true;
  });
}

export interface DayGroup {
  day: DayKey;
  label: string;
  entries: AuditEntry[];
}

/** "Hoje", "Ontem" ou "qua 04/11". Dias e entradas do mais novo para o mais antigo. */
export function groupByDay(entries: readonly AuditEntry[], today: DayKey): DayGroup[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const map = new Map<DayKey, AuditEntry[]>();
  for (const e of sorted) {
    const d = dayKeyOf(e.at);
    const list = map.get(d);
    if (list) list.push(e);
    else map.set(d, [e]);
  }
  return [...map.entries()].map(([day, list]) => ({
    day,
    label: day === today ? 'Hoje' : day === addDays(today, -1) ? 'Ontem' : formatDayWithWeekday(day),
    entries: list,
  }));
}

export function uniqueActors(entries: readonly AuditEntry[]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const e of entries) m.set(e.actor.id, e.actor.name);
  return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
