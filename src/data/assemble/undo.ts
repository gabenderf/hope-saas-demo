/**
 * Sinaliza que a gravação em curso é um "desfazer". A fonte demo lê o sinal
 * (de forma síncrona, no início do método) para registrar a ação 'desfazer'
 * na auditoria em vez de uma alteração nova.
 */
export interface UndoSignal {
  restoreAbsent: boolean;
  /** desfazer a desativação de um convidado: o status volta a 'convidado', não vira 'ativo' */
  restoreInvited: boolean;
}

let undoing: UndoSignal | null = null;

export function currentUndo(): UndoSignal | null {
  return undoing;
}

/** `restoreAbsent`: o item não existia antes da alteração, então desfazer é remover. */
export async function withUndo<T>(
  fn: () => Promise<T>,
  options: { restoreAbsent?: boolean; restoreInvited?: boolean } = {},
): Promise<T> {
  undoing = { restoreAbsent: Boolean(options.restoreAbsent), restoreInvited: Boolean(options.restoreInvited) };
  try {
    const p = fn();
    undoing = null; // o método da fonte já leu o sinal na parte síncrona
    return await p;
  } finally {
    undoing = null;
  }
}
