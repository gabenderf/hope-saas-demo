import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabasePort, isUnavailableError } from './port';

type Cb = (...args: unknown[]) => void;

function fakeClient(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: string[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'range']) {
    builder[m] = (...args: unknown[]) => {
      chain.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      return builder;
    };
  }
  builder.abortSignal = () => Promise.resolve(result);

  const handlers: { type: string; filter: unknown; cb: Cb }[] = [];
  let statusCb: Cb | null = null;
  let channelOptions: unknown = null;
  let fromOptions: { fetch?: typeof fetch } | undefined;
  const channel = {
    on(type: string, filter: unknown, cb: Cb) {
      handlers.push({ type, filter, cb });
      return channel;
    },
    subscribe(cb: Cb) {
      statusCb = cb;
      return channel;
    },
  };
  const removeChannel = vi.fn(async () => 'ok');
  const client = {
    from: (table: string, opts?: { fetch?: typeof fetch }) => {
      fromOptions = opts;
      chain.push(`from(${table})`);
      return builder;
    },
    channel: (_name: string, opts: unknown) => {
      channelOptions = opts;
      return channel;
    },
    removeChannel,
  } as unknown as SupabaseClient;
  return {
    client,
    chain,
    handlers,
    removeChannel,
    status: (...args: unknown[]) => statusCb?.(...args),
    options: () => channelOptions,
    fromOptions: () => fromOptions,
  };
}

describe('createSupabasePort', () => {
  it('monta a consulta na ordem do PostgREST', async () => {
    const f = fakeClient({ data: [{ a: 1 }], error: null });
    const rows = await createSupabasePort(f.client).select({
      table: 'pedidos_separados',
      columns: 'id_registro',
      gte: { column: 'data_hora', value: 'A' },
      lt: { column: 'data_hora', value: 'B' },
      order: [
        { column: 'data_hora', ascending: true },
        { column: 'id_registro', ascending: true },
      ],
      range: { from: 0, to: 999 },
    });
    expect(rows).toEqual([{ a: 1 }]);
    expect(f.chain).toEqual([
      'from(pedidos_separados)',
      'select("id_registro")',
      'gte("data_hora","A")',
      'lt("data_hora","B")',
      'order("data_hora",{"ascending":true})',
      'order("id_registro",{"ascending":true})',
      'range(0,999)',
    ]);
  });

  it('erro do PostgREST vira exceção', async () => {
    const f = fakeClient({ data: null, error: { message: 'permission denied' } });
    await expect(createSupabasePort(f.client).select({ table: 'usuarios_painel', columns: '*' })).rejects.toEqual({
      message: 'permission denied',
    });
  });

  it('canal: wait:true, um binding por tabela, repassa INSERT e mapeia "Realtime desligado" para UNAVAILABLE', () => {
    const f = fakeClient();
    const onChange = vi.fn();
    const onStatus = vi.fn();
    const handle = createSupabasePort(f.client).openChannel(
      { name: 'c', bindings: [{ table: 'pedidos_separados', event: 'INSERT' }, { table: 'configuracoes_gerais', event: '*' }] },
      onChange,
      onStatus,
    );
    expect(f.options()).toEqual({ config: { postgres_changes_options: { wait: true } } });
    const pg = f.handlers.filter((h) => h.type === 'postgres_changes');
    expect(pg.map((h) => h.filter)).toEqual([
      { schema: 'public', table: 'pedidos_separados', event: 'INSERT' },
      { schema: 'public', table: 'configuracoes_gerais', event: '*' },
    ]);
    pg[0]!.cb({ eventType: 'INSERT', new: { id_registro: 1 }, old: {} });
    expect(onChange).toHaveBeenCalledWith({ table: 'pedidos_separados', eventType: 'INSERT', new: { id_registro: 1 }, old: {} });

    f.status('SUBSCRIBED');
    f.status('CHANNEL_ERROR', new Error('RealtimeDisabledForConfiguration: Unable to subscribe to changes'));
    f.status('TIMED_OUT');
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['SUBSCRIBED', 'UNAVAILABLE', 'TIMED_OUT']);

    // servidor sem `wait`: erro chega como mensagem de sistema depois do SUBSCRIBED
    const sys = f.handlers.find((h) => h.type === 'system')!;
    sys.cb({ status: 'error', extension: 'postgres_changes', message: 'Unable to subscribe to changes with given parameters' });
    sys.cb({ status: 'ok', extension: 'postgres_changes', message: 'Subscribed to PostgreSQL' });
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['SUBSCRIBED', 'UNAVAILABLE', 'TIMED_OUT', 'UNAVAILABLE']);

    handle.close();
    handle.close();
    expect(f.removeChannel).toHaveBeenCalledTimes(1);
    f.status('CLOSED');
    pg[0]!.cb({ eventType: 'INSERT', new: {}, old: {} });
    expect(onStatus).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('guarda o horário do servidor (cabeçalho Date) de cada resposta, com o relógio local do mesmo instante', async () => {
    const f = fakeClient();
    const stub = vi.fn(async () => new Response('[]', { headers: { Date: 'Fri, 06 Nov 2026 06:44:17 GMT' } }));
    const port = createSupabasePort(f.client, { fetch: stub as unknown as typeof fetch, now: () => 1_000 });
    expect(port.serverClock?.()).toBeNull();
    await port.select({ table: 'configuracoes_gerais', columns: 'id' });
    const observing = f.fromOptions()?.fetch;
    expect(observing).toBeTypeOf('function');
    await observing!('https://x.supabase.co/rest/v1/configuracoes_gerais');
    expect(stub).toHaveBeenCalledTimes(1);
    expect(port.serverClock?.()).toEqual({ serverMs: Date.parse('2026-11-06T06:44:17Z'), localMs: 1_000 });

    // resposta sem Date (ou ilegível) não apaga a última leitura
    stub.mockResolvedValueOnce(new Response('[]'));
    await observing!('https://x.supabase.co/rest/v1/configuracoes_gerais');
    expect(port.serverClock?.()?.serverMs).toBe(Date.parse('2026-11-06T06:44:17Z'));
  });

  it('isUnavailableError reconhece as duas formas da mensagem', () => {
    expect(isUnavailableError('RealtimeDisabledForConfiguration: x')).toBe(true);
    expect(isUnavailableError('Unable to subscribe to changes with given parameters')).toBe(true);
    expect(isUnavailableError('socket closed')).toBe(false);
    expect(isUnavailableError(undefined)).toBe(false);
  });
});
