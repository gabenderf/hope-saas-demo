import { Check, Circle } from 'lucide-react';
import { DropdownMenu as D } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export const DropdownMenuRadioGroup = D.RadioGroup;

const itemBase =
  'relative flex min-h-[30px] cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm text-ink outline-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-3 data-[highlighted]:bg-hover';

export function DropdownMenuContent({ className, sideOffset = 4, align = 'end', ...props }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn('z-50 min-w-[200px] max-w-[340px] animate-pop-in rounded-md border border-line bg-surface p-1 shadow-popover', className)}
        {...props}
      />
    </D.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof D.Item> {
  icon?: ReactNode;
  /** Atalho de teclado exibido à direita. */
  shortcut?: string;
  /** Item desabilitado com motivo: aparece como dica ao passar o mouse. */
  disabledReason?: string;
  danger?: boolean;
}

export function DropdownMenuItem({ className, icon, shortcut, disabledReason, danger, children, disabled, ...props }: DropdownMenuItemProps) {
  const item = (
    <D.Item className={cn(itemBase, danger && 'text-crit', className)} disabled={disabled} {...props}>
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="font-mono text-xs text-ink-3">{shortcut}</span>}
    </D.Item>
  );
  if (disabled && disabledReason) {
    return (
      <Tooltip content={disabledReason} side="left">
        <div>{item}</div>
      </Tooltip>
    );
  }
  return item;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof D.CheckboxItem>) {
  return (
    <D.CheckboxItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <D.ItemIndicator className="absolute left-2 text-accent">
        <Check className="size-3.5" />
      </D.ItemIndicator>
      {children}
    </D.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof D.RadioItem>) {
  return (
    <D.RadioItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <D.ItemIndicator className="absolute left-2.5 text-accent">
        <Circle className="size-2 fill-current" />
      </D.ItemIndicator>
      {children}
    </D.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof D.Label>) {
  return <D.Label className={cn('px-2 pb-1 pt-2 text-xs text-ink-3', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof D.Separator>) {
  return <D.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}
