import { RadioGroup as R } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function RadioGroup({ className, ...props }: ComponentProps<typeof R.Root>) {
  return <R.Root className={cn('grid gap-2', className)} {...props} />;
}

export function RadioItem({ className, ...props }: ComponentProps<typeof R.Item>) {
  return (
    <R.Item
      className={cn(
        'grid size-[15px] shrink-0 place-items-center rounded-full border border-line-strong bg-surface transition-colors focus-visible:shadow-focus data-[state=checked]:border-accent-fill disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <R.Indicator className="block size-[7px] rounded-full bg-accent-fill" />
    </R.Item>
  );
}
