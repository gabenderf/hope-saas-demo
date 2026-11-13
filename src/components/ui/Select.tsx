import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export function Select({ options, placeholder, invalid, id, className, value, defaultValue, onValueChange, disabled, name, required, ...aria }: SelectProps) {
  return (
    <S.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} name={name} required={required}>
      <S.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          'inline-flex h-[30px] w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink transition-colors hover:bg-hover focus:border-accent-fill focus:outline-none focus:shadow-focus aria-[invalid=true]:border-crit disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-3 data-[placeholder]:text-ink-3',
          className,
        )}
        {...aria}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-3.5 text-ink-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] animate-pop-in overflow-hidden rounded-md border border-line bg-surface p-1 text-sm shadow-popover"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex min-h-[30px] cursor-pointer select-none items-center rounded-sm pl-2 pr-7 text-ink outline-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-3 data-[highlighted]:bg-hover"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2 text-accent">
                  <Check className="size-3.5" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
