import { Switch as S } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-line-strong bg-sunk p-px transition-colors focus-visible:shadow-focus data-[state=checked]:border-accent-fill data-[state=checked]:bg-accent-fill disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-3.5 rounded-full bg-ink-3 transition-transform data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-on-accent" />
    </S.Root>
  );
}
