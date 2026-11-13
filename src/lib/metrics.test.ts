import { describe, expect, it } from 'vitest';
import type { AccessEvent, DailyOperatorAggregate, Operator, ScanEvent } from '@/data/types';
import { atTime } from './time';
import {
  absoluteChange,
  activeCount,
  aggregateDay,
  aggregateSkusOfDay,
  buildActivity,
  computeOperatorDay,
  dayBucketValues,
  DEFAULT_INDIVIDUAL_GOAL,
  effectiveGoal,
  goalTone,
  hourlyBuckets,
  isMixedScan,
  mixedShare,
  percentChange,
  periodOperatorStats,
  rankProductsFromScans,
  teamRate,
} from './metrics';

const DAY = '2026-11-04';
const at = (h: number, m = 0, s = 0) => new Date(atTime(DAY, h, m).getTime() + s * 1000);
const iso = (h: number, m = 0, s = 0) => at(h, m, s).toISOString();

const op = (id: string, over: Partial<Operator> = {}): Operator => ({
  id,
  name: `Operador ${id}`,
  individualGoal: 35,
  registration: 'ativo',
  ...over,
});

let seq = 0;
const scan = (operatorId: string, h: number, m = 0, over: Partial<ScanEvent> = {}): ScanEvent => ({
  id: `s${++seq}`,
  operatorId,
  at: iso(h, m),
  orderCount: 1,
  station: '01',
  trackingCode: `BR${seq}`,
  orderNumber: `${seq}`,
  items: [{ sku: 'A', quantity: 1 }],
  ...over,
});
const login = (operatorId: string, h: number, m = 0, station = '01'): AccessEvent => ({
  id: `l${++seq}`,
  at: iso(h, m),
  station,
  previousOperatorId: null,
  nextOperatorId: operatorId,
  reason: null,
});
const logout = (operatorId: string, h: number, m = 0, station = '01'): AccessEvent => ({
  id: `l${++seq}`,
  at: iso(h, m),
  station,
  previousOperatorId: operatorId,
  nextOperatorId: null,
  reason: null,
});

