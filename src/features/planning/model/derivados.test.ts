import { describe, expect, it } from 'vitest';
import type { PecaComparada, ProdutoComparado } from './comparar';
import { ORDEM_PECAS_PADRAO } from './constantes';
import { chavesDoPlanejamento, deslocarMes, diferencaDias, intervaloDoMes, rotuloMes, ddmm } from './datas';
import {
  alternarOrdemPecas,
  amplitudeFaixas,
  filtrarPorBusca,
  mediasPorDiaSemana,
  mediasPorFaixaDoMes,
  ordenarPecas,
  picoDiaSemana,
  produtosEmAlta,
  produtosEmQueda,
  semanasComMedia,
  serieDiaria,
} from './derivados';

const peca = (sku: string, difDia: number, variacao: number | null, extra: Partial<PecaComparada> = {}): PecaComparada => ({
  sku, pecasA: 0, pecasB: 0, diaA: 0, diaB: 0, difDia, variacao, pedidosB: 0, unidB: 0, nVariantes: 1,
  detalhe: '', variantes: [], embalagens: [], temCaixa: false, detalheDoMesB: true, ...extra,
});

const prod = (produto: string, variacao: number | null, difDia: number, q1 = 10, q2 = 10): ProdutoComparado => ({
  produto, pedidosA: 0, pedidosB: 0, diaA: 0, diaB: 0, variacao, difDia, pctVia: 0, acompA: 0, acompB: 0,
  soloA: 0, soloB: 0, varSolo: null, combinado: false, atencaoComb: false, q1, q2,
});

describe('ordenação da tabela de peças', () => {
  const lista = [peca('B', 5, 10), peca('A', -40, -50), peca('C', 1, null), peca('D', -2, 3)];

  it('movimento: |diferença| decrescente, quedas incluídas', () => {
    expect(ordenarPecas(lista, ORDEM_PECAS_PADRAO).map((p) => p.sku)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('variação nula vai para o fim nos dois sentidos', () => {
    expect(ordenarPecas(lista, { campo: 'variacao', desc: true }).map((p) => p.sku).at(-1)).toBe('C');
    expect(ordenarPecas(lista, { campo: 'variacao', desc: false }).map((p) => p.sku).at(-1)).toBe('C');
  });

  it('nome A a Z e não muda a lista original', () => {
    expect(ordenarPecas(lista, { campo: 'sku', desc: false }).map((p) => p.sku)).toEqual(['A', 'B', 'C', 'D']);
    expect(lista.map((p) => p.sku)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('clicar no cabeçalho: ativo inverte, novo começa decrescente (Produto A a Z)', () => {
    expect(alternarOrdemPecas({ campo: 'movimento', desc: true }, 'movimento')).toEqual({ campo: 'movimento', desc: false });
    expect(alternarOrdemPecas({ campo: 'movimento', desc: true }, 'diaB')).toEqual({ campo: 'diaB', desc: true });
    expect(alternarOrdemPecas({ campo: 'movimento', desc: true }, 'sku')).toEqual({ campo: 'sku', desc: false });
  });

  it('busca preserva a posição do ranking completo', () => {
    const r = filtrarPorBusca(lista, ' c ', (p) => p.sku);
    expect(r).toEqual([{ item: lista[2], pos: 3 }]);
  });
});

describe('alta e queda', () => {
  const ps = [prod('SOBE', 50, 5, 10, 20), prod('MORNO', 8, 3), prod('DESCE', -30, -4), prod('NOVO', null, 9), prod('PERDE', 40, 2, 20, 10)];
  it('alta: >10% e difDia>0, ordenada por difDia, com sinal de quinzena', () => {
    const a = produtosEmAlta(ps);
    expect(a.map((p) => [p.produto, p.mantem])).toEqual([['SOBE', true], ['PERDE', false]]);
  });
  it('queda: <-10% e difDia<0', () => {
    expect(produtosEmQueda(ps).map((p) => p.produto)).toEqual(['DESCE']);
  });
});

describe('médias dos gráficos', () => {
  const uteis = [
    { dia: '2026-10-01', pedidos: 100, diaSemana: 4 },
    { dia: '2026-10-05', pedidos: 200, diaSemana: 1 },
    { dia: '2026-10-12', pedidos: 300, diaSemana: 1 },
    { dia: '2026-10-30', pedidos: 50, diaSemana: 5 },
  ];
  it('por dia da semana', () => expect(mediasPorDiaSemana(uteis)).toEqual([250, 0, 0, 100, 50]));
  it('por faixa do mês é média, não total', () => expect(mediasPorFaixaDoMes(uteis)).toEqual([150, 300, 0, 0, 50]));
  it('pico e amplitude', () => {
    expect(picoDiaSemana([250, 0, 0, 100, 50]).indice).toBe(0);
    expect(amplitudeFaixas([150, 300, 0, 0, 50])).toBe(500);
    expect(amplitudeFaixas([0, 0, 10])).toBeNull();
  });
  it('série diária tem 31 posições e null onde o mês não tem o dia', () => {
    const s = serieDiaria({ dias: { '2026-02-03': 7 }, prod: {}, pares: {}, totalPedidos: 7, pedidosMulti: 0 }, '2026-02');
    expect(s).toHaveLength(31);
    expect(s[2]).toBe(7);
    expect(s[27]).toBe(0);
    expect(s[28]).toBeNull();
  });
});

describe('semanas', () => {
  it('barra pela média por dia útil e marca a de maior total', () => {
    const r = semanasComMedia([
      { inicio: '2026-10-05', demanda: 4000, dias: 5, realizado: 0, estoura: 0 },
      { inicio: '2026-10-12', demanda: 3600, dias: 3, realizado: 0, estoura: 1 },
    ]);
    expect(r.map((s) => s.maisCheia)).toEqual([true, false]);
    expect(r[1]?.largura).toBe(100);
    expect(r[0]?.largura).toBeCloseTo((800 / 1200) * 100);
  });
});

describe('datas', () => {
  it('janela do planejamento anda com o calendário, inclusive na virada de ano', () => {
    expect(chavesDoPlanejamento('2026-11-05')).toEqual({ chaveAtual: '2026-11', chaveB: '2026-10', chaveA: '2026-09' });
    expect(chavesDoPlanejamento('2027-01-03')).toEqual({ chaveAtual: '2027-01', chaveB: '2026-12', chaveA: '2026-11' });
    expect(chavesDoPlanejamento('2027-02-10')).toEqual({ chaveAtual: '2027-02', chaveB: '2027-01', chaveA: '2026-12' });
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
  });
  it('intervalo do mês em São Paulo (UTC-3)', () => {
    const { inicio, fim } = intervaloDoMes('2026-10');
    expect(inicio.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
  it('rótulos e diferença de dias', () => {
    expect(rotuloMes('2026-03')).toBe('março/2026');
    expect(ddmm('2026-10-12')).toBe('12/10');
    expect(diferencaDias('2026-09-09', '2026-09-14')).toBe(5);
  });
});
