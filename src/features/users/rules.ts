/** Regras de proteção da gestão de usuários (puras, testadas em rules.test.ts). */
import type { PanelUser } from '@/data/types';

export interface ProtectionContext {
  users: readonly PanelUser[];
  /** usuário logado */
  self: { id: string; email: string | null } | null;
}

export function isSelf(user: PanelUser, self: ProtectionContext['self']): boolean {
  if (!self) return false;
  if (user.id === self.id) return true;
  return !!self.email && !!user.email && self.email.toLowerCase() === user.email.toLowerCase();
}

/** true se `user` é o único administrador ativo. */
export function isLastAdmin(user: PanelUser, users: readonly PanelUser[]): boolean {
  const admins = users.filter((u) => u.role === 'admin' && u.status === 'ativo');
  return user.role === 'admin' && user.status === 'ativo' && admins.length === 1 && admins[0]!.id === user.id;
}

/** Motivo de NÃO poder mudar o perfil, ou null se pode. */
export function roleChangeBlock(user: PanelUser, ctx: ProtectionContext): string | null {
  if (isSelf(user, ctx.self)) return 'Você não pode mudar o seu próprio perfil. Peça a outro administrador.';
  if (isLastAdmin(user, ctx.users)) return 'É o único administrador ativo. Promova outra pessoa antes de mudar este perfil.';
  return null;
}

/** Motivo de NÃO poder desativar, ou null. Reativar nunca é bloqueado. */
export function deactivateBlock(user: PanelUser, ctx: ProtectionContext): string | null {
  if (user.status === 'desativado') return null;
  if (isSelf(user, ctx.self)) return 'Você não pode desativar o seu próprio acesso. Peça a outro administrador.';
  if (isLastAdmin(user, ctx.users)) return 'É o único administrador ativo. Promova outra pessoa antes de desativar este acesso.';
  return null;
}
