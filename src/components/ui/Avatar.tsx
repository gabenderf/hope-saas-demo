/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export const avatarVariants = cva(
  'inline-grid shrink-0 place-items-center rounded-full bg-accent-soft-2 font-semibold text-accent-strong',
  {
    variants: { size: { sm: 'size-5 text-[9px]', md: 'size-[26px] text-[10px]', lg: 'size-9 text-sm' } },
    defaultVariants: { size: 'md' },
  },
);

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  className?: string;
}

/** Iniciais do nome. O nome completo fica como rótulo acessível. */
export function Avatar({ name, size, className }: AvatarProps) {
  return (
    <span role="img" aria-label={name} className={cn(avatarVariants({ size }), className)}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
