import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, MAX_PERSON_SESSION_MS, parseHopeClaims, personSessionTooOld, sessionStartedAt } from './claims';

function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function jwt(payload: unknown): string {
  return `${b64url({ alg: 'ES256' })}.${b64url(payload)}.assinatura`;
}
function claims(hope: unknown) {
  return { sub: 'u1', aal: 'aal1', app_metadata: { provider: 'email', hope } };
}

describe('decodeJwtPayload', () => {
  it('lê o payload com acento (UTF-8)', () => {
    expect(decodeJwtPayload(jwt({ nome: 'Liderança' }))).toEqual({ nome: 'Liderança' });
  });
  it.each(['', 'abc', 'a.b.c', 'a.!!!.c'])('lixo vira null: %j', (t) => {
    expect(decodeJwtPayload(t)).toBeNull();
  });
});

describe('parseHopeClaims', () => {
  it('perfil completo', () => {
    const r = parseHopeClaims(
      claims({
        v: 1,
        tipo: 'pessoa',
        papel: 'lideranca',
        status: 'ativo',
        nome: 'Ana',
        modulos: { expedicao: 'lideranca', conciliacao: 'leitura' },
      }),
    );
    expect(r).toEqual({
      ok: true,
      profile: {
        role: 'lideranca',
        kind: 'pessoa',
        name: 'Ana',
        modules: ['expedicao', 'conciliacao'],
        moduleRoles: { conciliacao: 'leitura' },
      },
    });
  });

  it('sem claim hope: conta sem perfil, nunca acesso', () => {
    expect(parseHopeClaims({ sub: 'u1', app_metadata: { provider: 'email' } })).toEqual({ ok: false, reason: 'sem-perfil' });
    expect(parseHopeClaims(null)).toEqual({ ok: false, reason: 'sem-perfil' });
  });

  it('claim fora do formato: sem perfil', () => {
    expect(parseHopeClaims(claims({ v: 1, tipo: 'pessoa', papel: 'superadmin', status: 'ativo' }))).toEqual({
      ok: false,
      reason: 'sem-perfil',
    });
    expect(parseHopeClaims(claims({ papel: 'admin' }))).toEqual({ ok: false, reason: 'sem-perfil' });
  });

  it('desativado', () => {
    expect(
      parseHopeClaims(claims({ v: 1, tipo: 'pessoa', papel: 'admin', status: 'desativado', modulos: { expedicao: 'admin' } })),
    ).toEqual({ ok: false, reason: 'desativado' });
  });

  it('pessoa sem módulo e que não é admin: sem módulo', () => {
    expect(parseHopeClaims(claims({ v: 1, tipo: 'pessoa', papel: 'leitura', status: 'ativo', modulos: {} }))).toEqual({
      ok: false,
      reason: 'sem-modulo',
    });
  });

  it('credencial de bancada ou coletor não abre o painel', () => {
    for (const papel of ['bancada', 'coletor']) {
      expect(parseHopeClaims(claims({ v: 1, tipo: 'dispositivo', papel, status: 'ativo', modulos: { expedicao: 'tv' } }))).toEqual({
        ok: false,
        reason: 'dispositivo',
      });
    }
  });

  it('dispositivo com papel de pessoa é recusado', () => {
    expect(
      parseHopeClaims(claims({ v: 1, tipo: 'dispositivo', papel: 'admin', status: 'ativo', modulos: { expedicao: 'admin' } })),
    ).toEqual({ ok: false, reason: 'dispositivo' });
  });

  it('pessoa com papel de TV é recusada', () => {
    expect(parseHopeClaims(claims({ v: 1, tipo: 'pessoa', papel: 'tv', status: 'ativo', modulos: { expedicao: 'tv' } }))).toEqual({
      ok: false,
      reason: 'sem-perfil',
    });
  });

  it('papel de módulo acima do papel geral é ignorado', () => {
    const r = parseHopeClaims(
      claims({ v: 1, tipo: 'pessoa', papel: 'leitura', status: 'ativo', modulos: { expedicao: 'admin', conciliacao: 'leitura' } }),
    );
    expect(r).toEqual({
      ok: true,
      profile: { role: 'leitura', kind: 'pessoa', name: null, modules: ['conciliacao'], moduleRoles: {} },
    });
  });

  it('módulo desconhecido é ignorado', () => {
    const r = parseHopeClaims(claims({ v: 1, tipo: 'pessoa', papel: 'admin', status: 'ativo', modulos: { financeiro: 'admin' } }));
    expect(r).toEqual({ ok: true, profile: { role: 'admin', kind: 'pessoa', name: null, modules: [], moduleRoles: {} } });
  });

  it('TV pareada', () => {
    const r = parseHopeClaims(
      claims({ v: 1, tipo: 'dispositivo', papel: 'tv', status: 'ativo', nome: 'TV bancadas', modulos: { expedicao: 'tv' } }),
    );
    expect(r).toEqual({
      ok: true,
      profile: { role: 'tv', kind: 'dispositivo', name: 'TV bancadas', modules: ['expedicao'], moduleRoles: {} },
    });
  });
});

describe('limite absoluto da sessão de pessoa', () => {
  const now = Date.parse('2026-11-05T20:00:00Z');
  const sec = (ms: number) => Math.floor(ms / 1000);

  it('usa o método mais antigo do amr (o login com senha)', () => {
    const c = { amr: [{ method: 'totp', timestamp: sec(now - 60_000) }, { method: 'password', timestamp: sec(now - 3_600_000) }] };
    expect(sessionStartedAt(c)).toBe(sec(now - 3_600_000) * 1000);
  });

  const DAY = 24 * 3_600_000;
  const at = (msAgo: number) => ({ amr: [{ method: 'password', timestamp: sec(now - msAgo) }] });

  it('padrão de 15 dias: 14 dias ainda vale, 15 não', () => {
    expect(MAX_PERSON_SESSION_MS).toBe(15 * DAY);
    expect(personSessionTooOld(at(14 * DAY), now)).toBe(false);
    expect(personSessionTooOld(at(15 * DAY), now)).toBe(true);
  });

  it('computador compartilhado: 11 h ainda vale, 12 h não', () => {
    const twelve = 12 * 3_600_000;
    expect(personSessionTooOld(at(11 * 3_600_000), now, twelve)).toBe(false);
    expect(personSessionTooOld(at(twelve), now, twelve)).toBe(true);
  });

  it('sem amr não derruba (o banco ainda confere)', () => {
    expect(personSessionTooOld({}, now)).toBe(false);
    expect(personSessionTooOld(null, now)).toBe(false);
  });
});
