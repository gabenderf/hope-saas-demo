import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Conteúdo só para leitor de tela. */
export function VisuallyHidden({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('absolute -m-px size-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]', className)}
      {...props}
    />
  );
}
