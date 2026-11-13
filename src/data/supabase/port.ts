/**
 * Porta mínima entre a fonte de dados e o cliente Supabase.
 *
 * A fonte (source.ts) só conhece esta interface: consulta paginável e canal
 * realtime. Isso permite testar toda a lógica de concorrência com um banco
 * falso (fake-db.ts) e mantém o SDK confinado a este arquivo.
 *
 * Gravação: uma única operação, `write`, que sempre devolve as linhas afetadas
 * (`.select()`): update que o RLS barra não dá erro, devolve zero linhas, e é
 * assim que a fonte percebe.
 *
 * Além disso, duas chamadas que não são de tabela: `rpc` (função do banco que
 * devolve linhas, ex.: listar_usuarios_painel) e `invoke` (Edge Function, ex.:
 * `usuarios`, que cria a conta no Auth com a chave de serviço, que o navegador
 * nunca tem).
 */
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

export type TableName =
  | 'pedidos_separados'
  | 'logs_acesso'
  | 'operadores_metas'
  | 'configuracoes_gerais'
  | 'usuarios_painel'
  | 'metas_programadas'
  | 'config_previsao'
  | 'membros'
  | 'auditoria';

export type Row = Record<string, unknown>;

export interface SelectQuery {
  table: TableName;
  columns: string;
  eq?: { column: string; value: string | number };
  /** inclusive */
  gte?: { column: string; value: string };
  /** exclusivo */
  lt?: { column: string; value: string };
  order?: { column: string; ascending: boolean }[];
  /** inclusive nos dois lados, como o `.range()` do PostgREST */
  range?: { from: number; to: number };
}

export interface WriteQuery {
  table: TableName;
  action: 'update' | 'insert' | 'upsert' | 'delete';
  /** colunas a gravar (update/insert/upsert) */
  values?: Row | Row[];
  eq?: { column: string; value: string | number };
  in?: { column: string; values: (string | number)[] };
  /** coluna da chave no upsert */
  onConflict?: string;
  /** a gravação é o "desfazer" de um toast: cabeçalho `x-hope-acao: desfazer` (rótulo da auditoria, migration 0002) */
  undo?: boolean;
}

export interface ChannelBinding {
  table: TableName;
  event: 'INSERT' | '*';
}

export interface ChangePayload {
  table: TableName;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Row;
  old: Row;
}

/**
 * Estados do canal. `UNAVAILABLE` é nosso: o servidor recusou as tabelas
 * (Realtime desligado para elas). Não adianta tentar de novo; a fonte passa a
 * consultar periodicamente.
 */
export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'UNAVAILABLE';

export interface ChannelHandle {
  /** Idempotente. Depois de fechado, nenhum callback é chamado. */
  close(): void;
}

export interface DbPort {
  /** Lança erro em falha de rede ou do PostgREST. */
  select(query: SelectQuery): Promise<Row[]>;
  /** Devolve as linhas afetadas. Lança erro do PostgREST (com `code`) ou de rede. */
  write(query: WriteQuery): Promise<Row[]>;
  /** Chama uma função do banco e devolve as linhas. Lança o erro do PostgREST (com `code`) ou de rede. */
  rpc(fn: string, args?: Row): Promise<Row[]>;
  /**
   * Chama uma Edge Function e devolve o corpo da resposta. Erro HTTP lança `Error` com o campo
   * `erro` do corpo JSON (já em português); erro de rede lança o erro original.
   */
  invoke(name: string, body: Row): Promise<unknown>;
  /** true se o cliente tem sessão de login (Supabase Auth). O cliente anônimo do preview de dados reais não tem. */
  hasSession(): Promise<boolean>;
  openChannel(
    spec: { name: string; bindings: ChannelBinding[] },
    onChange: (payload: ChangePayload) => void,
    onStatus: (status: ChannelStatus, error?: Error) => void,
  ): ChannelHandle;
  /**
   * Relógio do servidor visto na resposta mais recente (cabeçalho `Date` do
   * PostgREST), com o relógio local no mesmo instante. null = ainda não houve
   * resposta. Opcional: sem ele, a fonte confia só no relógio local.
   */
  serverClock?(): ServerClockSample | null;
}

export interface ServerClockSample {
  /** `Date` da resposta, em ms (precisão de 1 s) */
  serverMs: number;
  /** relógio local quando a resposta chegou */
  localMs: number;
}

/** Tempo máximo de uma página. O antigo usava 6 s; aqui há folga para rede ruim do galpão. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Mensagens do servidor que significam "esta tabela não está no Realtime". */
const UNAVAILABLE_PATTERN = /RealtimeDisabledForConfiguration|Unable to subscribe to changes/i;

export function isUnavailableError(message: string | undefined | null): boolean {
  return Boolean(message && UNAVAILABLE_PATTERN.test(message));
}

