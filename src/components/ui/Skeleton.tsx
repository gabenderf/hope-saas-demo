import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Esqueleto com o formato final do conteúdo: dê largura e altura pela className. */
export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" className={cn('skeleton block h-3 w-full', className)} {...props} />;
}
