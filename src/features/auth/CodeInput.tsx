/**
 * Código de 6 dígitos em seis casas: aceita colar o código inteiro em
 * qualquer casa, avança sozinho, apagar volta uma casa, setas navegam.
 * A primeira casa tem autocomplete="one-time-code" (preenchimento do celular).
 *
 * Não controlado: para limpar, troque a `key`.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { controlClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { backspaceCode, CODE_LENGTH, emptyCode, fillCode, isCodeComplete, type CodeStep } from './code-input';

export interface CodeInputProps {
  /** chamado a cada mudança, com os dígitos juntos ("12 4" vira "124") */
  onChange?: (code: string) => void;
  /** chamado quando as 6 casas ficam preenchidas */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** id do texto de erro/ajuda, para leitor de tela */
  describedBy?: string;
  label?: string;
}

export function CodeInput({
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  describedBy,
  label = 'Código de 6 dígitos',
}: CodeInputProps) {
  const [digits, setDigits] = useState<string[]>(emptyCode);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(autoFocus ? 0 : null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const el = refs.current[target];
    el?.focus();
    el?.select();
  });

  function apply(step: CodeStep) {
    pendingFocus.current = step.focus;
    setDigits(step.digits);
    onChange?.(step.digits.join(''));
    if (isCodeComplete(step.digits)) onComplete?.(step.digits.join(''));
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      apply(backspaceCode(digits, i));
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    apply(fillCode(digits, i, e.clipboardData.getData('text')));
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex gap-2">
      {digits.map((d, i) => (
        <input
          // a posição é a identidade da casa
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => apply(fillCode(digits, i, e.target.value.replace(d, '') || e.target.value))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Dígito ${i + 1} de ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(controlClass, 'h-11 w-full min-w-0 max-w-11 px-0 text-center font-mono text-lg tabular')}
        />
      ))}
    </div>
  );
}
