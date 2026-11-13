/**
 * Toaster no estilo do protótipo B: fundo escuro no tema claro, claro no escuro,
 * centralizado embaixo. API:
 *   <Toaster />                         montado uma vez (router.tsx)
 *   toast(msg) / toast.success / toast.error
 *   toast.undoable(msg, undo)           toast com botão "Desfazer"
 */
/* eslint-disable react-refresh/only-export-components */
import { Toaster as Sonner, toast as sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(420px,calc(100vw-32px))] items-center gap-3 rounded-md bg-ink py-2 pl-4 pr-2 text-sm text-ink-inverse shadow-popover',
          title: 'flex-1',
          actionButton:
            'ml-auto h-[26px] rounded-sm px-2 text-sm font-medium underline underline-offset-4 hover:bg-ink-inverse/10 focus-visible:shadow-focus',
          error: 'border-l-4 border-crit',
          success: 'border-l-4 border-ok',
        },
      }}
    />
  );
}

type Msg = string;

function base(message: Msg) {
  return sonner(message);
}
base.success = (message: Msg) => sonner.success(message);
base.error = (message: Msg) => sonner.error(message);
base.undoable = (message: Msg, undo: () => void | Promise<void>) =>
  sonner(message, { action: { label: 'Desfazer', onClick: () => void undo() }, duration: 7000 });

export const toast = base;
