import { describe, expect, it } from 'vitest';
import { aggregateToday, averageEffectiveGoal, computeOperatorDay, dayRate, teamRate } from '@/lib/metrics';
import { atTime, isWeekend } from '@/lib/time';
import { createDemoSource } from '../demo';
import type { OperationsSource } from '../types';
import { buildActivityFeed, buildCustomPeriod, buildOperatorDetail, buildOverview } from './index';

const NOW = atTime('2026-11-05', 14, 20);
const make = (now: Date = NOW): Promise<OperationsSource> => createDemoSource({ now: () => now, storage: null, live: false });

describe('Visão Geral de hoje', () => {
  it('KPIs batem com as fórmulas de metrics sobre os eventos de hoje', async () => {
    const s = await make();
    const m = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    const ops = await s.listOperators();
    const ev = await s.getDayEvents('2026-11-05');
    const states = ops.map((o) => computeOperatorDay(o, ev, NOW));
    expect(m.kpis.pedidos.value).toBe(states.reduce((n, x) => n + x.orders, 0));
    expect(m.kpis.ritmo.value).toBeCloseTo(teamRate(states)!, 8);
    expect(m.kpis.ativos.value).toBe(states.filter((x) => x.status === 'ativo').length);
    expect(m.label).toBe('Hoje');
    expect(m.sublabel).toBe('05/11, até 14:20');
    expect(m.days).toEqual(['2026-11-05']);
  });

  it('regra do leaderboard: só quem tem pedido ou está ativo, ordenado por pedidos', async () => {
    const m = await buildOverview(await make(), { range: 'hoje', compare: 'dia-util-anterior' });
    expect(m.operators.length).toBeGreaterThan(0);
    for (const r of m.operators) expect(r.orders > 0 || r.status === 'ativo').toBe(true);
    expect(m.operators.map((r) => r.orders)).toEqual([...m.operators.map((r) => r.orders)].sort((a, b) => b - a));
    expect(m.operators.every((r) => r.goalSource === 'global' && r.effectiveGoal === 38)).toBe(true);
    expect(m.globalGoal).toBe(38);
  });

  it('gráfico por hora: 13 baldes, futuro vazio, hora parcial marcada', async () => {
    const m = await buildOverview(await make(), { range: 'hoje', compare: 'dia-util-anterior' });
    expect(m.buckets).toHaveLength(13);
    const h14 = m.buckets.find((b) => b.key === '14h')!;
    const h15 = m.buckets.find((b) => b.key === '15h')!;
    expect(h14.partial).toBe(true);
    expect(h15.future).toBe(true);
    expect(h15.values.pedidos).toBeNull();
    // a série de comparação traz o dia inteiro, inclusive a tarde que ainda vem
    expect(h15.compare.pedidos).toBeGreaterThan(0);
    expect(m.buckets.reduce((n, b) => n + (b.values.pedidos ?? 0), 0)).toBe(m.kpis.pedidos.value);
  });

  it('dia útil anterior é 04/11; KPIs da comparação cortam no mesmo horário', async () => {
    const s = await make();
    const m = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    expect(m.compareDays).toEqual(['2026-11-04']);
    const prev = await s.getDayEvents('2026-11-04');
    const cut = prev.scans.filter((x) => Date.parse(x.at) <= atTime('2026-11-04', 14, 20).getTime());
    expect(m.kpis.pedidos.compare).toBe(cut.reduce((n, x) => n + x.orderCount, 0));
    expect(m.kpis.pedidos.compare!).toBeLessThan(prev.scans.length);
    expect(m.compareLabel).toContain('mesmo horário');
  });

  it('segunda-feira compara com sexta (pula o fim de semana); semana passada é D-7', async () => {
    const monday = atTime('2026-11-09', 11, 0);
    const s = await make(monday);
    const m = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    expect(m.compareDays).toEqual(['2026-11-06']);
    const w = await buildOverview(s, { range: 'hoje', compare: 'semana-passada' });
    expect(w.compareDays).toEqual([]);
    // 02/11 foi feriado parado: sem dia para comparar
    expect(w.kpis.pedidos.compare).toBeNull();
    const t = await buildOverview(await make(), { range: 'hoje', compare: 'semana-passada' });
    expect(t.compareDays).toEqual(['2026-10-29']);
  });

  it('meta programada vira a do dia no começo do dia, mas a edição manual vence', async () => {
    let now = atTime('2026-11-04', 17, 0);
    const s = await createDemoSource({ now: () => now, storage: null, live: false });
    await s.setGoalSchedule('2026-11-05', 40, { id: 'u', name: 'T' });
    await expect(s.setGoalSchedule('2026-11-04', 40, { id: 'u', name: 'T' })).rejects.toThrow();
    expect((await s.getConfig()).globalGoal).toBe(38); // ainda é 04/11
    now = atTime('2026-11-05', 7, 0);
    const first = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    expect(first.globalGoal).toBe(40);
    expect((await s.listAudit({ limit: 1 }))[0]?.summary).toContain('aplicou a meta programada');
    now = atTime('2026-11-05', 10, 0);
    await s.setGlobalGoal(45, { id: 'u', name: 'T' });
    const later = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    expect(later.globalGoal).toBe(45);
    expect(later.operators.every((r) => r.effectiveGoal === 45)).toBe(true);
  });
});

