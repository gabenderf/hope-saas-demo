/** Regras puras da tela de Metas (sem React, testadas em logic.test.ts). */
import { ehFeriado, feriadoParado, type Holiday } from '@/lib/calendar';
import { type DayKey, addDays, isWeekend } from '@/lib/time';

export const GOAL_MIN = 1;
export const GOAL_MAX = 200;

export type GoalParse = { ok: true; value: number } | { ok: false; error: string };

/** Meta é inteiro de 1 a 200. Aceita espaços; recusa decimal, vazio e texto. */
export function parseGoal(text: string): GoalParse {
  const t = text.trim();
  if (!t) return { ok: false, error: `Informe um número inteiro de ${GOAL_MIN} a ${GOAL_MAX}.` };
  if (!/^\d+$/.test(t)) return { ok: false, error: `Use só números inteiros, de ${GOAL_MIN} a ${GOAL_MAX}.` };
  const n = Number(t);
  if (n < GOAL_MIN || n > GOAL_MAX) return { ok: false, error: `A meta precisa estar entre ${GOAL_MIN} e ${GOAL_MAX} pedidos por hora.` };
  return { ok: true, value: n };
}

export interface AgendaDay {
  day: DayKey;
  holiday: Holiday | null;
  /** o galpão para neste feriado (padrão no futuro) */
  stopped: boolean;
}

/** Próximos `count` dias úteis (seg a sex) depois de `today`. Feriado aparece, marcado. */
export function nextBusinessDays(today: DayKey, count = 15): AgendaDay[] {
  const out: AgendaDay[] = [];
  let d = today;
  while (out.length < count) {
    d = addDays(d, 1);
    if (isWeekend(d)) continue;
    out.push({ day: d, holiday: ehFeriado(d), stopped: feriadoParado(d) != null });
  }
  return out;
}

/** O último evento de meta global do histórico (quem mudou e quando). */
export function lastGlobalGoalChange<T extends { action: string; at: string }>(entries: readonly T[]): T | null {
  let best: T | null = null;
  for (const e of entries) {
    if (!e.action.startsWith('meta-global.')) continue;
    if (!best || Date.parse(e.at) > Date.parse(best.at)) best = e;
  }
  return best;
}
