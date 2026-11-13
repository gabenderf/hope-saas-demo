/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:translate-y-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'border-accent-fill bg-accent-fill text-on-accent hover:border-accent-fill-hover hover:bg-accent-fill-hover',
        secondary: 'border-line-strong bg-surface text-ink hover:bg-hover',
        ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-hover hover:text-ink',
        danger: 'border-line-strong bg-surface text-crit hover:border-crit hover:bg-crit-soft',
      },
      size: {
        sm: 'h-[26px] px-2 text-xs',
        md: 'h-[30px] px-3 text-sm',
        lg: 'h-9 px-4 text-base',
        icon: 'size-[30px] p-0 text-sm',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Ícone à esquerda do texto. */
  icon?: ReactNode;
}

export function Button({ className, variant, size, asChild, loading, icon, children, disabled, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
