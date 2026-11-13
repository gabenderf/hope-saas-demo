/**
 * Os 47 casos de ../../dashboard-expedicao/teste-pecas.js (ditados pelo dono do projeto em
 * 02/09/2026), portados para vitest. Se um falhar: ou a regra de negócio
 * mudou (atualize o caso e o CLAUDE.md juntos) ou o código regrediu.
 */
import { describe, expect, it } from 'vitest';
import {
  FAMILIAS_PADRAO,
  baseEstoque,
  embalagensDe,
  escolherEmbalagem,
  grupoEstoque,
  mesclarFamilias,
  multiplicador,
  pecasDe,
  prefixo,
} from './sku';

const PECAS: [sku: string, quantidade: number, esperado: number][] = [
  ['100X-TOU-DESC-TNT-BRA', 1, 1],
  ['50X-TOU-DESC-TNT-BRA', 1, 0.5],
  ['100X-TOU-TNT-BRA', 1, 1],
  ['100UN-40X1,20-AGULHA', 1, 1],
  ['50UN-13X0,45-AGULHA', 1, 0.5],
  ['12X-ATADURA-8CM', 1, 1],
  ['24X-ATADURA-10CM', 1, 2],
  ['60X-ATADURA-10CM', 1, 5],
  ['6X-ATADURA-8CM', 1, 0.5],
  ['100X-LUVA-SOFT-M', 1, 1],
  ['20X-LUVA-SOFT-G', 1, 1],
  ['40X-LUVA-SOFT-P', 1, 2],
  ['40X-LUVA-SOFT-M', 2, 4],
  ['2CX-LUVA-VINIL-M', 1, 2],
  ['2CX-LUVA-VINIL-P', 3, 6],
  ['100X-SERIN-5ML', 1, 1],
  ['50X-SERIN-5ML', 1, 0.5],
  ['30X-SERIN-5ML', 1, 0.3],
  ['10X-SERIN-3ML', 1, 0.1],
  ['3X-LEN-ECO-70X50', 1, 3],
  ['1X-500-PAP-INTER', 1, 1],
  ['1,5L-PERFU-FLEX', 1, 1],
  ['13L-PERFU-FLEX', 2, 2],
  ['10CM-GRAU', 1, 1],
  ['500-PAP-INTER', 1, 1],
  ['5X-LEN-COM-TNT', 4, 20],
];

const GRUPOS: [sku: string, esperado: string][] = [
  ['3X-LEN-ECO-70X50', 'LEN-70X50'],
  ['10X-LEN-CEL-70X50', 'LEN-70X50'],
  ['3X-LEN-ECO-50X50', 'LEN-50X50'],
  ['10X-LEN-CEL-50X50', 'LEN-50X50'],
  ['1X-GAZE-11FIOS', 'GAZE'],
  ['1X-GAZE-13FIOS', 'GAZE'],
  ['1X-GAZE-ESTERIL', 'GAZE-ESTERIL'], // estéril NÃO agrupa
  ['5X-LEN-COM-TNT', 'LEN-COM-TNT'],
  ['1X-LEN-SEM-TNT', 'LEN-SEM-TNT'],
  ['100X-TOU-DESC-TNT-BRA', 'TOU-DESC-TNT-BRA'],
  ['24X-ATADURA-10CM', 'ATADURA-10CM'],
];

const BASES: [sku: string, esperado: string][] = [
  ['100X-TOU-DESC-TNT-BRA', 'TOU-DESC-TNT-BRA'],
  ['50X-TOU-DESC-TNT-BRA', 'TOU-DESC-TNT-BRA'],
  ['100UN-40X1,20-AGULHA', '40X1,20-AGULHA'],
  ['2CX-LUVA-VINIL-M', 'LUVA-VINIL-M'],
  ['3X-LEN-ECO-70X50', 'LEN-ECO-70X50'],
  ['1X-500-PAP-INTER', '500-PAP-INTER'],
  ['13L-PERFU-FLEX', '13L-PERFU-FLEX'],
  ['10CM-GRAU', '10CM-GRAU'],
  ['40X-LUVA-SOFT-P', 'LUVA-SOFT-P'],
  ['100X-LUVA-SOFT-M', 'LUVA-SOFT-M'],
];

