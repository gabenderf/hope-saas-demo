/**
 * Consultas paginadas de eventos.
 *
 * Ordem SEMPRE (data_hora, id). O app.js antigo ordenava só por data_hora: com
 * horário repetido, o Postgres não garante a ordem entre páginas e a mesma
 * linha podia aparecer em duas páginas ou em nenhuma (docs/modelo-de-dados.md,
 * seção 1.4). Com o id de desempate a ordem é total.
 *
 * Paginação por deslocamento é segura aqui porque a ordem é crescente e
 * data_hora é o now() do banco: linha nova entra no FIM, nunca empurra as
 * páginas já lidas.
 */
import { dayBounds, dayKeyOf, type DayKey } from '@/lib/time';
import type { AccessEvent, ScanEvent } from '../types';
import type { DbPort, Row, SelectQuery } from './port';
import { ACCESS_COLUMNS, SCAN_COLUMNS, mapRows, toAccess, toScan } from './rows';

/** Mesmo tamanho de página do antigo; é o `max-rows` padrão do PostgREST no Supabase. */
export const PAGE_SIZE = 1000;
/** 200 mil linhas numa consulta: um bloco de 7 dias tem ~10 mil. Passar disso é erro, não truncamento silencioso. */
export const MAX_PAGES = 200;

export async function selectAllPages(port: DbPort, base: SelectQuery): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const rows = await port.select({ ...base, range: { from, to: from + PAGE_SIZE - 1 } });
    for (const r of rows) out.push(r);
    if (rows.length < PAGE_SIZE) return out;
  }
  throw new Error(`Consulta em ${base.table} passou de ${MAX_PAGES * PAGE_SIZE} linhas.`);
}

function eventsQuery(table: 'pedidos_separados' | 'logs_acesso', start: string, end: string | null): SelectQuery {
  const id = table === 'pedidos_separados' ? 'id_registro' : 'id_log';
  return {
    table,
    columns: table === 'pedidos_separados' ? SCAN_COLUMNS : ACCESS_COLUMNS,
    gte: { column: 'data_hora', value: start },
    ...(end ? { lt: { column: 'data_hora', value: end } } : {}),
    order: [
      { column: 'data_hora', ascending: true },
      { column: id, ascending: true },
    ],
  };
}

export interface EventLists {
  scans: ScanEvent[];
  access: AccessEvent[];
}

/** Bipagens em [start, end), em ordem crescente, sem repetir id. */
export async function fetchScansBetween(port: DbPort, start: Date, end: Date): Promise<ScanEvent[]> {
  const rows = await selectAllPages(port, eventsQuery('pedidos_separados', start.toISOString(), end.toISOString()));
  return uniqueById(mapRows(rows, toScan));
}

/** Registros de acesso em [start, end), em ordem crescente, sem repetir id. */
export async function fetchAccessBetween(port: DbPort, start: Date, end: Date): Promise<AccessEvent[]> {
  const rows = await selectAllPages(port, eventsQuery('logs_acesso', start.toISOString(), end.toISOString()));
  return uniqueById(mapRows(rows, toAccess));
}

export async function fetchEventsBetween(port: DbPort, start: Date, end: Date): Promise<EventLists> {
  const [scans, access] = await Promise.all([fetchScansBetween(port, start, end), fetchAccessBetween(port, start, end)]);
  return { scans, access };
}

export function fetchDayEvents(port: DbPort, day: DayKey): Promise<EventLists> {
  const { start, end } = dayBounds(day);
  return fetchEventsBetween(port, start, end);
}

/** Vários dias numa consulta só, separados pelo dia operacional de São Paulo. */
export async function fetchDaysEvents(port: DbPort, days: DayKey[]): Promise<Map<DayKey, EventLists>> {
  const sorted = [...days].sort();
  const out = new Map<DayKey, EventLists>();
  for (const d of sorted) out.set(d, { scans: [], access: [] });
  if (!sorted.length) return out;
  const { start } = dayBounds(sorted[0]!);
  const { end } = dayBounds(sorted[sorted.length - 1]!);
  const all = await fetchEventsBetween(port, start, end);
  for (const s of all.scans) out.get(dayKeyOf(s.at))?.scans.push(s);
  for (const a of all.access) out.get(dayKeyOf(a.at))?.access.push(a);
  return out;
}

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
