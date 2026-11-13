import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={400}>{children}</T.Provider>;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Dica curta (400 ms). Funciona sozinho: já traz o provider. Não esconda informação essencial aqui, o toque não abre. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <T.Provider delayDuration={400}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={6}
            className="z-[60] max-w-[260px] animate-fade-in rounded-sm bg-ink px-2 py-1 text-xs text-ink-inverse shadow-popover"
          >
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
