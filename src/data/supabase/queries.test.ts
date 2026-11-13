import { describe, expect, it } from 'vitest';
import { FakeDb } from './fake-db';
import { fetchDayEvents, PAGE_SIZE, selectAllPages } from './queries';
import { SCAN_COLUMNS } from './rows';

function dbWithTies(n: number) {
  const db = new FakeDb();
  // todas no MESMO instante: o pior caso para paginar por data_hora
  for (let i = 1; i <= n; i++) {
    db.tables.pedidos_separados.push({
      id_registro: i,
      id_operador: 'op-a',
      data_hora: '2026-11-04T12:00:00.000000+00:00',
      quantidade_pedidos: 1,
      bancada: 'Bancada 01',
      itens: null,
    });
  }
  return db;
}

describe('paginação', () => {
  it('ordem (data_hora, id): 2.500 linhas com o mesmo horário, nenhuma pulada nem repetida', async () => {
    const db = dbWithTies(2500);
    const day = await fetchDayEvents(db, '2026-11-04');
    expect(day.scans).toHaveLength(2500);
    expect(new Set(day.scans.map((s) => s.id)).size).toBe(2500);
    expect(day.scans.map((s) => Number(s.id))).toEqual(Array.from({ length: 2500 }, (_, i) => i + 1));
    const q = db.selects.find((s) => s.table === 'pedidos_separados')!;
    expect(q.order).toEqual([
      { column: 'data_hora', ascending: true },
      { column: 'id_registro', ascending: true },
    ]);
    expect(db.selects.filter((s) => s.table === 'pedidos_separados').map((s) => s.range)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });

  it('controle: o banco falso é honesto (só por data_hora, como o app.js antigo, perde linha)', async () => {
    const db = dbWithTies(2500);
    const rows = await selectAllPages(db, {
      table: 'pedidos_separados',
      columns: SCAN_COLUMNS,
      order: [{ column: 'data_hora', ascending: true }],
    });
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => r.id_registro)).size).toBeLessThan(2500);
  });

  it('página exatamente cheia pede a próxima; página curta encerra', async () => {
    const db = dbWithTies(PAGE_SIZE);
    await fetchDayEvents(db, '2026-11-04');
    expect(db.selects.filter((s) => s.table === 'pedidos_separados')).toHaveLength(2);
  });

  it('limites do dia são instantes absolutos de São Paulo (03:00Z a 03:00Z)', async () => {
    const db = new FakeDb();
    await fetchDayEvents(db, '2026-11-04');
    const q = db.selects[0]!;
    expect(q.gte).toEqual({ column: 'data_hora', value: '2026-11-04T03:00:00.000Z' });
    expect(q.lt).toEqual({ column: 'data_hora', value: '2026-11-05T03:00:00.000Z' });
  });
});
