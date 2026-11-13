import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateDay } from '@/lib/metrics';
import { atTime } from '@/lib/time';
import { withUndo } from '../assemble/undo';
import type { LiveEvent, OperationsSource } from '../types';
import { demoNow, getDemoClock, setDemoClock } from './clock';
import { createDemoSource } from './index';
import { baseOperators } from './roster';

const NOW = atTime('2026-11-05', 14, 20);
const actor = { id: 'u', name: 'Teste' };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const make = (over: { now?: () => Date; storage?: Storage | null; live?: boolean } = {}) =>
  createDemoSource({ now: () => NOW, storage: null, live: false, ...over });

const total = async (s: OperationsSource, day: string) =>
  (await s.getDailyAggregates(day, day)).reduce((n, a) => n + a.orders, 0);

describe('histórico determinístico', () => {
  it('o mesmo dia gera exatamente os mesmos eventos', async () => {
    const a = await make();
    const b = await make();
    const ea = await a.getDayEvents('2026-10-20');
    const eb = await b.getDayEvents('2026-10-20');
    expect(ea.scans.length).toBeGreaterThan(500);
    expect(eb.scans.map((s) => s.id + s.at + s.operatorId)).toEqual(ea.scans.map((s) => s.id + s.at + s.operatorId));
  });

  it('respeita o calendário real: feriado parado sem pedidos, 12/10 trabalhado', async () => {
    const s = await make();
    for (const day of ['2026-07-09', '2026-09-07', '2026-11-02', '2026-06-11', '2026-10-11']) {
      expect(await total(s, day)).toBe(0);
    }
    const holiday = await total(s, '2026-10-12');
    expect(holiday).toBeGreaterThan(800);
    expect(holiday).toBeLessThan(1000);
  });

  it('reproduz os dias marcantes do histórico', async () => {
    const s = await make();
    expect(await total(s, '2026-08-11')).toBeGreaterThan(1250);
    expect(await total(s, '2026-09-05')).toBeGreaterThan(350);
    expect(await total(s, '2026-09-05')).toBeLessThan(470);
    expect(await total(s, '2026-10-13')).toBeGreaterThan(980);
    // fila curta: ritmo baixo para todos juntos
    const agg = await s.getDailyAggregates('2026-08-14', '2026-08-14');
    expect(agg.length).toBeGreaterThanOrEqual(3);
    for (const a of agg) {
      expect(a.orders / a.hours).toBeLessThan(22);
      expect(a.orders).toBeLessThan(200);
    }
  });

  it('dias de semana ficam entre 800 e 1.470 e segunda pesa mais', async () => {
    const s = await make();
    const agg = await s.getDailyAggregates('2026-09-15', '2026-10-09');
    const byDay = new Map<string, number>();
    for (const a of agg) byDay.set(a.day, (byDay.get(a.day) ?? 0) + a.orders);
    const mondays: number[] = [];
    const others: number[] = [];
    for (const [day, n] of byDay) {
      if ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
      expect(n).toBeGreaterThan(700);
      expect(n).toBeLessThan(1500);
      (new Date(`${day}T12:00:00Z`).getUTCDay() === 1 ? mondays : others).push(n);
    }
    const avg = (l: number[]) => l.reduce((x, y) => x + y, 0) / l.length;
    expect(avg(mondays)).toBeGreaterThan(avg(others) * 1.1);
  });

  it('não há movimento antes do início do histórico nem depois de hoje', async () => {
    const s = await make();
    expect(await total(s, '2026-06-10')).toBe(0);
    expect(await total(s, '2026-11-06')).toBe(0);
    expect((await s.getDayEvents('2026-11-06')).scans).toHaveLength(0);
  });

  it('hoje só tem eventos até o relógio', async () => {
    const s = await make();
    const ev = await s.getDayEvents('2026-11-05');
    expect(ev.scans.length).toBeGreaterThan(50);
    expect(ev.scans.every((x) => Date.parse(x.at) <= NOW.getTime())).toBe(true);
    expect(ev.access.every((x) => Date.parse(x.at) <= NOW.getTime())).toBe(true);
    const early = await make({ now: () => atTime('2026-11-05', 6, 0) });
    expect((await early.getDayEvents('2026-11-05')).scans).toHaveLength(0);
  });

  it('agregados são derivados dos eventos crus', async () => {
    const s = await make();
    const day = '2026-10-21';
    const raw = aggregateDay(day, baseOperators(), await s.getDayEvents(day));
    expect(await s.getDailyAggregates(day, day)).toEqual(raw);
    const skus = await s.getDailySkuAggregates(day, day);
    const scans = (await s.getDayEvents(day)).scans;
    expect(skus.reduce((n, x) => n + x.orders, 0)).toBeGreaterThanOrEqual(scans.length);
  });

  it('pedidos mistos: ~6% até 03/08 e ~17% depois, com as combinações fixas', async () => {
    const s = await make();
    const share = async (from: string, to: string) => {
      const a = await s.getDailyAggregates(from, to);
      const mixed = a.reduce((n, x) => n + x.mixedOrders, 0);
      return (mixed / a.reduce((n, x) => n + x.orders, 0)) * 100;
    };
    expect(await share('2026-06-15', '2026-07-31')).toBeGreaterThan(4);
    expect(await share('2026-06-15', '2026-07-31')).toBeLessThan(9);
    expect(await share('2026-08-05', '2026-09-30')).toBeGreaterThan(14);
    expect(await share('2026-08-05', '2026-09-30')).toBeLessThan(21);

    const hasCombo = (scans: { items: { sku: string }[] | null }[]) =>
      scans.some((x) => x.items?.some((i) => i.sku === '3L-PERFU-FLEX') && x.items.some((i) => i.sku === '5X-LEN-COM-TNT'));
    expect(hasCombo((await s.getDayEvents('2026-09-22')).scans)).toBe(true);
    expect(hasCombo((await s.getDayEvents('2026-07-22')).scans)).toBe(false);
  });

  it('operadores: metas entre 32 e 40, um inativo, bancadas 01 a 06', async () => {
    const s = await make();
    const ops = await s.listOperators();
    expect(ops.length).toBeGreaterThanOrEqual(6);
    expect(ops.length).toBeLessThanOrEqual(8);
    expect(ops.filter((o) => o.registration === 'inativo')).toHaveLength(1);
    for (const o of ops) expect(o.individualGoal >= 32 && o.individualGoal <= 40).toBe(true);
    const ev = await s.getDayEvents('2026-10-21');
    for (const sc of ev.scans) expect(sc.station).toMatch(/^0[1-6]$/);
    expect(ev.access.some((a) => a.nextOperatorId && !a.previousOperatorId)).toBe(true);
    expect(ev.access.some((a) => a.previousOperatorId && !a.nextOperatorId)).toBe(true);
  });
});

