import type { Permission } from '@/auth/types';
import type { PanelUser } from '@/data/types';

/** Rótulos em português de cada permissão, para a matriz de perfis. */
export const PERMISSION_LABEL: Record<Permission, string> = {
  'expedicao.ver': 'Ver a Expedição',
  'expedicao.exportar': 'Exportar relatórios',
  'expedicao.metas.editar': 'Alterar metas',
  'expedicao.operadores.gerenciar': 'Gerenciar operadores',
  'expedicao.previsao.configurar': 'Configurar a previsão',
  'auditoria.ver': 'Ver o histórico de alterações',
  'usuarios.gerenciar': 'Gerenciar usuários',
  'dispositivos.gerenciar': 'Gerenciar dispositivos',
  'notificacoes.configurar': 'Configurar notificações',
  'tv.ver': 'Abrir o Modo TV',
};

export const STATUS_LABEL: Record<PanelUser['status'], string> = {
  ativo: 'Ativo',
  convidado: 'Convidado',
  desativado: 'Desativado',
};
