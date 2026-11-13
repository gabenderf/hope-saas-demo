/**
 * Fonte de dados REAL (Supabase). Leitura sempre; gravação só com `canWrite` e sessão (ver "Gravação" em docs/dados-supabase.md).
 *
 * Três camadas, cada uma com uma regra simples:
 *  1. HOJE: armazém em memória (DayStore) = carga completa + inserts ao vivo,
 *     unidos por id. Enquanto estiver em dia, getDayEvents(hoje) não vai ao
 *     banco: o hook invalida a tela a cada bipe e isso não pode virar 1.000
 *     linhas a cada 3 s.
 *  2. DIAS FECHADOS: agregados (mesma fórmula da tela, src/lib/metrics.ts) no
 *     localStorage, buscados em blocos de vários dias com concorrência
 *     limitada e sem carga duplicada para o mesmo dia.
 *  3. AO VIVO: dois alimentadores (feed.ts), um para bipagens e acessos,
 *     outro para operadores e meta global. Realtime quando o banco publica as
 *     tabelas, consulta periódica quando não publica.
 *
 * Corridas tratadas (cada uma tem teste em source.test.ts):
 *  - evento que chega durante a carga inicial: nem duplica nem se perde;
 *  - evento de outro dia: descartado;
 *  - lacuna (canal caiu, navegador offline): ao voltar, recarrega o dia e emite 'resync';
 *  - virada do dia em São Paulo: armazém novo, carga nova, 'resync';
 *  - duas telas pedindo o mesmo período ao mesmo tempo: uma carga só;
 *  - relógio do navegador adiantado: o dia de hoje (ainda parcial) nunca vai
 *    para o cache de dias fechados.
 *
 * DIA FECHADO (o único que vai para o localStorage, e para sempre): anterior a
 * ONTEM pelo relógio de referência. O relógio de referência é o local, a não
 * ser que o servidor (cabeçalho `Date` do PostgREST) diga que ele está mais de
 * 10 min errado; aí vale o do servidor. Ontem e hoje são recalculados (ontem
 * fica alguns minutos em memória). Uma TV com o relógio duas horas adiantado
 * já gravou, na regra antiga, o hoje real pela metade como "fechado".
 *
 * Detalhes e limites: docs/dados-supabase.md.
 */
import { aggregateDay, aggregateSkusOfDay, aggregateToday, DEFAULT_INDIVIDUAL_GOAL } from '@/lib/metrics';
import { addDays, dayBounds, dayKeyOf, daysBetween, todayKey, type DayKey } from '@/lib/time';
import type { Role } from '@/auth/types';
import { currentUndo } from '../assemble/undo';
import type {
  Actor,
  AuditEntry,
  ConnectionState,
  DailyOperatorAggregate,
  DailySkuAggregate,
  DayEvents,
  GeneralConfig,
  GoalScheduleEntry,
  LiveEvent,
  Operator,
  OperatorInput,
  OperationsSource,
  PanelUser,
} from '../types';
import { ClosedDayCache, type DayAggregates } from './day-cache';
import { DayStore } from './day-store';
import { AUDIT_COLUMNS, toAuditEntry } from './audit';
import { accessDenied, DataLoadError, friendly, friendlyWrite, ReadOnlyError, WriteError } from './errors';
import { Feed } from './feed';
import type { ChangePayload, DbPort, Row, WriteQuery } from './port';
import { fetchAccessBetween, fetchDayEvents, fetchDaysEvents, fetchScansBetween, selectAllPages } from './queries';
import {
  CONFIG_COLUMNS,
  GOAL_SCHEDULE_COLUMNS,
  OPERATOR_COLUMNS,
  PANEL_USER_COLUMNS,
  mapRows,
  toAccess,
  toConfig,
  toGoalScheduleEntry,
  toOperator,
  toPanelUser,
  toPanelUserFromRpc,
  toScan,
} from './rows';

export interface SupabaseSourceOptions {
  /** consulta periódica de bipagens quando o Realtime não está disponível */
  eventsPollMs: number;
  /** operadores e meta global (a extensão também lê a cada 60 s) */
  settingsPollMs: number;
  /** dias por consulta na carga de dias fechados */
  blockDays: number;
  /** consultas de bloco ao mesmo tempo */
  concurrency: number;
  /** conferência da virada do dia */
  dayCheckMs: number;
  /** dias passados com eventos crus em memória */
  pastDaysInMemory: number;
  /** quanto a consulta incremental volta no tempo (transação longa grava data_hora antes de aparecer) */
  pollOverlapMs: number;
  /** canal sem resposta depois disto: consulta enquanto espera (feed.ts, "ponte") */
  channelWaitMs: number;
  /** dia passado AINDA NÃO FECHADO (ontem) vale este tempo em memória */
  recentDayTtlMs: number;
  /** diferença entre relógio local e do servidor acima disto: decide pelo do servidor */
  clockSkewToleranceMs: number;
}

export const DEFAULT_OPTIONS: SupabaseSourceOptions = {
  eventsPollMs: 10_000,
  settingsPollMs: 60_000,
  blockDays: 7,
  concurrency: 3,
  dayCheckMs: 30_000,
  pastDaysInMemory: 7,
  pollOverlapMs: 120_000,
  channelWaitMs: 1_500,
  recentDayTtlMs: 5 * 60_000,
  clockSkewToleranceMs: 10 * 60_000,
};

