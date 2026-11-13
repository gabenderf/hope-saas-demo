import { describe, expect, it } from 'vitest';
import { demoUser } from './demo';
import { can } from './permissions';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, type Permission, type Role, type SessionUser } from './types';

const ROLES: Role[] = ['admin', 'lideranca', 'leitura', 'tv'];

/** Matriz esperada, escrita à mão: se alguém mexer em ROLE_PERMISSIONS sem querer, este teste acusa. */
const EXPECTED: Record<Role, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  lideranca: [
    'expedicao.ver',
    'expedicao.exportar',
    'expedicao.metas.editar',
    'expedicao.operadores.gerenciar',
    'expedicao.previsao.configurar',
    'auditoria.ver',
    'notificacoes.configurar',
    'tv.ver',
  ],
  leitura: ['expedicao.ver', 'expedicao.exportar', 'notificacoes.configurar', 'tv.ver'],
  tv: ['tv.ver'],
};

describe('can() e a matriz papel x permissão', () => {
  for (const role of ROLES) {
    for (const permission of ALL_PERMISSIONS) {
      const expected = EXPECTED[role].includes(permission);
      it(`${role} ${expected ? 'pode' : 'não pode'} ${permission}`, () => {
        expect(can(demoUser(role), permission)).toBe(expected);
      });
    }
  }

  it('a matriz do contrato bate com a esperada', () => {
    for (const role of ROLES) expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...EXPECTED[role]].sort());
  });

  it('sem usuário, nada', () => {
    for (const p of ALL_PERMISSIONS) expect(can(null, p)).toBe(false);
  });

  it('liderança nunca gerencia usuários nem dispositivos', () => {
    const u = demoUser('lideranca');
    expect(can(u, 'usuarios.gerenciar')).toBe(false);
    expect(can(u, 'dispositivos.gerenciar')).toBe(false);
  });

  it('sem o módulo Expedição, nenhuma permissão da Expedição (mesmo admin)', () => {
    const admin: SessionUser = { ...demoUser('admin'), modules: [] };
    expect(can(admin, 'expedicao.ver')).toBe(false);
    expect(can(admin, 'tv.ver')).toBe(false);
    // permissões da conta continuam
    expect(can(admin, 'usuarios.gerenciar')).toBe(true);
    expect(can(admin, 'auditoria.ver')).toBe(true);
  });

  it('papel por módulo restringe dentro do módulo', () => {
    const u: SessionUser = { ...demoUser('lideranca'), moduleRoles: { expedicao: 'leitura' } };
    expect(can(u, 'expedicao.ver')).toBe(true);
    expect(can(u, 'expedicao.metas.editar')).toBe(false);
    expect(can(u, 'auditoria.ver')).toBe(true);
  });

  it('dispositivo com papel de pessoa no token não ganha nada de pessoa', () => {
    const forged: SessionUser = { ...demoUser('tv'), role: 'admin' };
    expect(can(forged, 'expedicao.metas.editar')).toBe(false);
    expect(can(forged, 'usuarios.gerenciar')).toBe(false);
  });
});
