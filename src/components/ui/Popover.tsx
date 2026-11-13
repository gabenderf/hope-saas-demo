import { Popover as P } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 6, align = 'start', ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          'z-50 max-w-[340px] animate-pop-in rounded-md border border-line bg-surface p-3 text-sm text-ink shadow-popover',
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
