import { describe, expect, it } from 'vitest';
import { decideMfa, normalizeTotpCode, roleRequiresMfa } from './mfa';
import type { Role } from './types';

describe('MFA obrigatório por papel', () => {
  it.each<[Role, boolean]>([
    ['admin', true],
    ['lideranca', true],
    ['leitura', false],
    ['tv', false],
  ])('%s exige MFA: %s', (role, required) => {
    expect(roleRequiresMfa(role, 'pessoa')).toBe(required);
  });

  it('dispositivo nunca exige (não há pessoa para digitar código)', () => {
    expect(roleRequiresMfa('admin', 'dispositivo')).toBe(false);
    expect(roleRequiresMfa('tv', 'dispositivo')).toBe(false);
  });
});

describe('decideMfa', () => {
  it('admin sem autenticador precisa cadastrar', () => {
    expect(decideMfa({ role: 'admin', kind: 'pessoa', aal: 'aal1', hasVerifiedFactor: false })).toBe('enroll');
  });
  it('liderança sem autenticador precisa cadastrar', () => {
    expect(decideMfa({ role: 'lideranca', kind: 'pessoa', aal: 'aal1', hasVerifiedFactor: false })).toBe('enroll');
  });
  it('admin com autenticador e sessão aal1 precisa verificar', () => {
    expect(decideMfa({ role: 'admin', kind: 'pessoa', aal: 'aal1', hasVerifiedFactor: true })).toBe('verify');
  });
  it('admin em aal2 entra', () => {
    expect(decideMfa({ role: 'admin', kind: 'pessoa', aal: 'aal2', hasVerifiedFactor: true })).toBe('ok');
  });
  it('leitura sem autenticador entra', () => {
    expect(decideMfa({ role: 'leitura', kind: 'pessoa', aal: 'aal1', hasVerifiedFactor: false })).toBe('ok');
  });
  it('leitura que cadastrou autenticador por vontade própria verifica', () => {
    expect(decideMfa({ role: 'leitura', kind: 'pessoa', aal: 'aal1', hasVerifiedFactor: true })).toBe('verify');
  });
  it('sem claim aal conta como aal1', () => {
    expect(decideMfa({ role: 'admin', kind: 'pessoa', aal: null, hasVerifiedFactor: false })).toBe('enroll');
  });
  it('TV pareada entra sem MFA', () => {
    expect(decideMfa({ role: 'tv', kind: 'dispositivo', aal: 'aal1', hasVerifiedFactor: false })).toBe('ok');
  });
});

describe('normalizeTotpCode', () => {
  it('aceita 6 dígitos, com espaços', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
  });
  it.each(['12345', '1234567', 'abcdef', '12345a', ''])('recusa %j', (raw) => {
    expect(normalizeTotpCode(raw)).toBeNull();
  });
});
