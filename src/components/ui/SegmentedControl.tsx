import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  'aria-label': string;
  className?: string;
}

/** Hoje / 7 dias / Mês. Clicar no item ativo não desmarca. */
export function SegmentedControl({ value, onValueChange, options, className, ...aria }: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v);
      }}
      className={cn('inline-flex gap-0.5 rounded-md bg-sunk p-0.5', className)}
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="h-6 rounded-sm px-2 text-xs font-medium text-ink-2 transition-colors hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
