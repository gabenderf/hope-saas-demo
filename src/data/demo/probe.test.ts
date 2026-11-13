import { it } from 'vitest';
import { atTime } from '@/lib/time';
import { createDemoSource } from './index';
import { teamRate, computeOperatorDay } from '@/lib/metrics';
it('probe', async () => {
  const s = await createDemoSource({ now: () => atTime('2026-11-05', 14, 20), storage: null, live: false });
  const ops = await s.listOperators();
  const agg = await s.getDailyAggregates('2026-06-12', '2026-11-05');
  const days = [...new Set(agg.map((a) => a.day))];
  const rows = days.map((d) => { const a = agg.filter((x) => x.day === d); const o = a.reduce((s2, x) => s2 + x.orders, 0); return `${d} ${o} ops=${a.length} rate=${(a.reduce((s2,x)=>s2+x.orders/x.hours,0)/a.length).toFixed(1)}`; });
  for (const k of ['2026-08-11','2026-08-14','2026-09-05','2026-09-07','2026-10-12','2026-10-13','2026-11-02','2026-11-04','2026-11-05']) console.log(rows.find((r) => r.startsWith(k)) ?? k + ' sem movimento');
  console.log('dias', days.length);
  const ev = await s.getDayEvents('2026-11-05');
  const st = ops.map((o) => computeOperatorDay(o, ev, atTime('2026-11-05', 14, 20)));
  console.log(st.map((x) => `${x.operatorId} ${x.status} ${x.orders} ${x.rate?.toFixed(1)}`).join(' | '), teamRate(st));
  const t0 = Date.now(); await s.getDailyAggregates('2026-06-12', '2026-11-04'); console.log('ms', Date.now() - t0);
});
