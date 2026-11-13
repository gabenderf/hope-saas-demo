import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, loginRedirect, safeRedirectPath } from './redirect';

describe('safeRedirectPath (proteção contra open redirect)', () => {
  it.each([
    ['/expedicao/operadores', '/expedicao/operadores'],
    ['/expedicao/relatorios?periodo=7d&vs=semana-passada', '/expedicao/relatorios?periodo=7d&vs=semana-passada'],
    ['/admin/usuarios#convites', '/admin/usuarios#convites'],
    ['/tv', '/tv'],
  ])('aceita caminho interno %s', (raw, out) => {
    expect(safeRedirectPath(raw)).toBe(out);
  });

  it.each([
    ['//evil.com'],
    ['//evil.com/expedicao'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/\r\n/evil.com'],
    ['https://evil.com'],
    ['http:/evil.com'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,oi'],
    ['evil.com'],
    ['expedicao'],
    [''],
    [' /expedicao'],
    ['/entrar'],
    ['/entrar?para=/expedicao'],
    ['/entrar/verificacao'],
    ['/' + 'a'.repeat(3000)],
  ])('recusa %j', (raw) => {
    expect(safeRedirectPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('recusa null e undefined', () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('a nova senha é destino válido (volta da verificação em duas etapas)', () => {
    expect(safeRedirectPath('/entrar/redefinir')).toBe('/entrar/redefinir');
  });

  it('usa o fallback informado', () => {
    expect(safeRedirectPath('//evil.com', '/tv')).toBe('/tv');
  });

  it('normaliza ponto-ponto sem sair do site', () => {
    expect(safeRedirectPath('/expedicao/../admin/usuarios')).toBe('/admin/usuarios');
    expect(safeRedirectPath('/../../evil.com')).toBe('/evil.com');
  });
});

describe('loginRedirect', () => {
  it('leva o caminho atual em ?para=', () => {
    expect(loginRedirect({ pathname: '/expedicao/metas', search: '?acao=meta-global' })).toBe(
      '/entrar?para=%2Fexpedicao%2Fmetas%3Facao%3Dmeta-global',
    );
  });
  it('não polui a URL quando o destino é a página padrão', () => {
    expect(loginRedirect({ pathname: '/expedicao' })).toBe('/entrar');
  });
  it('serve para a tela de verificação', () => {
    expect(loginRedirect({ pathname: '/admin/usuarios' }, '/entrar/verificacao')).toBe(
      '/entrar/verificacao?para=%2Fadmin%2Fusuarios',
    );
  });
});
