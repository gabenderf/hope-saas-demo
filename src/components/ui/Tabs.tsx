import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = T.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex gap-1 overflow-x-auto border-b border-line', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px h-8 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-visible:shadow-focus data-[state=active]:border-accent-fill data-[state=active]:text-ink disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('pt-4 focus-visible:shadow-focus', className)} {...props} />;
}
