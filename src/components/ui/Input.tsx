import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const controlClass =
  'w-full rounded-md border border-line-strong bg-surface text-ink placeholder:text-ink-3 transition-colors focus:border-accent-fill focus:outline-none focus:shadow-focus aria-[invalid=true]:border-crit disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-3';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, 'h-[30px] px-2.5 text-sm', className)} {...props} />;
}
