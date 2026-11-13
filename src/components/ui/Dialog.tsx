import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export interface DialogContentProps extends Omit<ComponentProps<typeof D.Content>, 'title'> {
  title: string;
  description?: string;
  footer?: ReactNode;
}

export function DialogContent({ title, description, footer, children, className, ...props }: DialogContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-lg border border-line bg-surface shadow-popover',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <D.Title className="text-md">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-ink-2">{description}</D.Description>
            ) : null}
          </div>
          <D.Close asChild>
            <IconButton aria-label="Fechar">
              <X />
            </IconButton>
          </D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
