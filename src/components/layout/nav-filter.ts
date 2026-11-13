import { NAV_GROUPS, NAV_ITEMS, type NavGroupId, type NavItem } from '@/app/nav';
import { can, useAuth } from '@/auth';
import type { Permission } from '@/auth/types';

export interface VisibleGroup {
  id: NavGroupId;
  label: string | null;
  items: NavItem[];
}

/** Filtra o menu por permissão e descarta grupo vazio. Pura (testável). */
export function filterNav(allow: (permission: Permission) => boolean): VisibleGroup[] {
  return NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: NAV_ITEMS.filter((i) => i.group === g.id && allow(i.permission)),
  })).filter((g) => g.items.length > 0);
}

export function useVisibleNav(): VisibleGroup[] {
  const { user } = useAuth();
  return filterNav((p) => can(user, p));
}
