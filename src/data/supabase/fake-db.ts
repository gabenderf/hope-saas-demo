/**
 * SÓ PARA TESTES. Banco falso que imita o que importa do PostgREST e do
 * Realtime para provar a lógica de concorrência:
 *  - filtros eq/gte/lt, ordem e `range` (inclusivo) como o PostgREST;
 *  - EMPATE NÃO RESOLVIDO PELA ORDEM é embaralhado a cada consulta, como o
 *    Postgres pode fazer: paginar só por data_hora pula e repete linha aqui
 *    exatamente como pode pular e repetir no banco real;
 *  - canais com status controlado pelo teste; insert só chega a canal já
 *    SUBSCRIBED e não fechado.
 * Não é importado por código de produção.
 */
import type {
  ChangePayload,
  ChannelBinding,
  ChannelStatus,
  DbPort,
  Row,
  SelectQuery,
  ServerClockSample,
  TableName,
  WriteQuery,
} from './port';

export class FakeChannel {
  closed = false;
  subscribed = false;
  readonly name: string;
  readonly bindings: ChannelBinding[];
  private readonly onChange: (p: ChangePayload) => void;
  private readonly onStatus: (s: ChannelStatus, e?: Error) => void;

  constructor(
    name: string,
    bindings: ChannelBinding[],
    onChange: (p: ChangePayload) => void,
    onStatus: (s: ChannelStatus, e?: Error) => void,
  ) {
    this.name = name;
    this.bindings = bindings;
    this.onChange = onChange;
    this.onStatus = onStatus;
  }

  status(s: ChannelStatus, error?: Error) {
    if (this.closed) return;
    this.subscribed = s === 'SUBSCRIBED';
    this.onStatus(s, error);
  }

  deliver(payload: ChangePayload) {
    if (this.closed || !this.subscribed) return;
    if (this.bindings.some((b) => b.table === payload.table && (b.event === '*' || b.event === payload.eventType))) {
      this.onChange(payload);
    }
  }
}

function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const compareValues = (column: string, a: unknown, b: unknown): number => {
  const va = column === 'data_hora' || column === 'em' ? Date.parse(String(a)) : a;
  const vb = column === 'data_hora' || column === 'em' ? Date.parse(String(b)) : b;
  if (va === vb) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return (va as number | string) < (vb as number | string) ? -1 : 1;
};

export class FakeDb implements DbPort {
  readonly tables: Record<TableName, Row[]> = {
    pedidos_separados: [],
    logs_acesso: [],
    operadores_metas: [],
    configuracoes_gerais: [],
    usuarios_painel: [],
    metas_programadas: [],
    config_previsao: [],
    membros: [],
    auditoria: [],
  };
  readonly selects: SelectQuery[] = [];
  /** toda gravação recebida, na ordem */
  readonly writes: WriteQuery[] = [];
  /** o cliente tem sessão de login? (padrão: sim) */
  session = true;
  /** vezes que hasSession foi consultado */
  sessionChecks = 0;
  /** erro lançado pela próxima gravação (objeto do PostgREST, como `{ code: '42501' }`) */
  writeError: unknown = null;
  /** imita o RLS que barra update/delete: nenhuma linha afetada, sem erro */
  rlsBlocksWrites = false;
  /** respostas das funções do banco, por nome (rpc sem entrada devolve nenhuma linha) */
  readonly rpcResults: Record<string, Row[]> = {};
  readonly rpcCalls: { fn: string; args: Row }[] = [];
  /** erro lançado pela próxima rpc */
  rpcError: unknown = null;
  /** chamadas de Edge Function, na ordem */
  readonly invocations: { name: string; body: Row }[] = [];
  /** resposta da próxima Edge Function */
  invokeResult: unknown = {};
  /** erro lançado pela próxima Edge Function */
  invokeError: unknown = null;
  readonly channels: FakeChannel[] = [];
  /** quantas das próximas consultas falham */
  failNext = 0;
  /** chamado depois de cada consulta, antes da resposta (inserir no meio da carga) */
  afterSelect: ((q: SelectQuery) => void) | null = null;
  /** relógio do servidor = relógio local + isto (null = a resposta não traz `Date`) */
  serverOffsetMs: number | null = null;
  private lastClock: ServerClockSample | null = null;
  private readonly random = makeRandom(42);