describe('gravações', () => {
  it('altera a meta global, audita com frase pronta e emite eventos', async () => {
    const s = await make();
    const events: LiveEvent[] = [];
    s.subscribe((e) => events.push(e));
    await s.setGlobalGoal(42, actor);
    expect((await s.getConfig()).globalGoal).toBe(42);
    const [last] = await s.listAudit({ limit: 1 });
    expect(last?.summary).toBe('alterou a meta global de 38 para 42/h');
    expect(last?.actor).toEqual(actor);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['connection', 'config-changed', 'audit']));
    await s.setGlobalGoal(null, actor);
    expect((await s.listAudit({ limit: 1 }))[0]?.summary).toBe('removeu a meta global (era 42/h)');
  });

  it('a individual não é perdida quando a global é definida', async () => {
    const s = await make();
    const before = (await s.listOperators()).map((o) => o.individualGoal);
    await s.setGlobalGoal(50, actor);
    expect((await s.listOperators()).map((o) => o.individualGoal)).toEqual(before);
  });

  it('desfazer registra a ação "desfazer" na auditoria', async () => {
    const s = await make();
    await s.setGlobalGoal(45, actor);
    await withUndo(() => s.setGlobalGoal(38, actor));
    const [last] = await s.listAudit({ limit: 1 });
    expect(last?.action).toBe('desfazer');
    expect(last?.summary).toContain('desfez');
    expect((await s.getConfig()).globalGoal).toBe(38);
  });

  it('desfazer a desativação de um convidado devolve "convidado"', async () => {
    const s = await make();
    const invited = (await s.listPanelUsers()).find((u) => u.status === 'convidado')!;
    await s.setPanelUserStatus(invited.id, 'desativado', actor);
    await withUndo(() => s.setPanelUserStatus(invited.id, 'ativo', actor), { restoreInvited: true });
    expect((await s.listPanelUsers()).find((u) => u.id === invited.id)?.status).toBe('convidado');
  });

  it('operadores: metas, cadastro e criação', async () => {
    const s = await make();
    await s.setIndividualGoals(['101', '102'], 39, actor);
    expect((await s.listOperators()).filter((o) => ['101', '102'].includes(o.id)).every((o) => o.individualGoal === 39)).toBe(true);
    expect((await s.listAudit({ limit: 1 }))[0]?.summary).toBe('alterou a meta de 2 operadores para 39/h');
    await s.setOperatorRegistration('105', 'inativo', actor);
    expect((await s.listAudit({ limit: 1 }))[0]?.summary).toBe('desativou o cadastro de Fernanda Alves');
    await s.saveOperator({ id: '200', name: 'Novo Nome', individualGoal: 36 }, actor);
    expect((await s.listOperators()).find((o) => o.id === '200')?.registration).toBe('ativo');
    await expect(s.setIndividualGoals(['101'], 0, actor)).rejects.toThrow();
    await expect(s.setIndividualGoals(['999'], 30, actor)).rejects.toThrow();
  });

  it('agenda de metas: programa, lista por intervalo, recusa o passado e remove ao desfazer', async () => {
    const s = await make();
    await s.setGoalSchedule('2026-11-09', 44, actor, 'Segunda de volume');
    const list = await s.listGoalSchedule('2026-11-05', '2026-11-30');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ day: '2026-11-09', value: 44, note: 'Segunda de volume' });
    expect(await s.listGoalSchedule('2026-12-01', '2026-12-31')).toHaveLength(0);
    await expect(s.setGoalSchedule('2026-11-04', 30, actor)).rejects.toThrow();
    await withUndo(() => s.setGoalSchedule('2026-11-09', null, actor), { restoreAbsent: true });
    expect(await s.listGoalSchedule('2026-11-05', '2026-11-30')).toHaveLength(0);
  });

  it('usuários do painel: convite, perfil e status', async () => {
    const s = await make();
    const before = await s.listPanelUsers();
    expect(before.map((u) => u.role)).toEqual(expect.arrayContaining(['admin', 'lideranca', 'leitura']));
    expect(before.some((u) => u.status === 'convidado')).toBe(true);
    await s.invitePanelUser({ name: 'Ana Souza', email: 'ana@hope.example', role: 'leitura' }, actor);
    const ana = (await s.listPanelUsers()).find((u) => u.email === 'ana@hope.example')!;
    expect(ana.status).toBe('convidado');
    await expect(s.invitePanelUser({ name: 'Ana', email: 'ANA@hope.example', role: 'leitura' }, actor)).rejects.toThrow();
    await s.setPanelUserRole(ana.id, 'lideranca', actor);
    expect((await s.listAudit({ limit: 1 }))[0]?.summary).toBe('mudou o perfil de Ana Souza de Leitura para Liderança');
    await s.setPanelUserStatus(ana.id, 'desativado', actor);
    expect((await s.listPanelUsers()).find((u) => u.id === ana.id)?.status).toBe('desativado');
  });

  it('reenviar convite: só para convidado, sem mudar estado nem auditar', async () => {
    const s = await make();
    const users = await s.listPanelUsers();
    const invited = users.find((u) => u.status === 'convidado')!;
    const active = users.find((u) => u.status === 'ativo')!;
    const auditBefore = (await s.listAudit({ limit: 50 })).length;
    await s.resendPanelUserInvite!(invited.id, actor);
    expect((await s.listPanelUsers()).find((u) => u.id === invited.id)?.status).toBe('convidado');
    expect((await s.listAudit({ limit: 50 })).length).toBe(auditBefore);
    await expect(s.resendPanelUserInvite!(active.id, actor)).rejects.toThrow('Esta pessoa já aceitou o convite.');
    await s.setPanelUserStatus(invited.id, 'desativado', actor);
    await expect(s.resendPanelUserInvite!(invited.id, actor)).rejects.toThrow('O acesso desta pessoa está desativado.');
    await expect(s.resendPanelUserInvite!('nao-existe', actor)).rejects.toThrow('Usuário não encontrado.');
  });

  it('persiste e recarrega do localStorage', async () => {
    const storage = memoryStorage();
    const a = await make({ storage });
    await a.setGlobalGoal(41, actor);
    const b = await make({ storage });
    expect((await b.getConfig()).globalGoal).toBe(41);
    expect((await b.listAudit({ limit: 1 }))[0]?.summary).toContain('41');
  });

  it('listAudit pagina por "before"', async () => {
    const s = await make();
    const all = await s.listAudit({ limit: 50 });
    expect(all.length).toBeGreaterThanOrEqual(3);
    const page = await s.listAudit({ limit: 50, before: all[0]!.at });
    expect(page.every((e) => e.at < all[0]!.at)).toBe(true);
  });
});

