import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Um controle (Input, Textarea, Select...). Recebe id, aria-describedby e aria-invalid. */
  children: ReactNode;
}

export function Field({ label, help, error, required, className, children }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined;
  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child as ReactElement<Record<string, unknown>>, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })
    : child;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-ink-3">
            *
          </span>
        )}
      </label>
      {control}
      {help && (
        <p id={helpId} className="text-xs text-ink-3">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-crit">
          {error}
        </p>
      )}
    </div>
  );
}
