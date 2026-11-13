import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useConnectionState } from '@/data/hooks';
import { cn } from '@/lib/cn';

/**
 * Único ponto colorido do app: "Ao vivo" (estado real da conexão).
 * 'connecting' (abrindo a página) é neutro: ainda não houve falha nenhuma.
 * Âmbar só em 'reconnecting' (caiu e está tentando de novo); vermelho só offline.
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const state = useConnectionState();
  if (state === 'live') {
    return (
      <span role="status" className={cn('inline-flex items-center gap-2 text-xs text-ink-2', className)}>
        <span aria-hidden="true" className="size-2 rounded-full bg-brand animate-live" />
        <span className="max-sm:sr-only">Ao vivo</span>
      </span>
    );
  }
  if (state === 'offline') {
    return (
      <span role="status" className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-crit', className)}>
        <WifiOff className="size-3.5" aria-hidden="true" />
        <span className="max-sm:sr-only">Sem conexão</span>
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span role="status" className={cn('inline-flex items-center gap-1.5 text-xs text-ink-3', className)}>
        <LoaderCircle className="size-3.5" aria-hidden="true" />
        <span className="max-sm:sr-only">Conectando</span>
      </span>
    );
  }
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-warn', className)}>
      <RefreshCw className="size-3.5" aria-hidden="true" />
      <span className="max-sm:sr-only">Reconectando</span>
    </span>
  );
}