export interface NetworkWatch {
  isOnline(): boolean;
  /** recebe 'online' e 'offline' (no navegador, `window`) */
  target: EventTarget | null;
}

export interface SupabaseSourceDeps {
  port: DbPort;
  /** identifica o projeto no cache local (a URL do Supabase) */
  scope: string;
  storage?: Storage | null;
  now?: () => Date;
  network?: NetworkWatch;
  random?: () => number;
  options?: Partial<SupabaseSourceOptions>;
  /**
   * Liberação explícita de gravação. Padrão false. O chamador só passa true com login de
   * verdade; a fonte ainda confere a sessão do cliente a cada gravação.
   */
  canWrite?: boolean;
}

export type LiveMode = 'realtime' | 'polling' | 'idle';

export interface SupabaseOperationsSource extends OperationsSource {
  /** 'polling' = o banco não publica as tabelas no Realtime; os dados chegam por consulta a cada 10 s. */
  liveMode(): LiveMode;
  /** Apaga o cache local de dias fechados (botão "recarregar"). */
  clearCache(): void;
}

interface Listener {
  fn: (event: LiveEvent) => void;
}

const browserNetwork: NetworkWatch = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  target: typeof window !== 'undefined' ? window : null,
};

/** Operadores mínimos para agregar um dia: o agregado só usa o id, e só entra quem bipou. */
function operatorsFromScans(events: Pick<DayEvents, 'scans'>): Operator[] {
  const ids = [...new Set(events.scans.map((s) => s.operatorId))].sort();
  return ids.map((id) => ({ id, name: id, individualGoal: DEFAULT_INDIVIDUAL_GOAL, registration: 'ativo' }));
}

export function aggregateEvents(day: DayKey, events: Pick<DayEvents, 'scans' | 'access'>): DayAggregates {
  return {
    operators: aggregateDay(day, operatorsFromScans(events), events),
    skus: aggregateSkusOfDay(day, events.scans),
  };
}

/**
 * HOJE com a MESMA regra da Visão Geral: computeOperatorDay(op, eventos, agora),
 * fim = agora para quem está ativo, cadastro inativo congela na última
 * atividade. aggregateDay (dia fechado) congelaria todo mundo e o ritmo de hoje
 * do relatório não bateria com o da Visão Geral no mesmo instante.
 *
 * Operadores: o cadastro como está (com o status dele) e, além dele, quem bipou
 * sem cadastro (como nos dias fechados; a tela filtra pelo cadastro se quiser).
 */
export function aggregateTodayEvents(
  day: DayKey,
  registered: Operator[],
  events: Pick<DayEvents, 'scans' | 'access'>,
  now: Date,
): DayAggregates {
  const known = new Set(registered.map((o) => o.id));
  const operators = [...registered, ...operatorsFromScans(events).filter((o) => !known.has(o.id))];
  return {
    operators: aggregateToday(day, operators, events, now),
    skus: aggregateSkusOfDay(day, events.scans),
  };
}

/** Erro do PostgREST que significa "seu perfil não pode" (42501 / RLS). */
function isDenied(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === '42501' || (typeof message === 'string' && /row-level security/i.test(message));
}

/** Falha da Edge Function `usuarios`: mensagem do servidor (já em português) segue; rede vira mensagem amigável. */
function inviteError(e: unknown): Error {
  if (e instanceof ReadOnlyError || e instanceof WriteError || e instanceof DataLoadError) return e;
  console.error('[dados supabase] convidar usuário', e);
  if (e instanceof Error && !(e instanceof TypeError) && e.name === 'Error' && e.message) return e;
  return new DataLoadError(e);
}

const fingerprint = (value: unknown) => JSON.stringify(value);

const MAX_GOAL = 300;
const MAX_NOTE = 200;

/** Mesma faixa do CHECK do banco (1 a 300). */
function assertGoal(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_GOAL) {
    throw new Error(`Meta inválida: use um número inteiro entre 1 e ${MAX_GOAL}.`);
  }
}

export function createSupabaseSourceWith(deps: SupabaseSourceDeps): SupabaseOperationsSource {
  return new SupabaseSource(deps);
}

class SupabaseSource implements SupabaseOperationsSource {
  readonly mode = 'supabase' as const;
  readonly capabilities: OperationsSource['capabilities'];
  /** gravação liberada: só com login de verdade (VITE_AUTH_MODE=supabase); ver docs/dados-supabase.md, "Gravação" */
  private readonly canWrite: boolean;

  private readonly port: DbPort;
  private readonly clock: () => Date;
  private readonly network: NetworkWatch;
  private readonly opt: SupabaseSourceOptions;
  private readonly cache: ClosedDayCache;

  private readonly listeners = new Set<Listener>();
  private state: ConnectionState = 'connecting';
  /** muda a cada start/stop: carga que começou noutra "vida" não grava no armazém */
  private run = 0;
  private store: DayStore;
  private syncing: Promise<void> | null = null;
  /** a tela pode estar com dado incompleto: avisar 'resync' quando voltar a ficar em dia */
  private needsResync = false;
  private dayTimer: ReturnType<typeof setInterval> | null = null;

