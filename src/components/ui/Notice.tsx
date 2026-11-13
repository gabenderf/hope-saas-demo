import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const noticeVariants = cva('flex items-start gap-3 rounded-md border px-4 py-3 text-sm text-ink', {
  variants: {
    tone: {
      info: 'border-line bg-sunk',
      ok: 'border-ok/30 bg-ok-soft',
      warn: 'border-warn/30 bg-warn-soft',
      crit: 'border-crit/30 bg-crit-soft',
    },
  },
  defaultVariants: { tone: 'info' },
});

const icons = { info: Info, ok: CheckCircle2, warn: AlertTriangle, crit: OctagonAlert } as const;
const iconColor = { info: 'text-ink-2', ok: 'text-ok', warn: 'text-warn', crit: 'text-crit' } as const;

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Notice({ tone = 'info', title, children, action, className }: NoticeProps) {
  const t = tone ?? 'info';
  const Icon = icons[t];
  return (
    <div role={t === 'crit' ? 'alert' : 'status'} className={cn(noticeVariants({ tone: t }), className)}>
      <Icon className={cn('mt-0.5', iconColor[t])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'text-ink-2')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
