import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, type ButtonProps } from './Button';

export type IconButtonProps = Omit<ButtonProps, 'size' | 'icon' | 'children' | 'aria-label'> & {
  /** Obrigatório: botão só com ícone precisa de nome acessível. */
  'aria-label': string;
  children: ReactNode;
  size?: 'icon' | 'sm';
};

export function IconButton({ children, size = 'icon', variant = 'ghost', className, ...props }: IconButtonProps) {
  return (
    <Button size="icon" variant={variant} className={cn(size === 'sm' && 'size-[26px]', className)} {...props}>
      {children}
    </Button>
  );
}
