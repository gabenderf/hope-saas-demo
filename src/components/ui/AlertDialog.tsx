import { AlertDialog as A } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from './Button';

export const AlertDialog = A.Root;
export const AlertDialogTrigger = A.Trigger;

export interface AlertDialogContentProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Ação destrutiva usa o botão vermelho. */
  danger?: boolean;
}

/** Confirmação que exige resposta. Substitui o confirm() do navegador. */
export function AlertDialogContent({ title, description, confirmLabel, cancelLabel = 'Cancelar', onConfirm, danger }: AlertDialogContentProps) {
  return (
    <A.Portal>
      <A.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim" />
      <A.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-lg border border-line bg-surface p-5 shadow-popover">
        <A.Title className="text-md">{title}</A.Title>
        <A.Description className="mt-2 text-ink-2">{description}</A.Description>
        <div className="mt-5 flex justify-end gap-2">
          <A.Cancel asChild>
            <Button>{cancelLabel}</Button>
          </A.Cancel>
          <A.Action asChild>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </A.Action>
        </div>
      </A.Content>
    </A.Portal>
  );
}
