import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn('rounded-sm border border-line bg-sunk px-1.5 py-px font-mono text-2xs text-ink-2', className)}
      {...props}
    />
  );
}
