import { describe, expect, it } from 'vitest';
import type { PanelUser } from '@/data/types';
import { deactivateBlock, roleChangeBlock } from './rules';

const u = (id: string, role: PanelUser['role'], status: PanelUser['status'] = 'ativo'): PanelUser => ({
  id,
  name: id,
  email: `${id}@hope.com`,
  username: null,
  role,
  status,
  lastSignInAt: null,
  mfaEnrolled: true,
});

describe('proteção de usuários', () => {
  const a1 = u('a1', 'admin');
  const a2 = u('a2', 'admin');
  const l = u('l', 'lideranca');

  it('ninguém muda o próprio perfil nem se desativa', () => {
    const ctx = { users: [a1, a2, l], self: { id: 'a1', email: 'a1@hope.com' } };
    expect(roleChangeBlock(a1, ctx)).not.toBeNull();
    expect(deactivateBlock(a1, ctx)).not.toBeNull();
    expect(roleChangeBlock(a2, ctx)).toBeNull();
    expect(deactivateBlock(l, ctx)).toBeNull();
  });
  it('reconhece a si mesmo pelo e-mail', () => {
    const ctx = { users: [a1, a2], self: { id: 'outro', email: 'A1@hope.com' } };
    expect(roleChangeBlock(a1, ctx)).not.toBeNull();
  });
  it('último administrador ativo não é rebaixado nem desativado', () => {
    const ctx = { users: [a1, u('a2', 'admin', 'desativado'), l], self: { id: 'l', email: null } };
    expect(roleChangeBlock(a1, ctx)).toMatch(/único administrador/);
    expect(deactivateBlock(a1, ctx)).toMatch(/único administrador/);
  });
  it('reativar nunca é bloqueado', () => {
    const off = u('x', 'admin', 'desativado');
    expect(deactivateBlock(off, { users: [off], self: null })).toBeNull();
  });
});
