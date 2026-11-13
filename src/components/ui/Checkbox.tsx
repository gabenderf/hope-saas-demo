import { Check, Minus } from 'lucide-react';
import { Checkbox as C } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Checkbox({ className, ...props }: ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'grid size-[15px] shrink-0 place-items-center rounded-sm border border-line-strong bg-surface text-on-accent transition-colors focus-visible:shadow-focus data-[state=checked]:border-accent-fill data-[state=checked]:bg-accent-fill data-[state=indeterminate]:border-accent-fill data-[state=indeterminate]:bg-accent-fill disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-crit',
        className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === 'indeterminate' ? <Minus className="size-3 stroke-[2.5]" /> : <Check className="size-3 stroke-[2.5]" />}
      </C.Indicator>
    </C.Root>
  );
}