describe('Visão Geral por período', () => {
  it('7d: sete dias úteis com movimento antes de hoje, comparação logo antes', async () => {
    const m = await buildOverview(await make(), { range: '7d', compare: 'periodo-anterior' });
    expect(m.days).toHaveLength(7);
    expect(m.days.every((d) => !isWeekend(d) && d < '2026-11-05')).toBe(true);
    expect(m.days).not.toContain('2026-11-02'); // feriado parado sai sozinho
    expect(m.compareDays).toHaveLength(7);
    expect(m.compareDays[6]! < m.days[0]!).toBe(true);
    expect(m.buckets).toHaveLength(7);
    expect(m.buckets[0]!.compare.pedidos).not.toBeNull();
    expect(m.kpis.pedidos.value).toBe(m.buckets.reduce((n, b) => n + (b.values.pedidos ?? 0), 0));
  });

  it('ritmo do período é a média simples dos ritmos por operador', async () => {
    const m = await buildOverview(await make(), { range: '7d', compare: 'periodo-anterior' });
    const rates = m.operators.filter((r) => r.rate != null).map((r) => r.rate as number);
    expect(m.kpis.ritmo.value).toBeCloseTo(rates.reduce((a, b) => a + b, 0) / rates.length, 8);
    expect(m.operators.every((r) => (r.daysWorked ?? 0) > 0 && r.compareOrders != null)).toBe(true);
  });

  it('30d inclui o feriado trabalhado (12/10) e exclui o parado (02/11)', async () => {
    const m = await buildOverview(await make(), { range: '30d', compare: 'periodo-anterior' });
    expect(m.days).toContain('2026-10-12');
    expect(m.days).not.toContain('2026-11-02');
    expect(m.days.length).toBeGreaterThanOrEqual(18);
    expect(m.days.length).toBeLessThanOrEqual(22);
    expect(m.compareDays).toHaveLength(m.days.length);
  });

  it('produtos ranqueados por pedidos', async () => {
    const m = await buildOverview(await make(), { range: '7d', compare: 'periodo-anterior' });
    const orders = m.products.map((p) => p.orders);
    expect(orders).toEqual([...orders].sort((a, b) => b - a));
  });
});