describe('teste-pecas.js portado (47 casos)', () => {
  it('tem 47 casos', () => {
    expect(PECAS.length + GRUPOS.length + BASES.length).toBe(47);
  });

  describe('peças', () => {
    it.each(PECAS)('%s x%d = %d peça(s)', (sku, q, esperado) => {
      expect(Math.abs(pecasDe(sku, q) - esperado)).toBeLessThan(1e-9);
    });
  });

  describe('agrupamento por produto (baseEstoque)', () => {
    it.each(BASES)('%s -> %s', (sku, esperado) => {
      expect(baseEstoque(sku)).toBe(esperado);
    });
  });

  describe('grupo de estoque (só a tabela de peças usa)', () => {
    it.each(GRUPOS)('%s -> %s', (sku, esperado) => {
      expect(grupoEstoque(sku)).toBe(esperado);
    });
  });
});

describe('regras do CLAUDE.md que os 47 casos não cobrem', () => {
  it('prefixo: NX, NUN e NCX são quantidade; 13L e 10CM não são', () => {
    expect(prefixo('3X-LEN-ECO-70X50')).toEqual({ n: 3, unidade: 'X' });
    expect(prefixo('100UN-40X1,20-AGULHA')).toEqual({ n: 100, unidade: 'UN' });
    expect(prefixo('2CX-LUVA-VINIL-M')).toEqual({ n: 2, unidade: 'CX' });
    expect(prefixo('13L-PERFU-FLEX')).toEqual({ n: 1, unidade: 'X' });
    expect(prefixo('10CM-GRAU')).toEqual({ n: 1, unidade: 'X' });
    expect(prefixo('3x-len-eco-70x50').n).toBe(3);
    expect(multiplicador(null)).toBe(1);
  });

  it('LUVA-SOFT tem duas embalagens e vence LUVA (chave mais longa primeiro)', () => {
    expect(embalagensDe('20X-LUVA-SOFT-M')).toEqual([100, 20]);
    expect(embalagensDe('2CX-LUVA-VINIL-M')).toEqual([100]);
    expect(embalagensDe('1X-LEN-ECO-70X50')).toEqual([1]);
  });

  it('a chave de touca é TOU, não TOU-DESC', () => {
    expect(embalagensDe('100X-TOU-TNT-BRA')).toEqual([100]);
    expect(pecasDe('100X-TOU-TNT-BRA', 1)).toBe(1);
  });

  it('escolherEmbalagem: a maior que couber inteira, senão a menor', () => {
    expect(escolherEmbalagem(100, [100, 20])).toBe(100);
    expect(escolherEmbalagem(40, [100, 20])).toBe(20);
    expect(escolherEmbalagem(50, [100])).toBe(100);
    expect(escolherEmbalagem(7, [])).toBe(1);
  });

  it('GAZE-ESTÉRIL (com acento) também não agrupa', () => {
    expect(grupoEstoque('1X-GAZE-ESTÉRIL')).toBe('GAZE-ESTÉRIL');
  });

  it('o banco soma por cima do padrão e nunca remove', () => {
    const f = mesclarFamilias(FAMILIAS_PADRAO, [
      { familia: 'seringa', tamanho_embalagem: 50 },
      { familia: 'TOU', tamanho_embalagem: 200 },
      { familia: 'LIXO', tamanho_embalagem: 0 },
      { familia: null, tamanho_embalagem: 10 },
    ]);
    expect(f['SERINGA']).toEqual([50]);
    expect(f['TOU']).toEqual([200]);
    expect(f['LIXO']).toBeUndefined();
    expect(f['ATADURA']).toEqual([12]);
    expect(FAMILIAS_PADRAO['TOU']).toEqual([100]);
  });
});
