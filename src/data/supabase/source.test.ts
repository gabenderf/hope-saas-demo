import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from '../types';
import { DataLoadError, ReadOnlyError } from './errors';
import { FakeDb } from './fake-db';
import type { Row } from './port';
import { createSupabaseSourceWith, type SupabaseOperationsSource } from './source';

/* Dados fictícios. São Paulo = UTC-3: 08:00 em SP = 11:00Z. */
const TODAY = '2026-11-05';
const EV = 'hope-expedicao-eventos';
const SET = 'hope-expedicao-cadastro';
const NOW = '2026-11-05T15:00:00.000Z'; // 12:00 em SP

let nextId = 1;
const sp = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h! + 3, m!)).toISOString();
};
const scanRow = (day: string, hhmm: string, op = 'op-a', skus = ['SKU-A']): Row => {
  const id = nextId++;
  return {
    id_registro: id,
    id_operador: op,
    data_hora: sp(day, hhmm),
    quantidade_pedidos: 1,
    bancada: 'Bancada 01',
    codigo_rastreio: `BR${id}`,
    itens: skus.map((sku) => ({ sku, quantidade: 1 })),
    num_pedido: `P${id}`,
  };
};
const logRow = (day: string, hhmm: string, next: string | null = 'op-a'): Row => ({
  id_log: nextId++,
  data_hora: sp(day, hhmm),
  bancada: 'Bancada 01',
  id_anterior: null,
  id_novo: next,
  justificativa: 'Login Inicial / Abertura de Tela',
});

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

function setup() {
  const db = new FakeDb();
  db.tables.operadores_metas.push(
    { id_operador: 'op-a', nome_colaborador: 'Operador A', meta_horaria: 35, status: 'ativo' },
    { id_operador: 'op-b', nome_colaborador: 'Operador B', meta_horaria: null, status: 'ativo' },
  );
  db.tables.configuracoes_gerais.push({ id: 1, meta_horaria_global: null, atualizado_em: null });
  const net = new EventTarget();
  let online = true;
  const make = () =>
    createSupabaseSourceWith({
      port: db,
      scope: 'https://teste.supabase.co',
      storage: window.localStorage,
      random: () => 0.5,
      network: { isOnline: () => online, target: net },
    });
  const src = make();
  const events: LiveEvent[] = [];
  return {
    db,
    src,
    make,
    net,
    events,
    setOnline(v: boolean) {
      online = v;
      net.dispatchEvent(new Event(v ? 'online' : 'offline'));
    },
    listen(source: SupabaseOperationsSource = src) {
      return source.subscribe((e) => events.push(e));
    },
  };
}

const states = (events: LiveEvent[]) => events.flatMap((e) => (e.type === 'connection' ? [e.state] : []));
const scansEmitted = (events: LiveEvent[]) => events.flatMap((e) => (e.type === 'scan' ? [e.scan.id] : []));
const count = (events: LiveEvent[], type: LiveEvent['type']) => events.filter((e) => e.type === type).length;

