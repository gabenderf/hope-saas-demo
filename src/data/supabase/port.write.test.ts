import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { createSupabasePort } from './port';

/** Cliente falso que registra a cadeia de chamadas de uma gravação. */
function fakeClient(result: { data: unknown; error: unknown } = { data: [{ id: 1 }], error: null }, session: unknown = { user: {} }) {
  const chain: string[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['update', 'insert', 'upsert', 'delete', 'eq', 'in', 'select', 'setHeader']) {
    builder[m] = (...args: unknown[]) => {
      chain.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      return builder;
    };
  }
  builder.abortSignal = () => Promise.resolve(result);
  const client = {
    from: (table: string) => {
      chain.push(`from(${table})`);
      return builder;
    },
    auth: { getSession: async () => ({ data: { session }, error: null }) },
  } as unknown as SupabaseClient;
  return { client, chain };
}

describe('porta: gravação', () => {
  it('recusa update e delete sem filtro, sem chamar o banco', async () => {
    for (const action of ['update', 'delete'] as const) {
      const { client, chain } = fakeClient();
      await expect(createSupabasePort(client).write({ table: 'operadores_metas', action, values: { meta_horaria: 40 } })).rejects.toThrow(
        /sem filtro/,
      );
      await expect(
        createSupabasePort(client).write({ table: 'operadores_metas', action, in: { column: 'id_operador', values: [] } }),
      ).rejects.toThrow(/sem filtro/);
      expect(chain).toEqual([]);
    }
  });

  it('update com eq e in, devolvendo as linhas (.select())', async () => {
    const { client, chain } = fakeClient();
    const rows = await createSupabasePort(client).write({
      table: 'operadores_metas',
      action: 'update',
      values: { meta_horaria: 40 },
      in: { column: 'id_operador', values: ['a', 'b'] },
    });
    expect(rows).toEqual([{ id: 1 }]);
    expect(chain).toEqual([
      'from(operadores_metas)',
      'update({"meta_horaria":40})',
      'in("id_operador",["a","b"])',
      'select()',
    ]);
  });

  it('upsert leva onConflict; delete leva o filtro; sem undo não há cabeçalho', async () => {
    const a = fakeClient();
    await createSupabasePort(a.client).write({
      table: 'metas_programadas',
      action: 'upsert',
      values: { dia: '2026-11-10', valor: 40 },
      onConflict: 'dia',
    });
    expect(a.chain).toEqual(['from(metas_programadas)', 'upsert({"dia":"2026-11-10","valor":40},{"onConflict":"dia"})', 'select()']);
    const b = fakeClient();
    await createSupabasePort(b.client).write({ table: 'metas_programadas', action: 'delete', eq: { column: 'dia', value: '2026-11-10' } });
    expect(b.chain).toEqual(['from(metas_programadas)', 'delete()', 'eq("dia","2026-11-10")', 'select()']);
  });

  it('undo manda o cabeçalho x-hope-acao: desfazer', async () => {
    const { client, chain } = fakeClient();
    await createSupabasePort(client).write({
      table: 'configuracoes_gerais',
      action: 'update',
      values: { meta_horaria_global: 35 },
      eq: { column: 'id', value: 1 },
      undo: true,
    });
    expect(chain).toContain('setHeader("x-hope-acao","desfazer")');
  });

  it('erro do PostgREST é lançado como veio (com code)', async () => {
    const error = { code: '42501', message: 'rls' };
    const { client } = fakeClient({ data: null, error });
    await expect(createSupabasePort(client).write({ table: 'operadores_metas', action: 'insert', values: { id_operador: 'x' } })).rejects.toBe(error);
  });

  it('hasSession: true com sessão, false sem', async () => {
    expect(await createSupabasePort(fakeClient().client).hasSession()).toBe(true);
    expect(await createSupabasePort(fakeClient(undefined, null).client).hasSession()).toBe(false);
  });
});

describe('porta: rpc e invoke', () => {
  it('rpc devolve as linhas; objeto solto vira lista; erro do PostgREST é lançado', async () => {
    const calls: unknown[][] = [];
    const make = (result: { data: unknown; error: unknown }) =>
      ({
        rpc: (...args: unknown[]) => {
          calls.push(args);
          return { abortSignal: () => Promise.resolve(result) };
        },
      }) as unknown as SupabaseClient;
    const rows = await createSupabasePort(make({ data: [{ user_id: 'a' }], error: null })).rpc('listar_usuarios_painel');
    expect(rows).toEqual([{ user_id: 'a' }]);
    expect(calls[0]).toEqual(['listar_usuarios_painel', {}]);
    expect(await createSupabasePort(make({ data: null, error: null })).rpc('f', { a: 1 })).toEqual([]);
    const err = { code: '42501', message: 'negado' };
    await expect(createSupabasePort(make({ data: null, error: err })).rpc('f')).rejects.toBe(err);
  });

  it('invoke devolve o corpo; erro HTTP lança o `erro` do corpo; rede lança o original', async () => {
    const make = (result: { data: unknown; error: unknown }) =>
      ({ functions: { invoke: async () => result } }) as unknown as SupabaseClient;
    expect(await createSupabasePort(make({ data: { user_id: 'n' }, error: null })).invoke('usuarios', {})).toEqual({ user_id: 'n' });

    const http = new FunctionsHttpError(new Response(JSON.stringify({ erro: 'Já existe uma conta com este e-mail.' }), { status: 409 }));
    await expect(createSupabasePort(make({ data: null, error: http })).invoke('usuarios', {})).rejects.toThrow('Já existe uma conta com este e-mail.');

    const semCorpo = new FunctionsHttpError(new Response('<html>', { status: 502 }));
    await expect(createSupabasePort(make({ data: null, error: semCorpo })).invoke('usuarios', {})).rejects.toThrow(/recusou o pedido/);

    const net = new TypeError('Failed to fetch');
    await expect(createSupabasePort(make({ data: null, error: net })).invoke('usuarios', {})).rejects.toBe(net);
  });
});
