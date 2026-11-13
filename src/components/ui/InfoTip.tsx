import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export interface InfoTipProps {
  /** Nome da métrica, usado no rótulo e no título do popover. */
  label: string;
  definition: string;
  /** Tabela ou origem do dado, ex.: "pedidos_separados". */
  source?: string;
}

/** Ícone de ajuda que abre a definição da métrica. Popover, então funciona por toque e teclado. */
export function InfoTip({ label, definition, source }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`O que é ${label}`}
          className="inline-flex rounded-sm p-0.5 text-ink-3 transition-colors hover:text-ink focus-visible:shadow-focus"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px]">
        <p className="mb-1 font-semibold">{label}</p>
        <p className="text-ink-2">{definition}</p>
        {source && (
          <p className="mt-2 text-xs text-ink-3">
            Fonte: <code className="rounded-sm bg-sunk px-1 font-mono">{source}</code>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
