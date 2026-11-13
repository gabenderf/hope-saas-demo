import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Cartão com borda, sem sombra. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-md border border-line bg-surface', className)} {...props} />;
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}

export function CardHeader({ title, description, actions, className, as: H = 'h2' }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', className)}>
      <div className="min-w-0">
        <H className="text-md">{title}</H>
        {description && <p className="text-ink-3">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3 border-t border-line px-4 py-2 text-ink-3', className)} {...props} />;
}
