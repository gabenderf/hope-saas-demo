/**
 * Lógica pura do campo de código de 6 dígitos (verificação em duas etapas).
 * O componente (CodeInput.tsx) só aplica o resultado e move o foco.
 */

export const CODE_LENGTH = 6;

export type CodeDigits = readonly string[];

export interface CodeStep {
  digits: string[];
  /** casa que deve receber o foco depois da operação */
  focus: number;
}

export function emptyCode(): string[] {
  return Array.from({ length: CODE_LENGTH }, () => '');
}

/**
 * Digitar ou colar `text` a partir da casa `index`. Só dígitos entram.
 * Código inteiro (6 ou mais dígitos) recomeça da primeira casa, em qualquer
 * casa que a pessoa estiver: é o caso de colar do aplicativo autenticador ou
 * do preenchimento automático do celular.
 */
export function fillCode(digits: CodeDigits, index: number, text: string): CodeStep {
  const only = text.replace(/\D/g, '');
  const at = clamp(index);
  if (!only) return { digits: [...digits], focus: at };
  const start = only.length >= CODE_LENGTH ? 0 : at;
  const next = [...digits];
  let i = start;
  for (const ch of only) {
    if (i >= CODE_LENGTH) break;
    next[i] = ch;
    i += 1;
  }
  return { digits: next, focus: clamp(i) };
}

/** Apagar: limpa a casa atual; se já estiver vazia, volta e limpa a anterior. */
export function backspaceCode(digits: CodeDigits, index: number): CodeStep {
  const at = clamp(index);
  const next = [...digits];
  if (next[at]) {
    next[at] = '';
    return { digits: next, focus: at };
  }
  if (at === 0) return { digits: next, focus: 0 };
  next[at - 1] = '';
  return { digits: next, focus: at - 1 };
}

export function isCodeComplete(digits: CodeDigits): boolean {
  return digits.length === CODE_LENGTH && digits.every((d) => /^\d$/.test(d));
}

function clamp(i: number): number {
  return Math.max(0, Math.min(CODE_LENGTH - 1, i));
}