  async select(q: SelectQuery): Promise<Row[]> {
    this.selects.push(q);
    await Promise.resolve();
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new TypeError('Failed to fetch');
    }
    let rows = this.tables[q.table].filter((r) => {
      if (q.eq && r[q.eq.column] !== q.eq.value) return false;
      if (q.gte && compareValues(q.gte.column, r[q.gte.column], q.gte.value) < 0) return false;
      if (q.lt && compareValues(q.lt.column, r[q.lt.column], q.lt.value) >= 0) return false;
      return true;
    });
    // embaralha e ordena de forma estável: empate fica em ordem aleatória
    rows = rows
      .map((r) => ({ r, k: this.random() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
    const order = q.order ?? [];
    rows.sort((a, b) => {
      for (const o of order) {
        const c = compareValues(o.column, a[o.column], b[o.column]);
        if (c !== 0) return o.ascending ? c : -c;
      }
      return 0;
    });
    if (q.range) rows = rows.slice(q.range.from, q.range.to + 1);
    const out = rows.map((r) => ({ ...r }));
    if (this.serverOffsetMs != null) this.lastClock = { serverMs: Date.now() + this.serverOffsetMs, localMs: Date.now() };
    this.afterSelect?.(q);
    return out;
  }

  async rpc(fn: string, args: Row = {}): Promise<Row[]> {
    this.rpcCalls.push({ fn, args });
    await Promise.resolve();
    if (this.rpcError != null) {
      const e = this.rpcError;
      this.rpcError = null;
      throw e;
    }
    return (this.rpcResults[fn] ?? []).map((r) => ({ ...r }));
  }

  async invoke(name: string, body: Row): Promise<unknown> {
    this.invocations.push({ name, body });
    await Promise.resolve();
    if (this.invokeError != null) {
      const e = this.invokeError;
      this.invokeError = null;
      throw e;
    }
    return this.invokeResult;
  }

  async hasSession(): Promise<boolean> {
    this.sessionChecks += 1;
    return this.session;
  }

  async write(q: WriteQuery): Promise<Row[]> {
    this.writes.push(q);
    await Promise.resolve();
    if (this.writeError != null) {
      const e = this.writeError;
      this.writeError = null;
      throw e;
    }
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new TypeError('Failed to fetch');
    }
    const rows = this.tables[q.table];
    const matches = (r: Row) =>
      (!q.eq || r[q.eq.column] === q.eq.value) && (!q.in || q.in.values.includes(r[q.in.column] as string | number));
    const incoming = q.values == null ? [] : Array.isArray(q.values) ? q.values : [q.values];
    if (q.action === 'insert') {
      for (const v of incoming) rows.push({ ...v });
      return incoming.map((v) => ({ ...v }));
    }
    if (q.action === 'upsert') {
      const key = q.onConflict ?? 'id';
      const out: Row[] = [];
      for (const v of incoming) {
        const hit = rows.find((r) => r[key] === v[key]);
        if (hit) Object.assign(hit, v);
        else rows.push({ ...v });
        out.push({ ...(hit ?? v) });
      }
      return out;
    }
    if (this.rlsBlocksWrites) return [];
    if (q.action === 'update') {
      const hit = rows.filter(matches);
      for (const r of hit) Object.assign(r, incoming[0] ?? {});
      return hit.map((r) => ({ ...r }));
    }
    const removed = rows.filter(matches);
    this.tables[q.table] = rows.filter((r) => !matches(r));
    return removed.map((r) => ({ ...r }));
  }

  serverClock(): ServerClockSample | null {
    return this.lastClock;
  }

  openChannel(
    spec: { name: string; bindings: ChannelBinding[] },
    onChange: (p: ChangePayload) => void,
    onStatus: (s: ChannelStatus, e?: Error) => void,
  ) {
    const ch = new FakeChannel(spec.name, spec.bindings, onChange, onStatus);
    this.channels.push(ch);
    return {
      close: () => {
        ch.closed = true;
      },
    };
  }

  /** Grava no banco falso e entrega aos canais assinados (como o Realtime). */
  insert(table: TableName, row: Row, options: { deliver?: boolean } = {}) {
    this.tables[table].push(row);
    if (options.deliver === false) return;
    for (const ch of this.channels) ch.deliver({ table, eventType: 'INSERT', new: { ...row }, old: {} });
  }

  update(table: TableName, row: Row) {
    for (const ch of this.channels) ch.deliver({ table, eventType: 'UPDATE', new: { ...row }, old: {} });
  }

  openChannels(prefix: string): FakeChannel[] {
    return this.channels.filter((c) => !c.closed && c.name.startsWith(prefix));
  }

  lastChannel(prefix: string): FakeChannel {
    const list = this.channels.filter((c) => c.name.startsWith(prefix));
    const last = list[list.length - 1];
    if (!last) throw new Error(`nenhum canal ${prefix}`);
    return last;
  }

  selectsOn(table: TableName): number {
    return this.selects.filter((q) => q.table === table).length;
  }
}
