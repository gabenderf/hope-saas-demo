import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export interface SheetContentProps {
  /** Obrigatório: é o nome do painel para leitor de tela. */
  title: string;
  description?: string;
  /** Conteúdo ao lado do título (avatar, badge). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Painel lateral à direita no desktop; no celular sobe de baixo, com alça. */
export function SheetContent({ title, description, header, footer, children, className }: SheetContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim" />
      <D.Content
        className={cn(
          'fixed z-50 flex flex-col border-line bg-surface shadow-popover',
          'inset-y-0 right-0 w-[min(460px,100vw)] animate-sheet-in-right border-l',
          'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[88dvh] max-md:w-full max-md:animate-sheet-in-bottom max-md:rounded-t-lg max-md:border-l-0 max-md:border-t',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <div aria-hidden="true" className="mx-auto mt-2 hidden h-1 w-9 rounded-full bg-line-strong max-md:block" />
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {header}
          <div className="min-w-0 flex-1">
            <D.Title className="text-md">{title}</D.Title>
            {description && <D.Description className="mt-1 text-ink-3">{description}</D.Description>}
          </div>
          <D.Close asChild>
            <IconButton aria-label="Fechar painel">
              <X />
            </IconButton>
          </D.Close>
        </div>
        <div className="grid flex-1 content-start gap-6 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