  private readonly eventsFeed: Feed;
  private readonly settingsFeed: Feed;
  private operatorsCache: { list: Operator[]; fp: string } | null = null;
  private configCache: { config: GeneralConfig; fp: string } | null = null;

  private readonly todayInflight = new Map<DayKey, Promise<DayEvents>>();
  private readonly pastInflight = new Map<DayKey, Promise<DayEvents>>();
  /** eventos crus de dias passados; `closed` = já era dia fechado quando foi lido */
  private readonly pastDays = new Map<DayKey, { events: DayEvents; closed: boolean; at: number }>();
  /** agregados de dias passados ainda não fechados (ontem): só memória, com validade */
  private readonly recentAggs = new Map<DayKey, { agg: DayAggregates; at: number }>();
  private readonly closedInflight = new Map<DayKey, Promise<DayAggregates>>();
  private skewWarned = false;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(deps: SupabaseSourceDeps) {
    this.port = deps.port;
    this.canWrite = deps.canWrite === true;
    this.capabilities = {
      write: this.canWrite,
      audit: this.canWrite,
      realtime: true,
      goalSchedule: this.canWrite,
      userManagement: this.canWrite,
    };
    this.clock = deps.now ?? (() => new Date());
    this.network = deps.network ?? browserNetwork;
    this.opt = { ...DEFAULT_OPTIONS, ...deps.options };
    this.cache = new ClosedDayCache({ scope: deps.scope, storage: deps.storage ?? null });
    this.store = new DayStore(this.today());

    this.eventsFeed = new Feed({
      name: 'hope-expedicao-eventos',
      port: this.port,
      bindings: [
        { table: 'pedidos_separados', event: 'INSERT' },
        { table: 'logs_acesso', event: 'INSERT' },
      ],
      pollIntervalMs: this.opt.eventsPollMs,
      channelWaitMs: this.opt.channelWaitMs,
      random: deps.random,
      onChange: (p) => this.onEventChange(p),
      onUp: async () => {
        this.checkDay();
        await this.syncToday();
      },
      poll: async () => {
        this.checkDay();
        if (this.store.synced) await this.pollIncrement();
        else await this.syncToday();
      },
      onLive: () => {
        this.setState('live');
        this.flushResync();
      },
      onDown: () => {
        this.store.markGap();
        this.needsResync = true;
        this.setState(this.network.isOnline() ? 'reconnecting' : 'offline');
      },
    });

    this.settingsFeed = new Feed({
      name: 'hope-expedicao-cadastro',
      port: this.port,
      bindings: [
        { table: 'operadores_metas', event: '*' },
        { table: 'configuracoes_gerais', event: '*' },
      ],
      pollIntervalMs: this.opt.settingsPollMs,
      channelWaitMs: this.opt.channelWaitMs,
      random: deps.random,
      onChange: (p) => this.onSettingsChange(p),
      onUp: () => this.refreshSettings(),
      poll: () => this.refreshSettings(),
      onLive: () => undefined,
      onDown: () => undefined,
    });
  }

  now(): Date {
    return this.clock();
  }

  liveMode(): LiveMode {
    return this.listeners.size ? this.eventsFeed.mode : 'idle';
  }

  clearCache(): void {
    this.cache.clear();
    this.pastDays.clear();
    this.recentAggs.clear();
  }

  /* ---------------- leitura ---------------- */

  async listOperators(): Promise<Operator[]> {
    if (this.settingsFeed.up && this.operatorsCache) return [...this.operatorsCache.list];
    try {
      const list = await this.fetchOperators();
      this.operatorsCache = { list, fp: fingerprint(list) };
      return [...list];
    } catch (e) {
      throw friendly('carregar operadores', e);
    }
  }

  async getConfig(): Promise<GeneralConfig> {
    if (this.settingsFeed.up && this.configCache) return { ...this.configCache.config };
    try {
      const config = await this.fetchConfig();
      this.configCache = { config, fp: fingerprint(config) };
      return { ...config };
    } catch (e) {
      throw friendly('carregar a meta global', e);
    }
  }

  async getDayEvents(day: DayKey): Promise<DayEvents> {
    this.checkDay();
    const today = this.store.day;
    if (day > today) return { day, scans: [], access: [] };
    if (day === today) return this.todayEvents();
    return this.pastDayEvents(day);
  }

  async getDailyAggregates(from: DayKey, to: DayKey): Promise<DailyOperatorAggregate[]> {
    const days = await this.collect(from, to);
    return days.flatMap((d) => d.operators);
  }

  async getDailySkuAggregates(from: DayKey, to: DayKey): Promise<DailySkuAggregate[]> {
    const days = await this.collect(from, to);
    return days.flatMap((d) => d.skus);
  }