describe('computeOperatorDay (paridade com calculateAndRender)', () => {
  it('o início é o login quando ele vem antes do primeiro bipe', () => {
    const o = op('1');
    const s = computeOperatorDay(o, { scans: [scan('1', 8, 0), scan('1', 9, 50)], access: [login('1', 7, 40)] }, at(10, 0));
    expect(s.startAt).toBe(iso(7, 40));
    expect(s.status).toBe('ativo');
    expect(s.hours).toBeCloseTo(140 / 60, 5);
    expect(s.rate).toBeCloseTo(2 / (140 / 60), 5);
  });

  it('sem login, o início é o primeiro bipe', () => {
    const s = computeOperatorDay(op('1'), { scans: [scan('1', 8, 0), scan('1', 9, 0)], access: [] }, at(9, 30));
    expect(s.startAt).toBe(iso(8, 0));
    expect(s.hours).toBeCloseTo(1.5, 5);
  });

  it('login depois do primeiro bipe não adianta o início', () => {
    const s = computeOperatorDay(op('1'), { scans: [scan('1', 8, 0)], access: [login('1', 9, 0)] }, at(9, 10));
    expect(s.startAt).toBe(iso(8, 0));
  });

  it('logout zera a bancada: fica ausente mesmo dentro de 60 min e congela o fim no logout', () => {
    const events = {
      scans: [scan('1', 8, 0), scan('1', 9, 0)],
      access: [login('1', 7, 50), logout('1', 9, 10)],
    };
    const s = computeOperatorDay(op('1'), events, at(9, 20));
    expect(s.status).toBe('ausente');
    expect(s.awayReason).toBe('saiu-da-bancada');
    expect(s.station).toBeNull();
    expect(s.lastActivityAt).toBe(iso(9, 10));
    expect(s.endAt).toBe(iso(9, 10));
    expect(s.hours).toBeCloseTo(80 / 60, 5);
  });

  it('login posterior ao último bipe fixa a bancada do login', () => {
    const events = { scans: [scan('1', 8, 0, { station: '02' })], access: [login('1', 9, 0, '05')] };
    const s = computeOperatorDay(op('1'), events, at(9, 10));
    expect(s.station).toBe('05');
    expect(s.status).toBe('ativo');
  });

  it('troca por outro operador também zera a bancada de quem saiu', () => {
    const swap: AccessEvent = { ...logout('1', 9, 30), nextOperatorId: '2' };
    const s = computeOperatorDay(op('1'), { scans: [scan('1', 9, 0)], access: [swap] }, at(9, 40));
    expect(s.status).toBe('ausente');
    expect(s.awayReason).toBe('saiu-da-bancada');
    const other = computeOperatorDay(op('2'), { scans: [], access: [swap] }, at(9, 40));
    expect(other.status).toBe('ativo');
    expect(other.station).toBe('01');
  });

  it('60 min sem atividade ainda é ativo; depois disso é ausente e o fim congela na última atividade', () => {
    const events = { scans: [scan('1', 8, 0), scan('1', 9, 0)], access: [] };
    expect(computeOperatorDay(op('1'), events, at(10, 0)).status).toBe('ativo');
    const s = computeOperatorDay(op('1'), events, at(10, 1));
    expect(s.status).toBe('ausente');
    expect(s.awayReason).toBe('sem-atividade');
    expect(s.endAt).toBe(iso(9, 0));
    expect(s.hours).toBeCloseTo(1, 5);
    expect(computeOperatorDay(op('1'), events, at(15, 0)).hours).toBeCloseTo(1, 5);
  });

  it('cadastro inativo é "inativo" e congela o fim', () => {
    const events = { scans: [scan('1', 8, 0), scan('1', 9, 0)], access: [] };
    const s = computeOperatorDay(op('1', { registration: 'inativo' }), events, at(9, 10));
    expect(s.status).toBe('inativo');
    expect(s.awayReason).toBeNull();
    expect(s.endAt).toBe(iso(9, 0));
  });

  it('piso de 0,2 h evita ritmo infinito', () => {
    const events = { scans: Array.from({ length: 10 }, (_, i) => scan('1', 9, i % 3)), access: [] };
    const s = computeOperatorDay(op('1'), events, at(9, 3));
    expect(s.hours).toBeCloseTo(0.2, 5);
    expect(s.rate).toBeCloseTo(50, 5);
  });

  it('sem pedido: sem ritmo e sem horas', () => {
    const s = computeOperatorDay(op('1'), { scans: [], access: [] }, at(10, 0));
    expect(s.rate).toBeNull();
    expect(s.hours).toBe(0);
    expect(s.status).toBe('ausente');
    expect(s.awayReason).toBe('sem-registro');
  });

  it('soma quantidade_pedidos, e ignora eventos depois do corte e de outros operadores', () => {
    const events = {
      scans: [scan('1', 8, 0, { orderCount: 2 }), scan('1', 8, 30), scan('1', 11, 0), scan('2', 8, 10)],
      access: [],
    };
    const s = computeOperatorDay(op('1'), events, at(9, 0));
    expect(s.orders).toBe(3);
    expect(s.simpleOrders).toBe(2);
  });

  it('conta simples e mistos por bipagem', () => {
    const events = {
      scans: [
        scan('1', 8, 0),
        scan('1', 8, 1, { items: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 1 }] }),
        scan('1', 8, 2, { items: null }),
      ],
      access: [],
    };
    const s = computeOperatorDay(op('1'), events, at(8, 30));
    expect(s.mixedOrders).toBe(1);
    expect(s.simpleOrders).toBe(2);
  });
});

describe('isMixedScan', () => {
  const withItems = (items: ScanEvent['items']) => scan('1', 8, 0, { items });
  it('2+ SKUs distintos é misto', () => {
    expect(isMixedScan(withItems([{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 1 }]))).toBe(true);
  });
  it('SKU repetido não é misto', () => {
    expect(isMixedScan(withItems([{ sku: 'A', quantity: 1 }, { sku: 'A', quantity: 2 }]))).toBe(false);
  });
  it('itens null é simples', () => {
    expect(isMixedScan(withItems(null))).toBe(false);
  });
  it('SKU vazio não conta', () => {
    expect(isMixedScan(withItems([{ sku: 'A', quantity: 1 }, { sku: '', quantity: 1 }]))).toBe(false);
  });
});