beforeEach(() => {
  nextId = 1;
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Assina, confirma o canal de eventos e espera a carga. */
async function goLive(t: ReturnType<typeof setup>) {
  const unsub = t.listen();
  t.db.lastChannel(EV).status('SUBSCRIBED');
  t.db.lastChannel(SET).status('SUBSCRIBED');
  await flush();
  return unsub;
}

describe('carga inicial × eventos ao vivo', () => {
  it('assina o canal ANTES da carga, não duplica nem perde evento que chega durante a carga', async () => {
    const t = setup();
    for (const hhmm of ['08:00', '08:01', '08:02']) t.db.insert('pedidos_separados', scanRow(TODAY, hhmm), { deliver: false });
    // B já está no banco quando a carga roda, mas o aviso dele chega no meio da carga
    const b = scanRow(TODAY, '08:05');
    t.db.insert('pedidos_separados', b, { deliver: false });
    const a = scanRow(TODAY, '08:06');

    t.listen();
    expect(t.db.selects).toHaveLength(0); // nada de carga antes do canal confirmar
    const ch = t.db.lastChannel(EV);
    let injected = false;
    t.db.afterSelect = (q) => {
      if (q.table !== 'pedidos_separados' || injected) return;
      injected = true;
      // A entra depois que a consulta já leu: só chega pelo canal
      t.db.insert('pedidos_separados', a);
      ch.deliver({ table: 'pedidos_separados', eventType: 'INSERT', new: { ...b }, old: {} });
    };
    ch.status('SUBSCRIBED');
    await flush();

    const day = await t.src.getDayEvents(TODAY);
    const ids = day.scans.map((s) => s.id);
    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(scansEmitted(t.events).sort()).toEqual([String(a.id_registro), String(b.id_registro)].sort());
    expect(states(t.events)).toContain('live');
    expect(count(t.events, 'resync')).toBe(0); // ninguém leu antes: nada a corrigir na tela
  });

  it('depois da primeira carga, hoje vem do armazém sem consultar o banco; evento novo entra uma vez', async () => {
    const t = setup();
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    await goLive(t);
    const before = t.db.selectsOn('pedidos_separados');
    await t.src.getDayEvents(TODAY);
    await t.src.getDayEvents(TODAY);
    expect(t.db.selectsOn('pedidos_separados')).toBe(before);

    const row = scanRow(TODAY, '09:00');
    t.db.insert('pedidos_separados', row);
    // o Realtime pode entregar de novo: não emite duas vezes
    t.db.lastChannel(EV).deliver({ table: 'pedidos_separados', eventType: 'INSERT', new: { ...row }, old: {} });
    t.db.insert('logs_acesso', logRow(TODAY, '09:01'));
    const day = await t.src.getDayEvents(TODAY);
    expect(day.scans.map((s) => s.id)).toEqual(['1', String(row.id_registro)]);
    expect(day.access).toHaveLength(1);
    expect(scansEmitted(t.events)).toEqual([String(row.id_registro)]);
    expect(count(t.events, 'access')).toBe(1);
    expect(t.db.selectsOn('pedidos_separados')).toBe(before);
  });

  it('leitura antes do canal confirmar gera resync quando o armazém fica em dia', async () => {
    const t = setup();
    t.listen();
    await t.src.getDayEvents(TODAY); // a tela leu direto do banco
    t.db.lastChannel(EV).status('SUBSCRIBED');
    await flush();
    expect(count(t.events, 'resync')).toBe(1);
  });

  it('descarta evento de outro dia', async () => {
    const t = setup();
    await goLive(t);
    t.db.insert('pedidos_separados', scanRow('2026-11-04', '17:00'));
    t.db.insert('logs_acesso', logRow('2026-11-04', '17:00'));
    expect(scansEmitted(t.events)).toEqual([]);
    expect(count(t.events, 'access')).toBe(0);
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(0);
  });

  it('devolve em ordem crescente com desempate pelo id', async () => {
    const t = setup();
    t.db.insert('pedidos_separados', scanRow(TODAY, '10:00'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    const day = await t.src.getDayEvents(TODAY);
    expect(day.scans.map((s) => s.id)).toEqual(['2', '3', '1']);
    expect(day.scans[0]!.station).toBe('01');
  });
});

describe('reconexão e estado da conexão', () => {
  it('canal caiu: reconnecting, backoff, novo canal, recarrega a lacuna e emite resync', async () => {
    const t = setup();
    await goLive(t);
    const first = t.db.lastChannel(EV);
    first.status('CHANNEL_ERROR', new Error('socket'));
    expect(first.closed).toBe(true);
    expect(states(t.events)).toContain('reconnecting');

    // bipe gravado enquanto o canal estava fora: ninguém avisa
    const gap = scanRow(TODAY, '11:00');
    t.db.insert('pedidos_separados', gap);
    expect(scansEmitted(t.events)).toEqual([]);

    await vi.advanceTimersByTimeAsync(999);
    expect(t.db.lastChannel(EV)).toBe(first);
    await vi.advanceTimersByTimeAsync(1);
    const second = t.db.lastChannel(EV);
    expect(second).not.toBe(first);
    second.status('SUBSCRIBED');
    await flush();

    expect(count(t.events, 'resync')).toBe(1);
    expect(states(t.events).at(-1)).toBe('live');
    expect((await t.src.getDayEvents(TODAY)).scans.map((s) => s.id)).toEqual([String(gap.id_registro)]);
  });

  it('backoff cresce a cada falha e, depois de 3, passa para consulta periódica', async () => {
    const t = setup();
    t.listen();
    t.db.lastChannel(EV).status('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(1_000);
    t.db.lastChannel(EV).status('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(1_999);
    const beforeThird = t.db.channels.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(t.db.channels.length).toBe(beforeThird + 1);
    t.db.lastChannel(EV).status('CLOSED');
    await flush();
    expect(t.src.liveMode()).toBe('polling');
    expect(states(t.events).at(-1)).toBe('live');
  });

  it('navegador offline e online: estado offline, reabre o canal e resincroniza', async () => {
    const t = setup();
    await goLive(t);
    const first = t.db.lastChannel(EV);
    t.setOnline(false);
    expect(states(t.events).at(-1)).toBe('offline');
    t.setOnline(true);
    expect(first.closed).toBe(true);
    expect(states(t.events)).toContain('reconnecting');
    t.db.lastChannel(EV).status('SUBSCRIBED');
    await flush();
    expect(states(t.events).at(-1)).toBe('live');
    expect(count(t.events, 'resync')).toBe(1);
  });

  it('banco sem Realtime nas tabelas: consulta periódica, sem evento repetido', async () => {
    const t = setup();
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    t.listen();
    t.db.lastChannel(EV).status('UNAVAILABLE', new Error('RealtimeDisabledForConfiguration'));
    await flush();
    expect(t.src.liveMode()).toBe('polling');
    expect(states(t.events).at(-1)).toBe('live');
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(1);

    const row = scanRow(TODAY, '11:59');
    t.db.insert('pedidos_separados', row);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(scansEmitted(t.events)).toEqual([String(row.id_registro)]);
    await vi.advanceTimersByTimeAsync(10_000); // a folga reconsulta o mesmo bipe
    expect(scansEmitted(t.events)).toEqual([String(row.id_registro)]);
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(2);
  });

  it('consulta periódica que falha: reconnecting; quando volta, resync', async () => {
    const t = setup();
    t.listen();
    t.db.lastChannel(EV).status('UNAVAILABLE');
    t.db.lastChannel(SET).status('UNAVAILABLE'); // senão a ponte do cadastro consome as falhas
    await flush();
    t.db.failNext = 2;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(states(t.events).at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(states(t.events).at(-1)).toBe('live');
    expect(count(t.events, 'resync')).toBe(1);
  });
});

describe('virada do dia em São Paulo', () => {
  it('troca o armazém, carrega o dia novo e emite resync', async () => {
    const t = setup();
    t.db.insert('pedidos_separados', scanRow(TODAY, '17:00'), { deliver: false });
    await goLive(t);
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(1);

    const tomorrow = '2026-11-06';
    const early = scanRow(tomorrow, '00:00');
    t.db.insert('pedidos_separados', early, { deliver: false });
    vi.setSystemTime(new Date('2026-11-06T03:00:05.000Z')); // 00:00:05 em SP
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    expect(count(t.events, 'resync')).toBe(1);
    const newDay = await t.src.getDayEvents(tomorrow);
    expect(newDay.scans.map((s) => s.id)).toEqual([String(early.id_registro)]);
    // atrasado do dia anterior chega pelo canal: descartado
    t.db.insert('pedidos_separados', scanRow(TODAY, '23:59'));
    expect(scansEmitted(t.events)).toEqual([]);
    // ontem virou dia fechado: vem do banco, não do armazém
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(2);
  });

  it('a virada é percebida também numa leitura, sem esperar o timer', async () => {
    const t = setup();
    vi.setSystemTime(new Date('2026-11-06T03:00:01.000Z'));
    const day = await t.src.getDayEvents('2026-11-06');
    expect(day.day).toBe('2026-11-06');
    expect(await t.src.getDayEvents('2026-11-07')).toEqual({ day: '2026-11-07', scans: [], access: [] });
  });
});

describe('agregados de dias fechados', () => {
  function seedClosedDays(t: ReturnType<typeof setup>) {
    t.db.insert('logs_acesso', logRow('2026-11-03', '07:50'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow('2026-11-03', '08:00'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow('2026-11-03', '09:00', 'op-a', ['SKU-A', 'SKU-B']), { deliver: false });
    t.db.insert('pedidos_separados', scanRow('2026-11-04', '08:00', 'op-b'), { deliver: false });
    // 23:30 em SP de 04/11 é 05/11 em UTC: tem que contar no dia 04
    t.db.insert('pedidos_separados', scanRow('2026-11-04', '23:30', 'op-b'), { deliver: false });
  }

  it('agrega com a fórmula da tela, pelo dia de São Paulo, numa consulta por tabela', async () => {
    const t = setup();
    seedClosedDays(t);
    const aggs = await t.src.getDailyAggregates('2026-11-02', '2026-11-04');
    expect(t.db.selects).toHaveLength(2);
    const a = aggs.find((x) => x.day === '2026-11-03' && x.operatorId === 'op-a')!;
    expect(a).toMatchObject({ orders: 2, simpleOrders: 1, mixedOrders: 1 });
    expect(a.hours).toBeCloseTo(70 / 60); // início no registro de acesso 07:50, fim no último bipe 09:00
    expect(aggs.find((x) => x.day === '2026-11-04')).toMatchObject({ operatorId: 'op-b', orders: 2 });
    const skus = await t.src.getDailySkuAggregates('2026-11-03', '2026-11-03');
    expect(skus.find((s) => s.sku === 'SKU-A')).toMatchObject({ orders: 2, mixedOrders: 1 });
  });

  it('dia fechado vem do cache (nem nesta instância nem na próxima busca de novo); ontem só em memória; hoje nunca', async () => {
    const t = setup();
    seedClosedDays(t);
    await t.src.getDailyAggregates('2026-11-02', '2026-11-04');
    const n = t.db.selects.length;
    await t.src.getDailyAggregates('2026-11-02', '2026-11-04');
    await t.src.getDailySkuAggregates('2026-11-03', '2026-11-04');
    expect(t.db.selects.length).toBe(n);

    // outra instância: os dias fechados vêm do localStorage; ontem (04/11) não está lá
    const other = t.make();
    await other.getDailyAggregates('2026-11-02', '2026-11-03');
    expect(t.db.selects.length).toBe(n);

    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    const withToday = await other.getDailyAggregates('2026-11-04', TODAY);
    expect(withToday.filter((x) => x.day === TODAY)).toHaveLength(1);
    const m = t.db.selects.length;
    t.db.insert('pedidos_separados', scanRow(TODAY, '09:00'), { deliver: false });
    const again = await other.getDailyAggregates('2026-11-04', TODAY);
    expect(t.db.selects.length).toBeGreaterThan(m); // hoje sem canal: vai ao banco de novo
    expect(again.find((x) => x.day === TODAY)!.orders).toBe(2);
    const keys = Object.keys(window.localStorage);
    expect(keys.some((k) => k.endsWith(`:${TODAY}`))).toBe(false);
    expect(keys.some((k) => k.endsWith(':2026-11-04'))).toBe(false); // ontem: só memória
    expect(keys.some((k) => k.endsWith(':2026-11-03'))).toBe(true);
  });

  it('pedidos simultâneos do mesmo período fazem UMA carga, em blocos de 7 dias', async () => {
    const t = setup();
    await Promise.all([
      t.src.getDailyAggregates('2026-10-01', '2026-10-30'),
      t.src.getDailySkuAggregates('2026-10-01', '2026-10-30'),
      t.src.getDailyAggregates('2026-10-15', '2026-10-30'),
    ]);
    // 30 dias = 5 blocos; 2 tabelas por bloco
    expect(t.db.selects).toHaveLength(10);
  });

  it('erro de rede vira mensagem em português; o detalhe vai para o console', async () => {
    const t = setup();
    t.db.failNext = 1;
    const err = await t.src.getDailyAggregates('2026-11-02', '2026-11-04').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataLoadError);
    expect((err as Error).message).toMatch(/^Não foi possível carregar os dados/);
    expect((err as Error).message).not.toMatch(/fetch/i);
    expect(console.error).toHaveBeenCalled();
    // falha não fica presa: a próxima tentativa carrega
    await expect(t.src.getDailyAggregates('2026-11-02', '2026-11-04')).resolves.toEqual([]);
  });
});

describe('assinatura', () => {
  it('vários ouvintes; cancelar é idempotente; o canal fecha quando não sobra ouvinte', async () => {
    const t = setup();
    const a: LiveEvent[] = [];
    const b: LiveEvent[] = [];
    const ua = t.src.subscribe((e) => a.push(e));
    const ub = t.src.subscribe((e) => b.push(e));
    expect(t.db.openChannels(EV)).toHaveLength(1);
    await flush();
    expect(a[0]).toEqual({ type: 'connection', state: 'connecting' });
    expect(b[0]).toEqual({ type: 'connection', state: 'connecting' });

    ua();
    ua();
    expect(t.db.openChannels(EV)).toHaveLength(1);
    t.db.lastChannel(EV).status('SUBSCRIBED');
    await flush();
    expect(states(b)).toContain('live');
    expect(states(a)).not.toContain('live');

    ub();
    expect(t.db.openChannels(EV)).toHaveLength(0);
    expect(t.db.openChannels(SET)).toHaveLength(0);
    expect(t.src.liveMode()).toBe('idle');

    // cancelamento velho não derruba assinatura nova
    t.src.subscribe(() => {});
    ub();
    expect(t.db.openChannels(EV)).toHaveLength(1);
  });

  it('sem ouvinte, hoje volta a ir ao banco (o armazém não é mais garantido)', async () => {
    const t = setup();
    const unsub = await goLive(t);
    unsub();
    const row = scanRow(TODAY, '10:00');
    t.db.insert('pedidos_separados', row, { deliver: false });
    expect((await t.src.getDayEvents(TODAY)).scans.map((s) => s.id)).toEqual([String(row.id_registro)]);
  });

  it('meta global e operadores: Realtime emite config-changed e operators-changed', async () => {
    const t = setup();
    await goLive(t);
    t.db.update('configuracoes_gerais', { id: 1, meta_horaria_global: 40, atualizado_em: '2026-11-05T14:00:00.000+00:00' });
    expect(t.events).toContainEqual({
      type: 'config-changed',
      config: { globalGoal: 40, updatedAt: '2026-11-05T14:00:00.000Z' },
    });
    t.db.update('operadores_metas', { id_operador: 'op-a', nome_colaborador: 'Operador A', meta_horaria: 40, status: 'ativo' });
    expect(count(t.events, 'operators-changed')).toBe(1);
  });

  it('meta global sem Realtime: a consulta a cada 60 s percebe a mudança', async () => {
    const t = setup();
    t.listen();
    expect((await t.src.getConfig()).globalGoal).toBeNull();
    t.db.lastChannel(SET).status('UNAVAILABLE');
    await flush();
    expect(count(t.events, 'config-changed')).toBe(0);
    t.db.tables.configuracoes_gerais[0]!.meta_horaria_global = 42;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.events).toContainEqual({ type: 'config-changed', config: { globalGoal: 42, updatedAt: null } });
    // com o alimentador em dia, a leitura vem da memória
    const n = t.db.selects.length;
    expect((await t.src.getConfig()).globalGoal).toBe(42);
    expect((await t.src.listOperators()).map((o) => o.individualGoal)).toEqual([35, 35]);
    expect(t.db.selects.length).toBe(n);
  });
});

describe('leituras simples e somente leitura', () => {
  it('usuários do painel: só username e role; admin vira admin, o resto leitura', async () => {
    const t = setup();
    t.db.tables.usuarios_painel.push({ username: 'chefe', role: 'admin' }, { username: 'equipe', role: 'user' });
    const users = await t.src.listPanelUsers();
    expect(users.map((u) => [u.username, u.role, u.status])).toEqual([
      ['chefe', 'admin', 'ativo'],
      ['equipe', 'leitura', 'ativo'],
    ]);
    expect(t.db.selects.at(-1)!.columns).toBe('username,role');
    expect(await t.src.listAudit({ limit: 10 })).toEqual([]);
    expect(await t.src.listGoalSchedule(TODAY, TODAY)).toEqual([]);
  });

  it('toda gravação lança ReadOnlyError em português e não toca o banco', async () => {
    const t = setup();
    const actor = { id: 'x', name: 'X' };
    const calls = [
      t.src.setGlobalGoal(40, actor),
      t.src.setIndividualGoals(['op-a'], 40, actor),
      t.src.saveOperator({ id: 'op-c', name: 'C', individualGoal: 35 }, actor),
      t.src.setOperatorRegistration('op-a', 'inativo', actor),
      t.src.setGoalSchedule(TODAY, 40, actor),
      t.src.invitePanelUser({ name: 'n', email: 'n@exemplo.com', role: 'leitura' }, actor),
      t.src.setPanelUserRole('equipe', 'admin', actor),
      t.src.setPanelUserStatus('equipe', 'desativado', actor),
    ];
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(t.src.setGlobalGoal(1, actor)).rejects.toThrow(/somente leitura/);
    expect(t.src.capabilities).toEqual({ write: false, audit: false, realtime: true, goalSchedule: false, userManagement: false });
    expect(t.db.selects).toHaveLength(0);
  });
});

describe('selo de conexão na carga (Realtime desligado no banco)', () => {
  it('canal sem resposta: a ponte consulta e a primeira consulta que der certo marca live', async () => {
    const t = setup();
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00'), { deliver: false });
    t.listen();
    await flush();
    expect(states(t.events)).toEqual(['connecting']);
    expect(t.db.selectsOn('pedidos_separados')).toBe(0); // canal rápido não paga carga dupla
    await vi.advanceTimersByTimeAsync(1_500);
    expect(states(t.events).at(-1)).toBe('live');
    expect(states(t.events)).not.toContain('reconnecting');
    expect((await t.src.getDayEvents(TODAY)).scans).toHaveLength(1);

    // a recusa chega depois (o servidor responde um canal por vez): vira consulta periódica sem nova carga
    const loads = t.db.selectsOn('pedidos_separados');
    t.db.lastChannel(EV).status('UNAVAILABLE', new Error('RealtimeDisabledForConfiguration'));
    await flush();
    expect(t.src.liveMode()).toBe('polling');
    expect(t.db.selectsOn('pedidos_separados')).toBe(loads);
    expect(states(t.events).at(-1)).toBe('live');
    const row = scanRow(TODAY, '11:59');
    t.db.insert('pedidos_separados', row);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(scansEmitted(t.events)).toEqual([String(row.id_registro)]);
  });

  it('canal que confirma depois da ponte assume: a ponte para e a carga pós-SUBSCRIBED vale', async () => {
    const t = setup();
    t.listen();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(states(t.events).at(-1)).toBe('live');
    t.db.lastChannel(EV).status('SUBSCRIBED');
    await flush();
    const n = t.db.selectsOn('pedidos_separados');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.db.selectsOn('pedidos_separados')).toBe(n); // sem consulta periódica com o canal no ar
    expect(t.src.liveMode()).toBe('realtime');
    const row = scanRow(TODAY, '11:00');
    t.db.insert('pedidos_separados', row);
    expect(scansEmitted(t.events)).toEqual([String(row.id_registro)]);
  });

  it('consulta da ponte que falha: reconnecting e tenta de novo; quando dá certo, live', async () => {
    const t = setup();
    t.listen();
    t.db.lastChannel(SET).status('UNAVAILABLE');
    await flush();
    t.db.failNext = 1;
    await vi.advanceTimersByTimeAsync(1_500);
    expect(states(t.events).at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(states(t.events).at(-1)).toBe('live');
  });
});

describe('hoje no agregado: a mesma regra da Visão Geral', () => {
  it('quem está ativo conta até agora; cadastro inativo congela; quem bipou sem cadastro entra', async () => {
    const t = setup();
    t.db.tables.operadores_metas.push({ id_operador: 'op-c', nome_colaborador: 'Operador C', meta_horaria: 35, status: 'inativo' });
    // agora = 12:00 em SP
    t.db.insert('logs_acesso', logRow(TODAY, '08:00', 'op-a'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '09:00', 'op-a'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '11:50', 'op-a'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '08:00', 'op-c'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '10:00', 'op-c'), { deliver: false });
    t.db.insert('pedidos_separados', scanRow(TODAY, '09:00', 'op-x'), { deliver: false });

    const aggs = await t.src.getDailyAggregates(TODAY, TODAY);
    const by = (id: string) => aggs.find((a) => a.operatorId === id)!;
    expect(by('op-a').hours).toBeCloseTo(4); // 08:00 até agora (12:00), não até 11:50
    expect(by('op-c').hours).toBeCloseTo(2); // inativo no cadastro: 08:00 até o último bipe
    expect(by('op-x').orders).toBe(1);
    expect(Object.keys(window.localStorage).some((k) => k.endsWith(`:${TODAY}`))).toBe(false);
  });
});

describe('relógio do aparelho errado × cache de dias fechados', () => {
  const stored = () =>
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('hope.supabase.dia.'))
      .map((k) => k.slice(-10))
      .sort();

  function seed(t: ReturnType<typeof setup>) {
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
      t.db.insert('pedidos_separados', scanRow(d, '08:00'), { deliver: false });
    }
  }

  it('relógio local 2 h adiantado depois da meia-noite: o hoje real (parcial) não vira dia fechado', async () => {
    const t = setup();
    seed(t);
    // servidor: 05/11 22:30 em SP; aparelho: 06/11 00:30 em SP (o servidor nem é consultado aqui)
    vi.setSystemTime(new Date('2026-11-06T03:30:00.000Z'));
    await t.src.getDailyAggregates('2026-11-02', '2026-11-05');
    expect(stored()).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('relógio mais de um dia adiantado: o horário do servidor decide o que é fechado', async () => {
    const t = setup();
    seed(t);
    vi.setSystemTime(new Date('2026-11-07T04:00:00.000Z')); // 07/11 01:00 em SP no aparelho
    t.db.serverOffsetMs = -30 * 3_600_000; // servidor: 05/11 19:00 em SP
    await t.src.getDailyAggregates('2026-11-02', '2026-11-05');
    // pelo servidor, hoje é 05/11 e ontem 04/11: nenhum dos dois é fechado
    expect(stored()).toEqual(['2026-11-02', '2026-11-03']);
    // 05/11 fica em memória alguns minutos e depois vai ao banco de novo
    t.db.insert('pedidos_separados', scanRow('2026-11-05', '18:00'), { deliver: false });
    expect((await t.src.getDailyAggregates('2026-11-05', '2026-11-05'))[0]!.orders).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect((await t.src.getDailyAggregates('2026-11-05', '2026-11-05'))[0]!.orders).toBe(2);
    expect(stored()).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('servidor com diferença pequena (até 10 min): vale o relógio local', async () => {
    const t = setup();
    seed(t);
    t.db.serverOffsetMs = 5 * 60_000;
    await t.src.getDailyAggregates('2026-11-02', '2026-11-04');
    expect(stored()).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('getDayEvents de ontem não grava o agregado de brinde; o de anteontem grava', async () => {
    const t = setup();
    seed(t);
    await t.src.getDayEvents('2026-11-04');
    await t.src.getDayEvents('2026-11-03');
    expect(stored()).toEqual(['2026-11-03']);
  });
});

describe('desmontar a fonte', () => {
  it('sem ouvinte: nenhum timer, canal ou escuta de rede sobra', async () => {
    const t = setup();
    const unsub = t.listen();
    await vi.advanceTimersByTimeAsync(1_500); // ponte rodando
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unsub();
    expect(vi.getTimerCount()).toBe(0);
    expect(t.db.openChannels(EV)).toHaveLength(0);
    expect(t.db.openChannels(SET)).toHaveLength(0);
    const channels = t.db.channels.length;
    const selects = t.db.selects.length;
    t.setOnline(false);
    t.setOnline(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.db.channels.length).toBe(channels);
    expect(t.db.selects.length).toBe(selects);
  });
});
