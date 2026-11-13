import { z } from 'zod';
import { GOAL_MAX, GOAL_MIN } from './goal';

export interface OperatorFormValues {
  id: string;
  name: string;
  individualGoal: number;
}

/** Esquema do formulário. `takenIds` são os IDs que já existem (ID é único). */
export function operatorSchema(takenIds: readonly string[]) {
  return z.object({
    id: z
      .string()
      .trim()
      .min(1, 'Informe o ID do operador.')
      .max(20, 'Use até 20 caracteres.')
      .refine((v) => !takenIds.includes(v), 'Já existe um operador com este ID.'),
    name: z.string().trim().min(2, 'Informe o nome do operador.').max(80, 'Use até 80 caracteres.'),
    individualGoal: z
      .number('Informe a meta em pedidos por hora.')
      .int('Use um número inteiro.')
      .min(GOAL_MIN, `A meta vai de ${GOAL_MIN} a ${GOAL_MAX} pedidos por hora.`)
      .max(GOAL_MAX, `A meta vai de ${GOAL_MIN} a ${GOAL_MAX} pedidos por hora.`),
  });
}