  /**
   * Histórico (`auditoria`, escrita pelo gatilho do banco). Sem `canWrite` não consulta: o preview
   * de dados reais fala com a produção, onde a tabela não existe.
   * `before` = instante (`at`) da entrada mais antiga já vista; traz as anteriores a ele.
   */
  async listAudit(options: { limit: number; before?: string }): Promise<AuditEntry[]> {
    if (!this.canWrite) return [];
    const limit = Math.max(1, Math.floor(options.limit));
    try {
      const rows = await this.port.select({
        table: 'auditoria',
        columns: AUDIT_COLUMNS,
        ...(options.before ? { lt: { column: 'em', value: options.before } } : {}),
        order: [
          { column: 'em', ascending: false },
          { column: 'id', ascending: false },
        ],
        range: { from: 0, to: limit - 1 },
      });
      return mapRows(rows, toAuditEntry);
    } catch (e) {
      if (isDenied(e)) throw accessDenied();
      throw friendly('carregar o histórico', e);
    }
  }

  /** Agenda de metas (`metas_programadas`). Sem login de verdade não há leitura: o SELECT é só de quem tem sessão. */
  async listGoalSchedule(from: DayKey, to: DayKey): Promise<GoalScheduleEntry[]> {
    if (!this.canWrite) return [];
    try {
      const rows = await this.port.select({
        table: 'metas_programadas',
        columns: GOAL_SCHEDULE_COLUMNS,
        gte: { column: 'dia', value: from },
        lt: { column: 'dia', value: addDays(to, 1) },
        order: [{ column: 'dia', ascending: true }],
      });
      return mapRows(rows, toGoalScheduleEntry);
    } catch (e) {
      throw friendly('carregar a agenda de metas', e);
    }
  }

  async listPanelUsers(): Promise<PanelUser[]> {
    // sem login de verdade (preview de dados reais): a tabela antiga, como sempre foi
    if (!this.canWrite) return this.listLegacyPanelUsers();
    try {
      const rows = await this.port.rpc('listar_usuarios_painel');
      return mapRows(rows, toPanelUserFromRpc);
    } catch (e) {
      if (isDenied(e)) throw accessDenied();
      throw friendly('carregar usuários do painel', e);
    }
  }

  private async listLegacyPanelUsers(): Promise<PanelUser[]> {
    try {
      const rows = await this.port.select({
        table: 'usuarios_painel',
        columns: PANEL_USER_COLUMNS,
        order: [{ column: 'username', ascending: true }],
      });
      return mapRows(rows, toPanelUser);
    } catch (e) {
      throw friendly('carregar usuários do painel', e);
    }
  }

  /* ---------------- gravação ---------------- */

  /**
   * Trava de segurança dentro da fonte (a UI já desliga os controles por
   * `capabilities.write`): sem `canWrite` ou sem sessão de login, nada vai ao
   * banco. O preview de dados reais usa login de demonstração sobre a produção,
   * onde a anon key ainda consegue gravar; aqui isso nunca acontece.
   */
  private async assertCanWrite(): Promise<void> {
    if (!this.canWrite) throw new ReadOnlyError();
    const session = await this.port.hasSession().catch(() => false);
    if (!session) throw new ReadOnlyError();
  }

  /** Grava e devolve as linhas afetadas; erro do banco vira mensagem amigável. */
  private async write(context: string, query: WriteQuery): Promise<Row[]> {
    try {
      return await this.port.write(query);
    } catch (e) {
      throw friendlyWrite(context, e);
    }
  }

