/**
 * Moldura das telas de acesso (entrar, verificação, senha, acesso negado).
 * Mesmo desenho do login do guia (../novo-visual/componentes.html): logo,
 * título, poucos campos, uma ação. Sem gradiente, sem vidro.
 */
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';

export interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  /** faixa acima do cartão (ex.: aviso de demonstração) */
  banner?: ReactNode;
  /** largura do conteúdo: 'sm' para formulário, 'md' para cartões de perfil e QR code */
  width?: 'sm' | 'md';
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, banner, width = 'sm', children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-bg">
      <div>{banner}</div>
      <main className="grid place-items-center px-4 py-10">
        <div className={cn('grid w-full gap-5', width === 'sm' ? 'max-w-[360px]' : 'max-w-[560px]')}>
          <Logo className="w-[132px]" />
          <div>
            <h1 className="text-lg">{title}</h1>
            {subtitle ? <p className="mt-1 text-ink-2">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="text-ink-3">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