describe('equipe, ativos e mistos', () => {
  it('equipe é média simples dos ritmos, só de quem tem pedido', () => {
    const states = [
      { orders: 10, rate: 20 },
      { orders: 100, rate: 40 },
      { orders: 0, rate: null },
    ];
    expect(teamRate(states)).toBe(30);
    expect(teamRate([])).toBeNull();
    expect(teamRate([{ orders: 0, rate: null }])).toBeNull();
  });

  it('activeCount e mixedShare', () => {
    expect(activeCount([{ status: 'ativo' }, { status: 'ausente' }, { status: 'ativo' }, { status: 'inativo' }])).toBe(2);
    expect(mixedShare(83, 17)).toBeCloseTo(17, 5);
    expect(mixedShare(0, 0)).toBeNull();
  });
});

describe('meta', () => {
  it('a global sobrepõe a individual sem apagá-la', () => {
    const o = op('1', { individualGoal: 38 });
    expect(effectiveGoal(o, 40)).toEqual({ value: 40, source: 'global' });
    expect(effectiveGoal(o, null)).toEqual({ value: 38, source: 'individual' });
    expect(o.individualGoal).toBe(38);
  });
  it('individual zerada cai no padrão 35', () => {
    expect(effectiveGoal(op('1', { individualGoal: 0 }), null).value).toBe(DEFAULT_INDIVIDUAL_GOAL);
  });
  it('tom: nunca vermelho; até 15% abaixo sem cor', () => {
    expect(goalTone(1)).toBe('ok');
    expect(goalTone(0.85)).toBe('neutral');
    expect(goalTone(0.84)).toBe('warn');
    expect(goalTone(0.1)).toBe('warn');
    expect(goalTone(null)).toBe('none');
    expect(goalTone(Number.NaN)).toBe('none');
  });
});

describe('dia fechado e período', () => {
  const ops = [op('1'), op('2', { registration: 'inativo' }), op('3')];

  it('aggregateDay usa os acessos do próprio dia, ignora cadastro e só lista quem teve pedido', () => {
    const events = {
      scans: [scan('1', 8, 0), scan('1', 12, 0), scan('2', 9, 0)],
      access: [login('1', 7, 40), logout('1', 17, 40)],
    };
    const agg = aggregateDay(DAY, ops, events);
    expect(agg.map((a) => a.operatorId)).toEqual(['1', '2']);
    const a1 = agg[0]!;
    expect(a1.day).toBe(DAY);
    expect(a1.startAt).toBe(iso(7, 40));
    expect(a1.lastActivityAt).toBe(iso(17, 40));
    expect(a1.hours).toBeCloseTo(10, 5);
    expect(a1.orders).toBe(2);
  });

  it('periodOperatorStats: ritmo é total/total das horas, não média dos dias', () => {
    const mk = (day: string, orders: number, hours: number): DailyOperatorAggregate => ({
      day,
      operatorId: '1',
      orders,
      simpleOrders: orders,
      mixedOrders: 0,
      hours,
      startAt: null,
      lastActivityAt: null,
    });
    const st = periodOperatorStats('1', [mk('2026-11-02', 100, 2), mk('2026-11-03', 100, 10), mk('2026-11-03', 0, 0)]);
    expect(st.orders).toBe(200);
    expect(st.hours).toBe(12);
    expect(st.rate).toBeCloseTo(200 / 12, 5);
    expect(st.daysWorked).toBe(2);
    expect(periodOperatorStats('9', []).rate).toBeNull();
  });

  it('dayBucketValues: ritmo do dia é média simples', () => {
    const base = { day: DAY, simpleOrders: 0, mixedOrders: 0, startAt: null, lastActivityAt: null };
    const v = dayBucketValues([
      { ...base, operatorId: '1', orders: 100, hours: 5, simpleOrders: 90, mixedOrders: 10 },
      { ...base, operatorId: '2', orders: 50, hours: 5, simpleOrders: 50 },
    ]);
    expect(v.orders).toBe(150);
    expect(v.rate).toBeCloseTo(15, 5);
    expect(v.active).toBe(2);
    expect(v.mixed).toBeCloseTo((10 / 150) * 100, 5);
  });
});

