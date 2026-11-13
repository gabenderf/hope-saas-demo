import { describe, expect, it } from 'vitest';
import { compareIds, normalizeInstant, normalizeStation, parseItems, toConfig, toOperator, toPanelUser, toScan } from './rows';

describe('normalizeStation (formatos vistos no banco real)', () => {
  it.each([
    ['Bancada 04', '04'],
    ['Bancada 1', '01'],
    ['bancada03', '03'],
    ['04', '04'],
    ['4', '04'],
    ['  Bancada 12 ', '12'],
    ['Liderança 1', 'Liderança 1'],
    ['Admin', 'Admin'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeStation(raw)).toBe(expected);
  });

  it('vazio ou nulo vira null', () => {
    expect(normalizeStation(null)).toBeNull();
    expect(normalizeStation('   ')).toBeNull();
  });
});

describe('normalizeInstant', () => {
  it('microssegundos e +00:00 do PostgREST viram ISO UTC com milissegundos', () => {
    expect(normalizeInstant('2026-11-05T17:59:26.013851+00:00')).toBe('2026-11-05T17:59:26.013Z');
    expect(normalizeInstant('2026-11-05 17:59:26+00')).toBe('2026-11-05T17:59:26.000Z');
  });
  it('lixo vira null', () => {
    expect(normalizeInstant('ontem')).toBeNull();
    expect(normalizeInstant(null)).toBeNull();
  });
});

describe('parseItems', () => {
  it('aceita jsonb (array) e texto JSON; quantidade numérica', () => {
    expect(parseItems([{ sku: 'A', quantidade: 2 }])).toEqual([{ sku: 'A', quantity: 2 }]);
    expect(parseItems('[{"sku":"B","quantidade":"3"}]')).toEqual([{ sku: 'B', quantity: 3 }]);
  });
  it('quantidade ausente ou inválida conta 1; item sem SKU sai', () => {
    expect(parseItems([{ sku: 'A' }, { sku: 'B', quantidade: 'x' }, { quantidade: 2 }, null])).toEqual([
      { sku: 'A', quantity: 1 },
      { sku: 'B', quantity: 1 },
    ]);
  });
  it('linha antiga sem itens ou formato estranho = null (conta como simples)', () => {
    expect(parseItems(null)).toBeNull();
    expect(parseItems('não é json')).toBeNull();
    expect(parseItems({ sku: 'A' })).toBeNull();
  });
});

describe('toScan', () => {
  it('converte a linha real', () => {
    expect(
      toScan({
        id_registro: 81022,
        id_operador: 'op-x',
        data_hora: '2026-11-05T17:59:26.013851+00:00',
        quantidade_pedidos: 1,
        bancada: 'Bancada 04',
        codigo_rastreio: 'BR123',
        itens: [{ sku: 'SKU-1', quantidade: 1 }],
        num_pedido: null,
      }),
    ).toEqual({
      id: '81022',
      operatorId: 'op-x',
      at: '2026-11-05T17:59:26.013Z',
      orderCount: 1,
      station: '04',
      trackingCode: 'BR123',
      orderNumber: null,
      items: [{ sku: 'SKU-1', quantity: 1 }],
    });
  });
  it('quantidade_pedidos nula usa o padrão do banco (1); linha sem id ou horário é descartada', () => {
    expect(toScan({ id_registro: 1, id_operador: 'a', data_hora: '2026-11-05T10:00:00Z', quantidade_pedidos: null })?.orderCount).toBe(1);
    expect(toScan({ id_operador: 'a', data_hora: '2026-11-05T10:00:00Z' })).toBeNull();
    expect(toScan({ id_registro: 1, id_operador: 'a', data_hora: null })).toBeNull();
  });
});

describe('cadastro e configuração', () => {
  it('meta nula ou zero vira 35; status inativo é respeitado', () => {
    expect(toOperator({ id_operador: 'a', nome_colaborador: 'A', meta_horaria: null, status: 'ativo' })).toMatchObject({ individualGoal: 35 });
    expect(toOperator({ id_operador: 'a', nome_colaborador: 'A', meta_horaria: 0, status: 'INATIVO' })).toMatchObject({
      individualGoal: 35,
      registration: 'inativo',
    });
  });
  it('meta global nula ou não positiva = sem meta global', () => {
    expect(toConfig({ meta_horaria_global: 35, atualizado_em: '2026-08-13T21:32:39.147+00:00' })).toEqual({
      globalGoal: 35,
      updatedAt: '2026-08-13T21:32:39.147Z',
    });
    expect(toConfig({ meta_horaria_global: null }).globalGoal).toBeNull();
    expect(toConfig({ meta_horaria_global: 0 }).globalGoal).toBeNull();
    expect(toConfig(undefined)).toEqual({ globalGoal: null, updatedAt: null });
  });
  it('usuário do painel: role admin = admin, user = leitura', () => {
    expect(toPanelUser({ username: 'x', role: 'admin' })?.role).toBe('admin');
    expect(toPanelUser({ username: 'y', role: 'user' })?.role).toBe('leitura');
  });
});

it('compareIds ordena id numérico como número', () => {
  expect(['10', '9', '100'].sort(compareIds)).toEqual(['9', '10', '100']);
});