describe('ao vivo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emite "live" ao assinar, bipes conforme o relógio avança e resync na virada do dia', async () => {
    let now = atTime('2026-11-05', 10, 0);
    const s = await createDemoSource({ now: () => now, storage: null });
    const events: LiveEvent[] = [];
    const off = s.subscribe((e) => events.push(e));
    expect(events[0]).toEqual({ type: 'connection', state: 'live' });

    now = new Date(now.getTime() + 2 * 60_000);
    await vi.advanceTimersByTimeAsync(3100);
    const scans = events.filter((e) => e.type === 'scan');
    expect(scans.length).toBeGreaterThan(0);
    for (const e of scans) {
      if (e.type === 'scan') expect(Date.parse(e.scan.at)).toBeLessThanOrEqual(now.getTime());
    }

    now = atTime('2026-11-06', 0, 5);
    await vi.advanceTimersByTimeAsync(3100);
    expect(events.some((e) => e.type === 'resync')).toBe(true);

    off();
    const count = events.length;
    now = new Date(now.getTime() + 60_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events).toHaveLength(count);
  });
});

describe('relógio do demo', () => {
  afterEach(() => setDemoClock('real'));

  it('aceita HH:MM de hoje e volta para a hora real', () => {
    setDemoClock('14:20');
    expect(getDemoClock()).toBe('14:20');
    const d = demoNow();
    expect(Math.abs(d.getTime() - atTime(new Date().toISOString().slice(0, 10), 14, 20).getTime())).toBeLessThan(36 * 3_600_000);
    setDemoClock('real');
    expect(getDemoClock()).toBe('real');
    expect(Math.abs(demoNow().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('recusa horário inválido', () => {
    expect(() => setDemoClock('25:99')).toThrow();
  });
});
