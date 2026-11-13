import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('grid justify-items-center gap-2 px-5 py-8 text-center', className)}>
      {icon && <div className="mb-1 grid size-10 place-items-center rounded-md bg-sunk text-ink-2">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="max-w-[42ch] text-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