  async setGlobalGoal(value: number | null): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    if (value != null) assertGoal(value);
    await this.assertCanWrite();
    const rows = await this.write('gravar a meta global', {
      table: 'configuracoes_gerais',
      action: 'update',
      values: { meta_horaria_global: value, atualizado_em: this.clock().toISOString() },
      eq: { column: 'id', value: 1 },
      undo: Boolean(undo),
    });
    if (rows.length !== 1) throw accessDenied();
    const config = toConfig(rows[0]);
    this.configCache = { config, fp: fingerprint(config) };
    this.emit({ type: 'config-changed', config: { ...config } });
  }

  async setIndividualGoals(operatorIds: string[], value: number): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    assertGoal(value);
    const ids = [...new Set(operatorIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) throw new Error('Escolha ao menos um operador.');
    await this.assertCanWrite();
    const rows = await this.write('gravar a meta individual', {
      table: 'operadores_metas',
      action: 'update',
      values: { meta_horaria: value },
      in: { column: 'id_operador', values: ids },
      undo: Boolean(undo),
    });
    if (rows.length === 0) throw accessDenied();
    if (rows.length < ids.length) {
      // Os encontrados já foram gravados: a lista precisa mostrar isso antes do erro.
      this.operatorsChanged();
      const found = new Set(rows.map((r) => String(r.id_operador)));
      throw new Error(
        `A meta foi gravada para ${rows.length} de ${ids.length} operadores. Operador ${ids.find((id) => !found.has(id))} não encontrado.`,
      );
    }
    this.operatorsChanged();
  }

  async saveOperator(input: OperatorInput): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    const id = input.id.trim();
    const name = input.name.trim();
    if (!id) throw new Error('Informe o ID do operador.');
    if (!name) throw new Error('Informe o nome do operador.');
    assertGoal(input.individualGoal);
    await this.assertCanWrite();
    let existing: Row[];
    try {
      existing = await this.port.select({
        table: 'operadores_metas',
        columns: 'id_operador',
        eq: { column: 'id_operador', value: id },
      });
    } catch (e) {
      throw friendlyWrite('conferir o operador', e);
    }
    const rows = existing.length
      ? await this.write('editar o operador', {
          table: 'operadores_metas',
          action: 'update',
          values: { nome_colaborador: name, meta_horaria: input.individualGoal },
          eq: { column: 'id_operador', value: id },
          undo: Boolean(undo),
        })
      : await this.write('cadastrar o operador', {
          table: 'operadores_metas',
          action: 'insert',
          values: { id_operador: id, nome_colaborador: name, meta_horaria: input.individualGoal, status: 'ativo' },
          undo: Boolean(undo),
        });
    if (rows.length !== 1) throw accessDenied();
    this.operatorsChanged();
  }

  async setOperatorRegistration(id: string, registration: Operator['registration']): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    if (!id.trim()) throw new Error('Informe o ID do operador.');
    await this.assertCanWrite();
    const rows = await this.write('mudar o cadastro do operador', {
      table: 'operadores_metas',
      action: 'update',
      values: { status: registration },
      eq: { column: 'id_operador', value: id.trim() },
      undo: Boolean(undo),
    });
    if (rows.length !== 1) throw accessDenied();
    this.operatorsChanged();
  }

  async setGoalSchedule(day: DayKey, value: number | null, _actor?: Actor, note?: string): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    if (value != null) assertGoal(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Dia inválido.');
    // Desfazer devolve um estado que já existiu: não barra quem desfaz depois da meia-noite a
    // entrada que era "amanhã" (o RLS permite).
    if (!undo && day <= todayKey(this.clock())) {
      throw new Error('Só dá para programar a meta a partir de amanhã. A meta de hoje se ajusta no cartão da meta global.');
    }
    const cleanNote = note?.trim() ? note.trim() : null;
    if (cleanNote && cleanNote.length > MAX_NOTE) throw new Error(`A nota pode ter até ${MAX_NOTE} caracteres.`);
    await this.assertCanWrite();
    if (undo?.restoreAbsent) {
      // desfazer uma entrada nova = removê-la; já não existir não é erro
      const removed = await this.write('remover a meta programada', {
        table: 'metas_programadas',
        action: 'delete',
        eq: { column: 'dia', value: day },
        undo: true,
      });
      // 0 linhas pode ser "já não existia" ou o RLS barrando sem erro: só a releitura distingue.
      if (removed.length === 0) {
        let still: Row[];
        try {
          still = await this.port.select({ table: 'metas_programadas', columns: 'dia', eq: { column: 'dia', value: day } });
        } catch (e) {
          throw friendlyWrite('conferir a meta programada', e);
        }
        if (still.length > 0) throw accessDenied();
      }
    } else {
      const rows = await this.write('gravar a meta programada', {
        table: 'metas_programadas',
        action: 'upsert',
        values: { dia: day, valor: value, nota: cleanNote },
        onConflict: 'dia',
        undo: Boolean(undo),
      });
      if (rows.length !== 1) throw accessDenied();
    }
    this.emit({ type: 'goal-schedule-changed' });
  }

  /** O cadastro mudou: a lista volta do banco na próxima leitura. */
  private operatorsChanged() {
    this.operatorsCache = null;
    this.emit({ type: 'operators-changed' });
  }

  async invitePanelUser(input: { name: string; email: string; role: Role }, _actor?: Actor): Promise<void> {
    if (!this.canWrite) throw new ReadOnlyError();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name || !email.includes('@')) throw new Error('Informe nome e e-mail válidos.');
    await this.assertCanWrite();
    try {
      // a Edge Function cria a conta no Auth (chave de serviço) e grava `membros` com o JWT de quem convida
      await this.port.invoke('usuarios', { acao: 'convidar', nome: name, email, papel: input.role });
    } catch (e) {
      throw inviteError(e);
    }
    this.emit({ type: 'users-changed' });
  }

  async resendPanelUserInvite(id: string, _actor?: Actor): Promise<void> {
    if (!this.canWrite) throw new ReadOnlyError();
    if (!id.trim()) throw new Error('Usuário inválido.');
    await this.assertCanWrite();
    try {
      // a Edge Function confere permissão e situação da pessoa; nada muda no banco, então não há evento
      await this.port.invoke('usuarios', { acao: 'reenviar', user_id: id });
    } catch (e) {
      const err = inviteError(e);
      // Falha de rede aqui não é "não carregou": o e-mail pode ter saído antes da resposta se perder.
      if (err instanceof DataLoadError && !(e instanceof DataLoadError)) {
        throw new Error('Não deu para confirmar o envio. Confira com a pessoa antes de reenviar, porque cada reenvio invalida o link anterior.', {
          cause: e,
        });
      }
      throw err;
    }
  }

  async setPanelUserRole(id: string, role: Role, actor: Actor): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    if (id === actor.id) throw new Error('Você não pode mudar o próprio perfil.');
    await this.assertCanWrite();
    const rows = await this.write('mudar o perfil do usuário', {
      table: 'membros',
      action: 'update',
      values: { papel: role },
      eq: { column: 'user_id', value: id },
      undo: Boolean(undo),
    });
    if (rows.length !== 1) throw accessDenied();
    this.emit({ type: 'users-changed' });
  }

  async setPanelUserStatus(id: string, status: 'ativo' | 'desativado', actor: Actor): Promise<void> {
    const undo = currentUndo();
    if (!this.canWrite) throw new ReadOnlyError();
    if (id === actor.id) throw new Error('Você não pode desativar o próprio acesso.');
    await this.assertCanWrite();
    // 'convidado' não é coluna (sai de convite_pendente): desfazer a desativação de um convidado grava 'ativo' também
    const rows = await this.write('mudar o acesso do usuário', {
      table: 'membros',
      action: 'update',
      values: { status: undo?.restoreInvited ? 'ativo' : status },
      eq: { column: 'user_id', value: id },
      undo: Boolean(undo),
    });
    if (rows.length !== 1) throw accessDenied();
    this.emit({ type: 'users-changed' });
  }

  /* ---------------- assinatura ---------------- */

  subscribe(fn: (event: LiveEvent) => void): () => void {
    const entry: Listener = { fn };
    this.listeners.add(entry);
    if (this.listeners.size === 1) this.start();
    // estado atual para quem chegou agora (fora da pilha de quem assinou)
    queueMicrotask(() => {
      if (this.listeners.has(entry)) this.deliver(entry, { type: 'connection', state: this.state });
    });
    let cancelled = false;
    return () => {
      if (cancelled) return;
      cancelled = true;
      this.listeners.delete(entry);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start() {
    this.run += 1;
    this.state = this.network.isOnline() ? 'connecting' : 'offline';
    this.network.target?.addEventListener('online', this.handleOnline);
    this.network.target?.addEventListener('offline', this.handleOffline);
    this.dayTimer = setInterval(() => this.checkDay(), this.opt.dayCheckMs);
    this.eventsFeed.start();
    this.settingsFeed.start();
  }

  private stop() {
    this.run += 1;
    this.eventsFeed.stop();
    this.settingsFeed.stop();
    if (this.dayTimer != null) clearInterval(this.dayTimer);
    this.dayTimer = null;
    this.network.target?.removeEventListener('online', this.handleOnline);
    this.network.target?.removeEventListener('offline', this.handleOffline);
    // sem canal, o armazém deixa de ser garantido: próxima leitura vai ao banco
    this.store.markGap();
    this.syncing = null;
    this.needsResync = false;
    this.state = 'connecting';
  }

  private readonly handleOnline = () => {
    this.setState('reconnecting');
    this.eventsFeed.restart();
    this.settingsFeed.restart();
  };

  private readonly handleOffline = () => {
    this.store.markGap();
    this.needsResync = true;
    this.setState('offline');
  };

  private setState(state: ConnectionState) {
    if (state === this.state) return;
    this.state = state;
    this.emit({ type: 'connection', state });
  }

  private flushResync() {
    if (!this.needsResync) return;
    this.needsResync = false;
    this.emit({ type: 'resync' });
  }

  private emit(event: LiveEvent) {
    for (const entry of [...this.listeners]) this.deliver(entry, event);
  }

  private deliver(entry: Listener, event: LiveEvent) {
    try {
      entry.fn(event);
    } catch (e) {
      console.error('[dados supabase] ouvinte de evento ao vivo lançou erro', e);
    }
  }

  /* ---------------- hoje ---------------- */

  private today(): DayKey {
    return todayKey(this.clock());
  }

  /**
   * Relógio que decide o que é dia fechado: o local, a não ser que a última
   * resposta do servidor mostre que ele está mais de 10 min errado.
   */
  private referenceNow(): Date {
    const local = this.clock();
    const sample = this.port.serverClock?.();
    if (!sample) return local;
    const offset = sample.serverMs - sample.localMs;
    if (Math.abs(offset) <= this.opt.clockSkewToleranceMs) return local;
    if (!this.skewWarned) {
      this.skewWarned = true;
      console.warn(
        `[dados supabase] relógio deste aparelho difere do servidor em ${Math.round(offset / 60_000)} min; dias fechados decididos pelo relógio do servidor.`,
      );
    }
    return new Date(local.getTime() + offset);
  }

  /** Dia fechado = anterior a ONTEM. Ontem pode estar com o relógio errado; só dia fechado vai para o cache. */
  private isClosed(day: DayKey): boolean {
    return day < addDays(todayKey(this.referenceNow()), -1);
  }

  /** Troca o armazém quando o dia de São Paulo vira. Relógio voltando não desfaz a virada. */
  private checkDay() {
    const today = this.today();
    if (today <= this.store.day) return;
    this.store = new DayStore(today);
    this.syncing = null;
    if (!this.listeners.size) return;
    this.needsResync = true;
    if (this.eventsFeed.streaming) {
      // canal continua aberto: só falta a carga do dia novo
      this.syncToday().then(
        () => this.flushResync(),
        (e) => {
          console.error('[dados supabase] carga do dia novo falhou', e);
          this.eventsFeed.restart();
        },
      );
    }
    // no modo consulta, a próxima rodada vê o armazém vazio e faz a carga
  }

  private syncToday(): Promise<void> {
    const store = this.store;
    const run = this.run;
    const token = store.beginSync();
    const p = fetchDayEvents(this.port, store.day).then(
      (loaded) => {
        if (run !== this.run || store !== this.store) {
          store.abortSync(token);
          return;
        }
        store.commitSync(token, loaded);
      },
      (e: unknown) => {
        store.abortSync(token);
        throw e;
      },
    );
    this.syncing = p;
    const clear = () => {
      if (this.syncing === p) this.syncing = null;
    };
    p.then(clear, clear);
    return p;
  }

  /** Modo consulta: só o que entrou desde o último evento visto (com folga). */
  private async pollIncrement() {
    const store = this.store;
    const { start, end } = dayBounds(store.day);
    const latest = store.latest();
    const since = (iso: string | null) =>
      iso ? new Date(Math.max(start.getTime(), Date.parse(iso) - this.opt.pollOverlapMs)) : start;
    const [scans, access] = await Promise.all([
      fetchScansBetween(this.port, since(latest.scanAt), end),
      fetchAccessBetween(this.port, since(latest.accessAt), end),
    ]);
    if (store !== this.store) return;
    for (const s of scans) this.ingestScan(s);
    for (const a of access) this.ingestAccess(a);
  }

  private onEventChange(p: ChangePayload) {
    if (p.eventType !== 'INSERT') return;
    if (p.table === 'pedidos_separados') {
      const scan = toScan(p.new);
      if (scan) this.ingestScan(scan);
    } else if (p.table === 'logs_acesso') {
      const access = toAccess(p.new);
      if (access) this.ingestAccess(access);
    }
  }

  private ingestScan(scan: NonNullable<ReturnType<typeof toScan>>) {
    this.checkDay();
    if (dayKeyOf(scan.at) !== this.store.day) return;
    if (this.store.addScan(scan)) this.emit({ type: 'scan', scan });
  }

  private ingestAccess(access: NonNullable<ReturnType<typeof toAccess>>) {
    this.checkDay();
    if (dayKeyOf(access.at) !== this.store.day) return;
    if (this.store.addAccess(access)) this.emit({ type: 'access', access });
  }

  private async todayEvents(): Promise<DayEvents> {
    if (this.syncing) await this.syncing.catch(() => undefined);
    const store = this.store;
    if (store.synced) return store.snapshot();
    // fora do armazém: a tela vai ter dado que o canal ainda não cobre;
    // quando o armazém ficar em dia, a tela precisa saber ('resync')
    this.needsResync = true;
    try {
      return await this.dedupe(this.todayInflight, store.day, async () => ({
        day: store.day,
        ...(await fetchDayEvents(this.port, store.day)),
      }));
    } catch (e) {
      if (store.loadedOnce) {
        // sem rede: melhor o último retrato (o selo de conexão já avisa) do que tela de erro
        console.warn('[dados supabase] sem rede; servindo o último retrato de hoje', e);
        return store.snapshot();
      }
      throw friendly('carregar o dia de hoje', e);
    }
  }

  /* ---------------- dias passados ---------------- */

  private async pastDayEvents(day: DayKey): Promise<DayEvents> {
    const hit = this.pastDays.get(day);
    // dia que não estava fechado quando foi lido (ontem) vale só alguns minutos
    if (hit && (hit.closed || this.clock().getTime() - hit.at < this.opt.recentDayTtlMs)) {
      return { day, scans: [...hit.events.scans], access: [...hit.events.access] };
    }
    try {
      const events = await this.dedupe(this.pastInflight, day, async () => {
        const loaded = { day, ...(await fetchDayEvents(this.port, day)) };
        // decidido DEPOIS da resposta: o relógio do servidor já foi visto
        const closed = this.isClosed(day);
        this.pastDays.delete(day);
        this.pastDays.set(day, { events: loaded, closed, at: this.clock().getTime() });
        while (this.pastDays.size > this.opt.pastDaysInMemory) {
          const first = this.pastDays.keys().next().value;
          if (first === undefined) break;
          this.pastDays.delete(first);
        }
        // de brinde: o agregado do dia fechado
        if (closed && !this.cache.get(day)) this.cache.put(day, aggregateEvents(day, loaded));
        return loaded;
      });
      return { day, scans: [...events.scans], access: [...events.access] };
    } catch (e) {
      throw friendly(`carregar o dia ${day}`, e);
    }
  }

  private async collect(from: DayKey, to: DayKey): Promise<DayAggregates[]> {
    this.checkDay();
    const today = this.store.day;
    const last = to < today ? to : today;
    const days = daysBetween(from, last);
    try {
      const result = new Map<DayKey, Promise<DayAggregates> | DayAggregates>();
      const missing: DayKey[] = [];
      const nowMs = this.clock().getTime();
      for (const d of [...this.recentAggs.keys()]) if (this.isClosed(d)) this.recentAggs.delete(d);
      for (const d of days) {
        if (d === today) continue;
        // o cache só é consultado para dia fechado: ontem não vem de lá, mesmo que exista
        const hit = this.isClosed(d) ? this.cache.get(d) : this.freshRecent(d, nowMs);
        if (hit) result.set(d, hit);
        else missing.push(d);
      }
      for (const [d, p] of this.loadClosed(missing)) result.set(d, p);
      // hoje: armazém + a regra da Visão Geral; nunca vai para cache nenhum
      if (days.includes(today)) result.set(today, this.todayAggregates(today));
      return await Promise.all(days.map((d) => result.get(d)!));
    } catch (e) {
      throw friendly(`carregar o período ${from} a ${to}`, e);
    }
  }

  private freshRecent(day: DayKey, nowMs: number): DayAggregates | null {
    const hit = this.recentAggs.get(day);
    if (!hit) return null;
    if (nowMs - hit.at < this.opt.recentDayTtlMs) return hit.agg;
    this.recentAggs.delete(day);
    return null;
  }

  private async todayAggregates(today: DayKey): Promise<DayAggregates> {
    const [events, registered] = await Promise.all([
      this.todayEvents(),
      // sem cadastro (falha passageira), entra quem bipou: melhor que perder o dia
      this.listOperators().catch(() => [] as Operator[]),
    ]);
    return aggregateTodayEvents(today, registered, events, this.clock());
  }

  /**
   * Dias passados que faltam: blocos contíguos, uma carga por dia mesmo com
   * pedidos simultâneos. Só vai para o cache o que estiver FECHADO no momento
   * da resposta (o relógio do servidor já foi visto); ontem fica em memória.
   */
  private loadClosed(missing: DayKey[]): Map<DayKey, Promise<DayAggregates>> {
    const out = new Map<DayKey, Promise<DayAggregates>>();
    const toFetch: DayKey[] = [];
    for (const d of [...missing].sort()) {
      const pending = this.closedInflight.get(d);
      if (pending) out.set(d, pending);
      else toFetch.push(d);
    }
    const blocks: DayKey[][] = [];
    let current: DayKey[] = [];
    for (const d of toFetch) {
      const prev = current[current.length - 1];
      if (prev && (current.length >= this.opt.blockDays || addDays(prev, 1) !== d)) {
        blocks.push(current);
        current = [];
      }
      current.push(d);
    }
    if (current.length) blocks.push(current);

    for (const block of blocks) {
      const blockPromise = this.limit(() => fetchDaysEvents(this.port, block)).then((byDay) => {
        const aggs = new Map<DayKey, DayAggregates>();
        const at = this.clock().getTime();
        for (const d of block) {
          const agg = aggregateEvents(d, byDay.get(d) ?? { scans: [], access: [] });
          if (this.isClosed(d)) this.cache.put(d, agg);
          else this.recentAggs.set(d, { agg, at });
          aggs.set(d, agg);
        }
        return aggs;
      });
      for (const d of block) {
        const dayPromise = blockPromise.then((aggs) => aggs.get(d)!);
        this.closedInflight.set(d, dayPromise);
        const clear = () => {
          if (this.closedInflight.get(d) === dayPromise) this.closedInflight.delete(d);
        };
        dayPromise.then(clear, clear);
        out.set(d, dayPromise);
      }
    }
    return out;
  }

  private async limit<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.opt.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  private dedupe<T>(map: Map<DayKey, Promise<T>>, key: DayKey, fn: () => Promise<T>): Promise<T> {
    const pending = map.get(key);
    if (pending) return pending;
    const p = fn();
    map.set(key, p);
    const clear = () => {
      if (map.get(key) === p) map.delete(key);
    };
    p.then(clear, clear);
    return p;
  }

  /* ---------------- operadores e meta global ---------------- */

  private async fetchOperators(): Promise<Operator[]> {
    const rows = await selectAllPages(this.port, {
      table: 'operadores_metas',
      columns: OPERATOR_COLUMNS,
      order: [{ column: 'id_operador', ascending: true }],
    });
    return mapRows(rows, toOperator);
  }

  private async fetchConfig(): Promise<GeneralConfig> {
    const rows = await this.port.select({
      table: 'configuracoes_gerais',
      columns: CONFIG_COLUMNS,
      eq: { column: 'id', value: 1 },
    });
    return toConfig(rows[0]);
  }

  /** Busca os dois e avisa o que mudou desde o que a tela recebeu por último. */
  private async refreshSettings() {
    const [list, config] = await Promise.all([this.fetchOperators(), this.fetchConfig()]);
    const opsFp = fingerprint(list);
    const prevOps = this.operatorsCache;
    this.operatorsCache = { list, fp: opsFp };
    if (prevOps && prevOps.fp !== opsFp) this.emit({ type: 'operators-changed' });

    const cfgFp = fingerprint(config);
    const prevCfg = this.configCache;
    this.configCache = { config, fp: cfgFp };
    if (prevCfg && prevCfg.fp !== cfgFp) this.emit({ type: 'config-changed', config: { ...config } });
  }

  private onSettingsChange(p: ChangePayload) {
    if (p.table === 'operadores_metas') {
      // a lista volta do banco na próxima leitura
      this.operatorsCache = null;
      this.emit({ type: 'operators-changed' });
    } else if (p.table === 'configuracoes_gerais') {
      const config = toConfig(p.eventType === 'DELETE' ? null : p.new);
      this.configCache = { config, fp: fingerprint(config) };
      this.emit({ type: 'config-changed', config: { ...config } });
    }
  }
}
