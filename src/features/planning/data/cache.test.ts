import { describe, expect, it } from 'vitest';
import { agregar } from '../model/agregar';
import { CACHE_MES_CORRENTE_MS, CACHE_PREFIXO } from '../model/constantes';
import { memoria } from '../model/testes/storage';
import { gravarCache, lerCache, limparCache, prefixoDoCache } from './cache';

const agg = agregar([{ data_hora: '2026-10-05T15:00:00Z', itens: [{ sku: '1X-A', quantidade: 1 }] }]);
const P = CACHE_PREFIXO;

describe('cache mensal', () => {
  it('mês fechado nunca expira', () => {
    const s = memoria();
    gravarCache(s, P, '2026-09', agg, true, 1000);
    expect(lerCache(s, P, '2026-09', 1000 + 365 * 86_400_000)).toEqual(agg);
  });

  it('mês corrente vale 10 minutos', () => {
    const s = memoria();
    gravarCache(s, P, '2026-11', agg, false, 1000);
    expect(lerCache(s, P, '2026-11', 1000 + CACHE_MES_CORRENTE_MS - 1)).toEqual(agg);
    expect(lerCache(s, P, '2026-11', 1000 + CACHE_MES_CORRENTE_MS)).toBeNull();
  });

  it('recarregar limpa só o prefixo do planejamento', () => {
    const s = memoria();
    gravarCache(s, P, '2026-09', agg, true, 0);
    gravarCache(s, prefixoDoCache('demo'), '2026-09', agg, true, 0);
    s.setItem('outra-coisa', 'x');
    limparCache(s, prefixoDoCache('demo'));
    expect(lerCache(s, prefixoDoCache('demo'), '2026-09', 1)).toBeNull();
    expect(lerCache(s, P, '2026-09', 1)).toEqual(agg);
    limparCache(s, P);
    expect(s.getItem('outra-coisa')).toBe('x');
  });

  it('o demo tem prefixo próprio e não lê o cache do banco real', () => {
    const s = memoria();
    gravarCache(s, P, '2026-09', agg, true, 0);
    expect(lerCache(s, prefixoDoCache('demo'), '2026-09', 1)).toBeNull();
  });

  it('lixo, formato antigo e storage ausente viram cache vazio', () => {
    const s = memoria();
    s.setItem(P + '2026-09', '{nao e json');
    expect(lerCache(s, P, '2026-09', 1)).toBeNull();
    s.setItem(P + '2026-08', JSON.stringify({ fechado: true, dados: { dias: 1 } }));
    expect(lerCache(s, P, '2026-08', 1)).toBeNull();
    expect(lerCache(null, P, '2026-09', 1)).toBeNull();
    expect(() => gravarCache(null, P, 'x', agg, true, 0)).not.toThrow();
  });

  it('quota estourada não derruba', () => {
    const s = memoria();
    s.setItem = () => {
      throw new Error('quota');
    };
    expect(() => gravarCache(s, P, '2026-09', agg, true, 0)).not.toThrow();
  });
});
