/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const badgeVariants = cva(
  'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium [&_svg]:size-[13px]',
  {
    variants: {
      tone: {
        neutral: 'bg-sunk text-ink-2',
        accent: 'bg-accent-soft text-accent',
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        crit: 'bg-crit-soft text-crit',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  icon?: ReactNode;
}

export function Badge({ className, tone, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
