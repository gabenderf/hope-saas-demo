/** Regras de meta compartilhadas pelos formulários (Visão Geral, Operadores, painel). */
export const GOAL_MIN = 1;
export const GOAL_MAX = 200;

export type GoalParse = { ok: true; value: number } | { ok: false; error: string };

/** Meta é inteiro de 1 a 200 pedidos por hora. Aceita "40" e "40,0". */
export function parseGoal(text: string): GoalParse {
  const clean = text.trim().replace(',', '.');
  if (!clean) return { ok: false, error: 'Informe a meta em pedidos por hora.' };
  const n = Number(clean);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Use um número inteiro, sem casas decimais.' };
  if (n < GOAL_MIN || n > GOAL_MAX) return { ok: false, error: `A meta vai de ${GOAL_MIN} a ${GOAL_MAX} pedidos por hora.` };
  return { ok: true, value: n };
}