describe('Relatórios (intervalo livre)', () => {
  it('inclui sábado trabalhado e compara com o intervalo anterior de mesmo tamanho', async () => {
    const s = await make();
    const m = await buildCustomPeriod(s, { from: '2026-09-01', to: '2026-09-14' });
    expect(m.days).toContain('2026-09-05');
    expect(m.days).not.toContain('2026-09-07');
    expect(m.compareDays.every((d) => d >= '2026-08-18' && d <= '2026-08-31')).toBe(true);
    expect(m.kpis.pedidos.compare).toBeGreaterThan(0);
    expect(m.label).toBe('01/09 a 14/09');
  });

  it('filtra por operador', async () => {
    const s = await make();
    const all = await buildCustomPeriod(s, { from: '2026-10-19', to: '2026-10-23' });
    const one = await buildCustomPeriod(s, { from: '2026-10-19', to: '2026-10-23', operatorIds: [all.operators[0]!.id] });
    expect(one.operators).toHaveLength(1);
    expect(one.kpis.pedidos.value).toBe(all.operators[0]!.orders);
  });

  it('intervalo sem movimento devolve modelo vazio sem quebrar', async () => {
    const m = await buildCustomPeriod(await make(), { from: '2026-09-07', to: '2026-09-07' });
    expect(m.days).toEqual([]);
    expect(m.kpis.pedidos.value).toBe(0);
    expect(m.operators).toEqual([]);
  });
});

describe('detalhe do operador e atividade', () => {
  it('monta o detalhe com hoje no fim da série', async () => {
    const s = await make();
    const d = await buildOperatorDetail(s, '101');
    expect(d).not.toBeNull();
    expect(d!.operator.name).toBe('Larissa Mendonça');
    expect(d!.hourly).toHaveLength(13);
    expect(d!.recentDays).toHaveLength(11);
    expect(d!.recentDays[10]!.day).toBe('2026-11-05');
    expect(d!.recentDays[10]!.orders).toBe(d!.today.orders);
    expect(d!.last30.daysWorked).toBeGreaterThan(3);
    expect(d!.activity.every((a) => a.operatorId === '101' || a.kind === 'troca')).toBe(true);
    expect(d!.teamRateToday).not.toBeNull();
  });

  it('operador inexistente devolve null', async () => {
    expect(await buildOperatorDetail(await make(), 'nao-existe')).toBeNull();
  });

  it('feed: mais recente primeiro, respeita o limite e aceita outro dia', async () => {
    const s = await make();
    const feed = await buildActivityFeed(s, { limit: 20 });
    expect(feed).toHaveLength(20);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1]!.at >= feed[i]!.at).toBe(true);
    const past = await buildActivityFeed(s, { limit: 5, day: '2026-11-04' });
    expect(past.every((a) => a.at.startsWith('2026-11-04') || a.at.startsWith('2026-11-05'))).toBe(true);
  });
});

describe('ritmo de hoje e helpers', () => {
  it('Relatórios de hoje tem o mesmo ritmo da Visão Geral', async () => {
    const s = await make();
    const today = await buildOverview(s, { range: 'hoje', compare: 'dia-util-anterior' });
    const rep = await buildCustomPeriod(s, { from: '2026-11-05', to: '2026-11-05' });
    expect(rep.kpis.ritmo.value).toBeCloseTo(today.kpis.ritmo.value!, 8);
    expect(rep.kpis.pedidos.value).toBe(today.kpis.pedidos.value);
  });

  it('aggregateToday estende quem está ativo até agora; dayRate e meta média', async () => {
    const s = await make();
    const ops = await s.listOperators();
    const ev = await s.getDayEvents('2026-11-05');
    const agg = aggregateToday('2026-11-05', ops, ev, NOW);
    const st = ops.map((o) => computeOperatorDay(o, ev, NOW)).filter((x) => x.orders > 0);
    expect(agg).toHaveLength(st.length);
    expect(dayRate(agg[0]!)).toBeCloseTo(agg[0]!.orders / agg[0]!.hours, 8);
    expect(dayRate({ orders: 3, hours: 0 })).toBeNull();
    expect(averageEffectiveGoal(ops, 38)).toBe(38);
    expect(averageEffectiveGoal([], null)).toBe(35);
  });

  it('Relatórios filtrado por operador soma o mesmo que o total daquele operador', async () => {
    const s = await make();
    const all = await buildCustomPeriod(s, { from: '2026-10-19', to: '2026-10-30' });
    const one = all.operators[0]!;
    const only = await buildCustomPeriod(s, { from: '2026-10-19', to: '2026-10-30', operatorIds: [one.id] });
    expect(only.operators).toHaveLength(1);
    expect(only.operators[0]!.orders).toBe(one.orders);
  });
});
