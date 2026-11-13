/**
 * Apps do ecossistema Hope. A Expedição é o primeiro a entrar no SaaS; os
 * outros já aparecem no seletor (como "em breve") para o shell nascer
 * multi-módulo e as permissões nascerem por módulo.
 */
import { Landmark, type LucideIcon, MapPinned, PackageCheck, Tags } from 'lucide-react';
import type { ModuleId } from '@/auth/types';

export interface AppModule {
  id: ModuleId;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'ativo' | 'em-breve';
  home: string;
}

export const MODULES: AppModule[] = [
  {
    id: 'expedicao',
    label: 'Expedição',
    description: 'Produtividade, previsão e planejamento da separação',
    icon: PackageCheck,
    status: 'ativo',
    home: '/expedicao',
  },
  {
    id: 'clientes',
    label: 'Clientes e representantes',
    description: 'Mapa com integração Omie',
    icon: MapPinned,
    status: 'em-breve',
    home: '/clientes',
  },
  {
    id: 'etiquetas',
    label: 'Etiquetas',
    description: 'Gerador de etiquetas de nota fiscal',
    icon: Tags,
    status: 'em-breve',
    home: '/etiquetas',
  },
  {
    id: 'conciliacao',
    label: 'Conciliação Shopee',
    description: 'Conciliação financeira pela API oficial da Shopee',
    icon: Landmark,
    status: 'em-breve',
    home: '/conciliacao',
  },
];