describe('hourlyBuckets', () => {
  const o = op('1');
  const events = {
    scans: [scan('1', 8, 10), scan('1', 8, 40), scan('1', 10, 5), scan('1', 10, 20), scan('1', 10, 50)],
    access: [login('1', 8, 0)],
  };

  it('hora parcial, futura e sem bipe', () => {
    const b = hourlyBuckets(DAY, [o], events, at(10, 30));
    const byHour = new Map(b.map((x) => [x.hour, x]));
    expect(b).toHaveLength(13);
    expect(byHour.get(7)).toMatchObject({ orders: 0, future: false, partial: false, rate: null });
    expect(byHour.get(8)).toMatchObject({ orders: 2, partial: false });
    expect(byHour.get(10)).toMatchObject({ orders: 2, partial: true, future: false });
    expect(byHour.get(11)).toMatchObject({ orders: null, future: true, rate: null });
    expect(byHour.get(19)?.future).toBe(true);
  });

  it('ritmo da hora = pedidos na hora / fração trabalhada', () => {
    const h8 = hourlyBuckets(DAY, [o], events, at(10, 30)).find((x) => x.hour === 8)!;
    expect(h8.rate).toBeCloseTo(2, 5);
    expect(h8.active).toBe(1);
  });

  it('mistos por hora', () => {
    const ev = {
      scans: [scan('1', 9, 5), scan('1', 9, 10, { items: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 1 }] })],
      access: [],
    };
    const h9 = hourlyBuckets(DAY, [o], ev, at(12, 0)).find((x) => x.hour === 9)!;
    expect(h9.mixed).toBeCloseTo(50, 5);
  });
});

describe('produtos e variações', () => {
  it('ranqueia por pedidos, não por unidades', () => {
    const scans = [
      scan('1', 8, 0, { items: [{ sku: 'TOUCA', quantity: 1100 }] }),
      scan('1', 8, 1, { items: [{ sku: 'LENCOL', quantity: 1 }] }),
      scan('1', 8, 2, { items: [{ sku: 'LENCOL', quantity: 1 }] }),
      scan('1', 8, 3, { items: [{ sku: 'LENCOL', quantity: 2 }, { sku: 'LENCOL', quantity: 1 }] }),
    ];
    const r = rankProductsFromScans(scans);
    expect(r[0]).toMatchObject({ sku: 'LENCOL', orders: 3, units: 5 });
    expect(r[1]).toMatchObject({ sku: 'TOUCA', orders: 1, units: 1100 });
  });

  it('mixedOrders conta só pedidos em que o SKU dividiu a caixa', () => {
    const scans = [
      scan('1', 8, 0, { items: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 1 }] }),
      scan('1', 8, 1, { items: [{ sku: 'A', quantity: 1 }] }),
    ];
    const a = rankProductsFromScans(scans).find((p) => p.sku === 'A')!;
    expect(a).toMatchObject({ orders: 2, mixedOrders: 1 });
  });

  it('aggregateSkusOfDay carrega o dia', () => {
    const r = aggregateSkusOfDay(DAY, [scan('1', 8, 0)]);
    expect(r).toEqual([{ day: DAY, sku: 'A', orders: 1, units: 1, mixedOrders: 0 }]);
  });

  it('percentChange e absoluteChange', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10, 5);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(null, 3)).toBeNull();
    expect(absoluteChange(5, 3)).toBe(2);
    expect(absoluteChange(5, null)).toBeNull();
  });
});

describe('buildActivity', () => {
  it('mistura bipes e acessos, recente primeiro, com o tipo certo', () => {
    const ops = [op('1', { name: 'Ana' }), op('2', { name: 'Bia' })];
    const swap: AccessEvent = { ...login('2', 9, 0), previousOperatorId: '1' };
    const items = buildActivity({ scans: [scan('1', 8, 30)], access: [login('1', 8, 0), swap, logout('2', 10, 0)] }, ops);
    expect(items.map((i) => i.kind)).toEqual(['saida', 'troca', 'bipe', 'entrada']);
    expect(items[1]).toMatchObject({ operatorName: 'Bia', previousOperatorName: 'Ana' });
    expect(buildActivity({ scans: [scan('9', 8, 0)], access: [] }, ops)[0]?.operatorName).toBe('ID 9');
    expect(buildActivity({ scans: [scan('1', 8, 0), scan('1', 8, 1)], access: [] }, ops, 1)).toHaveLength(1);
  });
});
