/**
 * Regra de permissão do front. O banco repete a mesma regra em
 * app.tem_permissao() (supabase/migrations), e é o banco que decide de verdade:
 * isto aqui só liga e desliga controles na tela.
 */
import { PERMISSION_MODULE, ROLE_PERMISSIONS, type Permission, type Role, type SessionUser } from './types';

/**
 * Papel que vale para uma permissão.
 *   - permissão de módulo: o papel daquele módulo (moduleRoles), ou o papel
 *     geral se o módulo estiver liberado; sem o módulo, nenhum papel.
 *   - permissão da conta (usuários, dispositivos, histórico): o papel geral.
 */
export function effectiveRole(user: SessionUser, permission: Permission): Role | null {
  const module = PERMISSION_MODULE[permission];
  if (!module) return user.role;
  if (!user.modules.includes(module)) return null;
  return user.moduleRoles?.[module] ?? user.role;
}

export function can(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  const role = effectiveRole(user, permission);
  if (!role) return false;
  // Dispositivo nunca ganha permissão de pessoa, mesmo com papel errado no token.
  if (user.kind === 'dispositivo' && role !== 'tv') return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
