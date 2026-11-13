import { describe, expect, it, vi } from 'vitest';
import type { ScanEvent } from '@/data/types';
import { agregar } from '../model/agregar';
import { gerarMes } from '../model/testes/fixture';
import { memoria } from '../model/testes/storage';
import type { PedidoLinha } from '../model/types';
import { lerCache, prefixoDoCache } from './cache';
import { carregarMes, carregarPlanejamento, type DependenciasCarga } from './carregar';
import { linhasDoDia } from './linhas';
import { leitorDaFonte } from './leitores';

const scan = (i: number, at: string, items: { sku: string; quantity: number }[] | null): ScanEvent => ({
  id: String(i),
  operatorId: 'op',
  at,
  orderCount: 1,
  station: null,
  trackingCode: null,
  orderNumber: null,
  items,
});

describe('montagem das linhas a partir dos eventos', () => {
  it('uma bipagem vira uma linha com itens no formato do banco', () => {
    const linhas = linhasDoDia({
      scans: [
        scan(1, '2026-10-05T15:00:00Z', [{ sku: '3X-LEN-ECO-70X50', quantity: 2 }]),
        scan(2, '2026-10-05T15:01:00Z', null),
      ],
    });
    expect(linhas).toEqual([
      { data_hora: '2026-10-05T15:00:00Z', itens: [{ sku: '3X-LEN-ECO-70X50', quantidade: 2 }] },
      { data_hora: '2026-10-05T15:01:00Z', itens: null },
    ]);
  });

  it('as combinações saem dos eventos crus (pares de exatamente 2 SKUs)', async () => {
    const par = (i: number) =>
      scan(i, '2026-10-05T15:00:00Z', [
        { sku: '3L-PERFU-FLEX', quantity: 1 },
        { sku: '5X-LEN-COM-TNT', quantity: 1 },
      ]);
    const eventos = { day: '2026-10-05', scans: Array.from({ length: 40 }, (_, i) => par(i)), access: [] };
    const leitor = leitorDaFonte({ getDayEvents: async (d) => (d === '2026-10-05' ? eventos : { day: d, scans: [], access: [] }), now: () => new Date('2026-10-05T18:00:00Z') });
    const linhas = await leitor('2026-10');
    expect(linhas).toHaveLength(40);
    expect(agregar(linhas).pares).toEqual({ '3L-PERFU-FLEX||5X-LEN-COM-TNT': 40 });
  });

  it('o leitor da fonte só pede dias até hoje e informa o progresso', async () => {
    const pedidos: string[] = [];
    const progresso: number[] = [];
    const leitor = leitorDaFonte({
      getDayEvents: async (d) => {
        pedidos.push(d);
        return { day: d, scans: [scan(1, `${d}T15:00:00Z`, null)], access: [] };
      },
      now: () => new Date('2026-11-05T15:00:00Z'),
    });
    const linhas = await leitor('2026-11', (p) => progresso.push(p.linhas));
    expect([...pedidos].sort()).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(linhas).toHaveLength(5);
    expect(progresso.at(-1)).toBe(5);
  });
});

describe('carga com cache', () => {
  const base = (ler: DependenciasCarga['ler'], storage: Storage | null, agora = 0): DependenciasCarga => ({
    hoje: '2026-11-05',
    ler,
    familias: async () => [],
    storage,
    prefixoCache: prefixoDoCache('demo'),
    agora: () => agora,
  });

  it('mês fechado em cache não é lido de novo; corrente vencido é', async () => {
    const s = memoria();
    const ler = vi.fn(async (): Promise<PedidoLinha[]> => gerarMes('2026-09', { semente: 1, base: 5 }));
    await carregarMes('2026-09', true, base(ler, s));
    await carregarMes('2026-09', true, base(ler, s, 10 * 86_400_000));
    expect(ler).toHaveBeenCalledTimes(1);

    await carregarMes('2026-11', false, base(ler, s, 0));
    await carregarMes('2026-11', false, base(ler, s, 5 * 60_000));
    expect(ler).toHaveBeenCalledTimes(2);
    await carregarMes('2026-11', false, base(ler, s, 11 * 60_000));
    expect(ler).toHaveBeenCalledTimes(3);
    expect(lerCache(s, prefixoDoCache('demo'), '2026-09', 99 * 86_400_000)).not.toBeNull();
  });

  it('planejamento completo; mês sem dado e primeiro dia do mês não quebram', async () => {
    const dados: Record<string, PedidoLinha[]> = {
      '2026-09': gerarMes('2026-09', { semente: 31, base: 40 }),
      '2026-10': gerarMes('2026-10', { semente: 32, base: 40, feriadosTrabalhados: ['2026-10-12'] }),
    };
    const ler = async (chave: string) => dados[chave] ?? [];
    const r = await carregarPlanejamento({ ...base(ler, null), hoje: '2026-11-01' });
    expect(r.comparativo.somaB).toBeGreaterThan(0);
    expect(r.projecao?.linhas.length).toBeGreaterThan(10);
    expect(r.projecao?.historicoFeriados.find((h) => h.data === '2026-10-12')?.trabalhado).toBe(true);

    const vazio = await carregarPlanejamento(base(async () => [], null));
    expect(vazio.projecao).toBeNull();
    expect(vazio.comparativo.somaA).toBe(0);
  });

  it('falha ao ler famílias não derruba: vale o padrão', async () => {
    const r = await carregarPlanejamento({
      ...base(async () => [], null),
      familias: async () => {
        throw new Error('x');
      },
    });
    expect(r.ctx.familias?.['TOU']).toEqual([100]);
  });
});
