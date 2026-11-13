import { navItemFor } from '@/app/nav';

const FIXED: [string, string][] = [
  ['/notificacoes', 'Notificações'],
  ['/configuracoes', 'Configurações'],
  ['/dev/ui', 'Guia de componentes'],
];

/** Título da aba do navegador por rota: "Visão Geral | Hope". */
export function pageTitle(pathname: string): string {
  const fixed = FIXED.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  const label = fixed?.[1] ?? navItemFor(pathname)?.label;
  return label ? `${label} | Hope` : 'Hope';
}
