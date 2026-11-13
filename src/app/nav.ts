/**
 * Navegação do módulo Expedição: menu lateral, barra inferior do celular,
 * breadcrumbs e paleta de comandos leem DAQUI. Para criar uma tela, acrescente
 * a linha aqui e a rota em router.tsx.
 */
import {
  Activity,
  CalendarDays,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  ShieldCheck,
  Target,
  Timer,
  Users,
} from 'lucide-react';
import type { Permission } from '@/auth/types';

export type NavGroupId = 'acompanhar' | 'planejar' | 'administrar';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission: Permission;
  group: NavGroupId;
  /** aparece na barra inferior do celular */
  mobileTab?: boolean;
  /** uma linha, usada na paleta de comandos */
  description: string;
  keywords?: string[];
}

export const NAV_GROUPS: { id: NavGroupId; label: string | null }[] = [
  { id: 'acompanhar', label: null },
  { id: 'planejar', label: 'Planejar' },
  { id: 'administrar', label: 'Administrar' },
];

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'visao-geral',
    label: 'Visão Geral',
    to: '/expedicao',
    icon: LayoutDashboard,
    permission: 'expedicao.ver',
    group: 'acompanhar',
    mobileTab: true,
    description: 'Pedidos, ritmo e operadores do período',
    keywords: ['inicio', 'dashboard', 'resumo', 'hoje'],
  },
  {
    id: 'operadores',
    label: 'Operadores',
    to: '/expedicao/operadores',
    icon: Users,
    permission: 'expedicao.ver',
    group: 'acompanhar',
    mobileTab: true,
    description: 'Ritmo, bancada e histórico de cada operador',
    keywords: ['equipe', 'bancada', 'ritmo'],
  },
  {
    id: 'produtos',
    label: 'Produtos',
    to: '/expedicao/produtos',
    icon: Package,
    permission: 'expedicao.ver',
    group: 'acompanhar',
    description: 'SKUs mais separados e pedidos mistos',
    keywords: ['sku', 'estoque', 'ranking'],
  },
  {
    id: 'atividade',
    label: 'Atividade',
    to: '/expedicao/atividade',
    icon: Activity,
    permission: 'expedicao.ver',
    group: 'acompanhar',
    description: 'Bipes, entradas e saídas em tempo real',
    keywords: ['feed', 'bipes', 'tempo real'],
  },
  {
    id: 'previsao',
    label: 'Previsão',
    to: '/expedicao/previsao',
    icon: Timer,
    permission: 'expedicao.ver',
    group: 'planejar',
    mobileTab: true,
    description: 'Término da fila, obrigatório do dia e demanda de estoque',
    keywords: ['fila', 'termino', 'obrigatorio', 'coleta de dados'],
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    to: '/expedicao/planejamento',
    icon: CalendarDays,
    permission: 'expedicao.ver',
    group: 'planejar',
    description: 'Comparativo de meses e projeção do mês corrente',
    keywords: ['mes', 'projecao', 'feriado', 'spike', 'pecas'],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    to: '/expedicao/relatorios',
    icon: FileText,
    permission: 'expedicao.ver',
    group: 'planejar',
    description: 'Produtividade por período e exportação',
    keywords: ['csv', 'excel', 'periodo', 'exportar'],
  },
  {
    id: 'metas',
    label: 'Metas',
    to: '/expedicao/metas',
    icon: Target,
    permission: 'expedicao.ver',
    group: 'administrar',
    description: 'Meta global do dia, metas individuais e agenda',
    keywords: ['meta global', 'meta individual'],
  },
  {
    id: 'usuarios',
    label: 'Usuários e perfis',
    to: '/admin/usuarios',
    icon: ShieldCheck,
    permission: 'usuarios.gerenciar',
    group: 'administrar',
    description: 'Quem acessa o painel e com qual perfil',
    keywords: ['acesso', 'convite', 'perfil'],
  },
  {
    id: 'historico',
    label: 'Histórico de alterações',
    to: '/admin/historico',
    icon: History,
    permission: 'auditoria.ver',
    group: 'administrar',
    description: 'Quem mudou o quê e quando',
    keywords: ['auditoria', 'log'],
  },
];

/** Item de navegação que corresponde a um caminho (para breadcrumb e item ativo). */
export function navItemFor(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length).find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}