/** Erro HTTP de Edge Function → Error com a mensagem `erro` do corpo (português). */
async function httpErrorOf(error: FunctionsHttpError): Promise<Error> {
  try {
    const body = (await (error.context as Response).json()) as { erro?: unknown } | null;
    if (body && typeof body.erro === 'string' && body.erro.trim()) return new Error(body.erro);
  } catch {
    // corpo que não é JSON: cai na mensagem padrão abaixo
  }
  return new Error('O servidor recusou o pedido. Tente de novo.');
}

export interface SupabasePortDeps {
  /** só para testes */
  fetch?: typeof fetch;
  /** só para testes */
  now?: () => number;
}

export function createSupabasePort(client: SupabaseClient, deps: SupabasePortDeps = {}): DbPort {
  let lastClock: ServerClockSample | null = null;
  const now = deps.now ?? (() => Date.now());
  // fetch por consulta (API pública do supabase-js; a autenticação do cliente
  // continua aplicada por cima): só lê o `Date`, que o Supabase expõe no CORS.
  const observingFetch: typeof fetch = async (input, init) => {
    const res = await (deps.fetch ?? fetch)(input, init);
    const serverMs = Date.parse(res.headers.get('date') ?? '');
    if (Number.isFinite(serverMs)) lastClock = { serverMs, localMs: now() };
    return res;
  };
  return {
    serverClock: () => lastClock,

    async select(q) {
      let builder = client.from(q.table, { fetch: observingFetch }).select(q.columns);
      if (q.eq) builder = builder.eq(q.eq.column, q.eq.value);
      if (q.gte) builder = builder.gte(q.gte.column, q.gte.value);
      if (q.lt) builder = builder.lt(q.lt.column, q.lt.value);
      for (const o of q.order ?? []) builder = builder.order(o.column, { ascending: o.ascending });
      if (q.range) builder = builder.range(q.range.from, q.range.to);
      const { data, error } = await builder.abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },

    async hasSession() {
      const { data, error } = await client.auth.getSession();
      return !error && Boolean(data.session);
    },

    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args ?? {}).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (error) throw error;
      if (data == null) return [];
      return (Array.isArray(data) ? data : [data]) as unknown as Row[];
    },

    async invoke(name, body) {
      const { data, error } = await client.functions.invoke(name, { body });
      if (error) {
        if (error instanceof FunctionsHttpError) throw await httpErrorOf(error);
        throw error;
      }
      return data;
    },

    async write(q) {
      // update e delete sem filtro alcançariam a tabela inteira: nunca é o que a fonte quer.
      if ((q.action === 'update' || q.action === 'delete') && !q.eq && !q.in?.values.length) {
        throw new Error(`Gravação recusada: ${q.action} em ${q.table} sem filtro.`);
      }
      const table = client.from(q.table, { fetch: observingFetch });
      const values = q.values ?? {};
      let builder =
        q.action === 'update'
          ? table.update(values as Row)
          : q.action === 'insert'
            ? table.insert(values)
            : q.action === 'upsert'
              ? table.upsert(values, q.onConflict ? { onConflict: q.onConflict } : undefined)
              : table.delete();
      if (q.eq) builder = builder.eq(q.eq.column, q.eq.value);
      if (q.in) builder = builder.in(q.in.column, q.in.values);
      let returning = builder.select();
      if (q.undo) returning = returning.setHeader('x-hope-acao', 'desfazer');
      const { data, error } = await returning.abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },

    openChannel(spec, onChange, onStatus) {
      let closed = false;
      // `wait: true`: SUBSCRIBED só chega quando a replicação já está ativa,
      // e tabela fora do Realtime vira CHANNEL_ERROR em vez de silêncio.
      let channel = client.channel(spec.name, { config: { postgres_changes_options: { wait: true } } });
      for (const b of spec.bindings) {
        const filter = { schema: 'public', table: b.table };
        const handler = (p: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: object; old: object }) => {
          if (closed) return;
          onChange({ table: b.table, eventType: p.eventType, new: p.new as Row, old: p.old as Row });
        };
        channel =
          b.event === 'INSERT'
            ? channel.on('postgres_changes', { ...filter, event: 'INSERT' }, handler)
            : channel.on('postgres_changes', { ...filter, event: '*' }, handler);
      }
      // Rede de segurança: servidor sem `wait` responde SUBSCRIBED e depois
      // manda o erro como mensagem de sistema (foi o que o banco real fez).
      channel = channel.on('system', {}, (p: { status?: string; extension?: string; message?: string }) => {
        if (closed) return;
        if (p.status === 'error' && p.extension === 'postgres_changes') {
          onStatus(isUnavailableError(p.message) ? 'UNAVAILABLE' : 'CHANNEL_ERROR', new Error(p.message ?? 'erro do realtime'));
        }
      });
      channel.subscribe((status, err) => {
        if (closed) return;
        if (status === 'CHANNEL_ERROR' && isUnavailableError(err?.message)) onStatus('UNAVAILABLE', err);
        else onStatus(status, err);
      });
      return {
        close() {
          if (closed) return;
          closed = true;
          void client.removeChannel(channel);
        },
      };
    },
  };
}
