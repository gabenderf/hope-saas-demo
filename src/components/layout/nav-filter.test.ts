import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@/auth/types';
import { filterNav } from './nav-filter';

const ids = (role: keyof typeof ROLE_PERMISSIONS) =>
  filterNav((p) => ROLE_PERMISSIONS[role].includes(p)).flatMap((g) => g.items.map((i) => i.id));

describe('menu por permissão', () => {
  it('admin vê tudo', () => {
    expect(ids('admin')).toContain('usuarios');
    expect(ids('admin')).toContain('historico');
  });
  it('liderança não vê usuários, mas vê histórico', () => {
    expect(ids('lideranca')).not.toContain('usuarios');
    expect(ids('lideranca')).toContain('historico');
  });
  it('leitura não vê usuários nem histórico', () => {
    const r = ids('leitura');
    expect(r).not.toContain('usuarios');
    expect(r).not.toContain('historico');
    expect(r).toContain('previsao');
  });
  it('TV não vê nada', () => {
    expect(ids('tv')).toEqual([]);
  });
});
