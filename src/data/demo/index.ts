/**
 * Fonte de dados DEMO: histórico determinístico gerado por dia (semente = dia),
 * simulação ao vivo e gravações em memória + localStorage ('hope-demo-state'),
 * cada uma com auditoria e evento ao vivo.
 *
 * Agregados e produtos são SEMPRE derivados dos eventos crus por
 * src/lib/metrics.ts (aggregateDay, aggregateSkusOfDay): nunca divergem.
 */
import { ROLE_LABEL, type Role } from '@/auth/types';
import { formatDayShort } from '@/lib/format';
import { aggregateDay, aggregateSkusOfDay, aggregateToday } from '@/lib/metrics';
import { type DayKey, daysBetween, todayKey } from '@/lib/time';
import { currentUndo } from '../assemble/undo';
import type {
  Actor,
  AuditAction,
  AuditEntry,
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
import { demoNow, onDemoClockChange } from './clock';
import { generateDay } from './generator';
import { HISTORY_START, baseOperators } from './roster';

export { getDemoClock, setDemoClock } from './clock';

const STATE_KEY = 'hope-demo-state';
const EVENT_CACHE_DAYS = 40;
const TICK_MS = 3000;
const MAX_INDIVIDUAL_JUMP_MS = 5 * 60_000;

export interface DemoOptions {
  /** relógio da fonte (padrão: relógio do demo, hora real ou HH:MM) */
  now?: () => Date;
  /** onde persistir; null = só memória (testes) */
  storage?: Storage | null;
  /** liga a simulação ao vivo (padrão: true) */
  live?: boolean;
}

/* ---------- cache de eventos (puro por dia) ---------- */

const eventsCache = new Map<DayKey, DayEvents>();
const aggCache = new Map<DayKey, DailyOperatorAggregate[]>();
const skuCache = new Map<DayKey, DailySkuAggregate[]>();

function fullEvents(day: DayKey): DayEvents {
  const hit = eventsCache.get(day);
  if (hit) {
    eventsCache.delete(day);
    eventsCache.set(day, hit);
    return hit;
  }
  const made = generateDay(day);
  eventsCache.set(day, made);
  while (eventsCache.size > EVENT_CACHE_DAYS) {
    const oldest = eventsCache.keys().next().value;
    if (oldest === undefined) break;
    eventsCache.delete(oldest);
  }
  return made;
}

/* ---------- estado persistido ---------- */

interface DemoState {
  operators: Operator[];
  config: GeneralConfig;
  schedule: GoalScheduleEntry[];
  audit: AuditEntry[];
  users: PanelUser[];
  /** último dia em que a agenda de metas foi aplicada à meta global (a cópia das 00:05) */
  scheduleAppliedDay?: DayKey;
}

const SYSTEM_ACTOR: Actor = { id: 'demo-admin', name: 'Gabriel' };

function defaultState(now: Date): DemoState {
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  return {
    operators: baseOperators(),
    config: { globalGoal: 38, updatedAt: ago(20) },
    schedule: [],
    audit: [
      {
        id: 'seed-3',
        at: ago(20),
        actor: SYSTEM_ACTOR,
        action: 'meta-global.definir',
        summary: 'alterou a meta global de 35 para 38/h',
        target: { type: 'config', id: 'meta-global', label: 'Meta global' },
        before: 35,
        after: 38,
      },
      {
        id: 'seed-2',
        at: ago(52),
        actor: { id: 'demo-lideranca', name: 'Patrícia Ramos' },
        action: 'meta-individual.definir',
        summary: 'alterou a meta de Thiago Nogueira de 30 para 32/h',
        target: { type: 'operador', id: '106', label: 'Thiago Nogueira' },
        before: 30,
        after: 32,
      },
      {
        id: 'seed-1',
        at: ago(120),
        actor: SYSTEM_ACTOR,
        action: 'operador.cadastro',
        summary: 'desativou o cadastro de Marcos Vieira',
        target: { type: 'operador', id: '108', label: 'Marcos Vieira' },
        before: 'ativo',
        after: 'inativo',
      },
    ],
    users: [
      { id: 'u-1', name: 'Gabriel', email: 'gabriel@hope.example', username: 'gabriel', role: 'admin', status: 'ativo', lastSignInAt: ago(1), mfaEnrolled: true },
      { id: 'u-2', name: 'Patrícia Ramos', email: 'patricia@hope.example', username: 'patricia', role: 'lideranca', status: 'ativo', lastSignInAt: ago(26), mfaEnrolled: true },
      { id: 'u-3', name: 'Roberto Tavares', email: 'roberto@hope.example', username: 'roberto', role: 'leitura', status: 'ativo', lastSignInAt: ago(74), mfaEnrolled: false },
      { id: 'u-4', name: 'Camila Duarte', email: 'camila@hope.example', username: null, role: 'leitura', status: 'convidado', lastSignInAt: null, mfaEnrolled: false },
    ],
  };
}

function loadState(storage: Storage | null, now: Date): DemoState {
  const fallback = defaultState(now);
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (!Array.isArray(parsed.operators) || !parsed.config || !Array.isArray(parsed.users)) return fallback;
    return {
      operators: parsed.operators,
      config: parsed.config,
      schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      users: parsed.users,
      scheduleAppliedDay: parsed.scheduleAppliedDay,
    };
  } catch {
    return fallback;
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/* ---------- validações ---------- */

function assertGoal(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 500) throw new Error('Meta inválida: use um número entre 1 e 500.');
}

const goalText = (v: number | null) => (v == null ? 'sem meta' : `${v}/h`);

/* ---------- a fonte ---------- */

export async function createDemoSource(options: DemoOptions = {}): Promise<OperationsSource> {
  const clock = options.now ?? demoNow;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const state = loadState(storage, clock());
  const listeners = new Set<(event: LiveEvent) => void>();
  let auditSeq = 0;

  const persist = () => {
    try {
      storage?.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* cota cheia ou bloqueado: segue só em memória */
    }
  };
  const emit = (event: LiveEvent) => {
    for (const l of [...listeners]) l(event);
  };

  const today = () => todayKey(clock());
  const roleText = (r: Role) => ROLE_LABEL[r];

  /** Registra a auditoria; no modo "desfazer" a ação vira 'desfazer'. */
  const record = (
    undoing: boolean,
    action: AuditAction,
    actor: Actor,
    summary: string,
    extra: Pick<AuditEntry, 'target' | 'before' | 'after'> = {},
  ) => {
    const entry: AuditEntry = {
      id: `a-${clock().getTime().toString(36)}-${++auditSeq}`,
      at: clock().toISOString(),
      actor,
      action: undoing ? 'desfazer' : action,
      summary: undoing ? `desfez a alteração: ${summary}` : summary,
      ...extra,
    };
    state.audit.unshift(entry);
    if (state.audit.length > 500) state.audit.length = 500;
    persist();
    emit({ type: 'audit', entry });
  };

  const eventsOf = (day: DayKey): DayEvents => {
    const now = clock();
    const t = today();
    if (day > t) return { day, scans: [], access: [] };
    const full = fullEvents(day);
    if (day < t) return full;
    const ms = now.getTime();
    return {
      day,
      scans: full.scans.filter((s) => Date.parse(s.at) <= ms),
      access: full.access.filter((a) => Date.parse(a.at) <= ms),
    };
  };

  /**
   * Simula a cópia automática do começo do dia (nuvem: cron às 00:05). Na primeira leitura
   * de cada dia, a entrada da agenda para ele vira a meta global, UMA vez; depois disso a
   * edição manual do dia nunca é sobrescrita.
   */
  const applyScheduledGoal = () => {
    const t = today();
    if (state.scheduleAppliedDay === t) return;
    state.scheduleAppliedDay = t;
    const entry = state.schedule.find((e) => e.day === t);
    if (!entry) {
      persist();
      return;
    }
    const before = state.config.globalGoal;
    state.config = { globalGoal: entry.value, updatedAt: clock().toISOString() };
    persist();
    emit({ type: 'config-changed', config: { ...state.config } });
    record(false, entry.value == null ? 'meta-global.remover' : 'meta-global.definir', SYSTEM_ACTOR, `aplicou a meta programada de ${formatDayShort(t)}: ${goalText(entry.value)} (era ${goalText(before)})`, {
      target: { type: 'config', id: 'meta-global', label: 'Meta global' },
      before,
      after: entry.value,
    });
  };

  const source: OperationsSource = {
    mode: 'demo',
    capabilities: { write: true, audit: true, realtime: true, goalSchedule: true, userManagement: true },
    now: () => clock(),

    listOperators: async () => state.operators.map((o) => ({ ...o })),
    getConfig: async () => {
      applyScheduledGoal();
      return { ...state.config };
    },
    getDayEvents: async (day) => eventsOf(day),

    getDailyAggregates: async (from, to) => {
      const t = today();
      const out: DailyOperatorAggregate[] = [];
      for (const day of daysBetween(from < HISTORY_START ? HISTORY_START : from, to > t ? t : to)) {
        if (day < t) {
          let agg = aggCache.get(day);
          if (!agg) {
            agg = aggregateDay(day, baseOperators(), fullEvents(day));
            aggCache.set(day, agg);
          }
          out.push(...agg);
        } else {
          // hoje usa a MESMA conta da Visão Geral: quem está ativo vai até agora
          out.push(...aggregateToday(day, state.operators, eventsOf(day), clock()));
        }
      }
      return out;
    },

    getDailySkuAggregates: async (from, to) => {
      const t = today();
      const out: DailySkuAggregate[] = [];
      for (const day of daysBetween(from < HISTORY_START ? HISTORY_START : from, to > t ? t : to)) {
        if (day < t) {
          let agg = skuCache.get(day);
          if (!agg) {
            agg = aggregateSkusOfDay(day, fullEvents(day).scans);
            skuCache.set(day, agg);
          }
          out.push(...agg);
        } else {
          out.push(...aggregateSkusOfDay(day, eventsOf(day).scans));
        }
      }
      return out;
    },

    listAudit: async ({ limit, before }) =>
      state.audit
        .filter((e) => !before || e.at < before)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, limit),

    listGoalSchedule: async (from, to) =>
      state.schedule.filter((e) => e.day >= from && e.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1)),

    listPanelUsers: async () => state.users.map((u) => ({ ...u })),

    setGlobalGoal: async (value, actor) => {
      const undo = currentUndo();
      if (value != null) assertGoal(value);
      const before = state.config.globalGoal;
      state.config = { globalGoal: value, updatedAt: clock().toISOString() };
      persist();
      emit({ type: 'config-changed', config: { ...state.config } });
      const summary =
        value == null
          ? `removeu a meta global (era ${goalText(before)})`
          : before == null
            ? `definiu a meta global em ${value}/h`
            : `alterou a meta global de ${before} para ${value}/h`;
      record(Boolean(undo), value == null ? 'meta-global.remover' : 'meta-global.definir', actor, summary, {
        target: { type: 'config', id: 'meta-global', label: 'Meta global' },
        before,
        after: value,
      });
    },

    setIndividualGoals: async (operatorIds, value, actor) => {
      const undo = currentUndo();
      assertGoal(value);
      const changed: { op: Operator; before: number }[] = [];
      for (const id of operatorIds) {
        const op = state.operators.find((o) => o.id === id);
        if (!op) throw new Error(`Operador ${id} não encontrado.`);
        changed.push({ op, before: op.individualGoal });
        op.individualGoal = value;
      }
      persist();
      emit({ type: 'operators-changed' });
      if (changed.length === 1) {
        const { op, before } = changed[0]!;
        record(Boolean(undo), 'meta-individual.definir', actor, `alterou a meta de ${op.name} de ${before} para ${value}/h`, {
          target: { type: 'operador', id: op.id, label: op.name },
          before,
          after: value,
        });
      } else if (changed.length > 1) {
        record(Boolean(undo), 'meta-individual.definir', actor, `alterou a meta de ${changed.length} operadores para ${value}/h`, {
          target: { type: 'operador', id: changed.map((c) => c.op.id).join(','), label: `${changed.length} operadores` },
          before: changed.map((c) => c.before),
          after: value,
        });
      }
    },

    saveOperator: async (input: OperatorInput, actor) => {
      const undo = currentUndo();
      const name = input.name.trim();
      if (!input.id.trim()) throw new Error('Informe o ID do operador.');
      if (!name) throw new Error('Informe o nome do operador.');
      assertGoal(input.individualGoal);
      const existing = state.operators.find((o) => o.id === input.id);
      if (existing) {
        const before = { name: existing.name, individualGoal: existing.individualGoal };
        existing.name = name;
        existing.individualGoal = input.individualGoal;
        record(Boolean(undo), 'operador.editar', actor, `editou o operador ${name} (meta ${input.individualGoal}/h)`, {
          target: { type: 'operador', id: existing.id, label: name },
          before,
          after: { name, individualGoal: input.individualGoal },
        });
      } else {
        state.operators.push({ id: input.id, name, individualGoal: input.individualGoal, registration: 'ativo' });
        record(Boolean(undo), 'operador.criar', actor, `cadastrou o operador ${name} (meta ${input.individualGoal}/h)`, {
          target: { type: 'operador', id: input.id, label: name },
          after: { name, individualGoal: input.individualGoal },
        });
      }
      persist();
      emit({ type: 'operators-changed' });
    },

    setOperatorRegistration: async (id, registration, actor) => {
      const undo = currentUndo();
      const op = state.operators.find((o) => o.id === id);
      if (!op) throw new Error(`Operador ${id} não encontrado.`);
      const before = op.registration;
      op.registration = registration;
      persist();
      emit({ type: 'operators-changed' });
      record(
        Boolean(undo),
        'operador.cadastro',
        actor,
        `${registration === 'inativo' ? 'desativou' : 'reativou'} o cadastro de ${op.name}`,
        { target: { type: 'operador', id, label: op.name }, before, after: registration },
      );
    },

    setGoalSchedule: async (day, value, actor, note) => {
      const undo = currentUndo();
      if (value != null) assertGoal(value);
      if (day <= today()) throw new Error('Só dá para programar a meta a partir de amanhã. A meta de hoje se ajusta no cartão da meta global.');
      const idx = state.schedule.findIndex((e) => e.day === day);
      const previous = idx >= 0 ? state.schedule[idx] : undefined;
      if (undo?.restoreAbsent) {
        if (idx >= 0) state.schedule.splice(idx, 1);
      } else {
        const entry: GoalScheduleEntry = { day, value, note, createdBy: actor, createdAt: clock().toISOString() };
        if (idx >= 0) state.schedule[idx] = entry;
        else state.schedule.push(entry);
      }
      persist();
      emit({ type: 'goal-schedule-changed' });
      const label = formatDayShort(day);
      record(
        Boolean(undo),
        'meta-programada.definir',
        actor,
        value == null ? `programou ${label} sem meta global` : `programou a meta global de ${label} em ${value}/h`,
        { target: { type: 'config', id: day, label: `Meta de ${label}` }, before: previous?.value, after: value },
      );
    },

    invitePanelUser: async (input, actor) => {
      const undo = currentUndo();
      const email = input.email.trim().toLowerCase();
      if (!input.name.trim() || !email.includes('@')) throw new Error('Informe nome e e-mail válidos.');
      if (state.users.some((u) => u.email?.toLowerCase() === email)) throw new Error('Já existe um usuário com este e-mail.');
      const user: PanelUser = {
        id: `u-${Date.now().toString(36)}-${state.users.length + 1}`,
        name: input.name.trim(),
        email,
        username: null,
        role: input.role,
        status: 'convidado',
        lastSignInAt: null,
        mfaEnrolled: false,
      };
      state.users.push(user);
      persist();
      emit({ type: 'users-changed' });
      record(Boolean(undo), 'usuario.convidar', actor, `convidou ${user.name} como ${roleText(input.role)}`, {
        target: { type: 'usuario', id: user.id, label: user.name },
        after: { email, role: input.role },
      });
    },

    resendPanelUserInvite: async (id) => {
      const user = state.users.find((u) => u.id === id);
      if (!user) throw new Error('Usuário não encontrado.');
      if (user.status === 'desativado') throw new Error('O acesso desta pessoa está desativado. Reative antes de reenviar o convite.');
      if (user.status !== 'convidado') {
        throw new Error('Esta pessoa já aceitou o convite. Se esqueceu a senha, ela pode usar "Esqueci a senha" na tela de entrar.');
      }
    },

    setPanelUserRole: async (id, role, actor) => {
      const undo = currentUndo();
      const user = state.users.find((u) => u.id === id);
      if (!user) throw new Error('Usuário não encontrado.');
      const before = user.role;
      user.role = role;
      persist();
      emit({ type: 'users-changed' });
      record(Boolean(undo), 'usuario.perfil', actor, `mudou o perfil de ${user.name} de ${roleText(before)} para ${roleText(role)}`, {
        target: { type: 'usuario', id, label: user.name },
        before,
        after: role,
      });
    },

    setPanelUserStatus: async (id, status, actor) => {
      const undo = currentUndo();
      const user = state.users.find((u) => u.id === id);
      if (!user) throw new Error('Usuário não encontrado.');
      const before = user.status;
      // desfazer a desativação de um convidado devolve o status exato
      user.status = undo?.restoreInvited && status === 'ativo' ? 'convidado' : status;
      persist();
      emit({ type: 'users-changed' });
      record(
        Boolean(undo),
        'usuario.status',
        actor,
        `${status === 'desativado' ? 'desativou o acesso de' : 'reativou o acesso de'} ${user.name}`,
        { target: { type: 'usuario', id, label: user.name }, before, after: status },
      );
    },

    subscribe: (listener) => {
      listeners.add(listener);
      listener({ type: 'connection', state: 'live' });
      startLive();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopLive();
      };
    },
  };

  /* ---------- simulação ao vivo ---------- */

  let timer: ReturnType<typeof setInterval> | null = null;
  let emittedUntil = 0;
  let lastDay: DayKey = today();
  const liveEnabled = options.live !== false;

  function tick() {
    const nowMs = clock().getTime();
    const day = today();
    if (day !== lastDay) {
      lastDay = day;
      emittedUntil = nowMs;
      emit({ type: 'resync' });
      return;
    }
    if (nowMs < emittedUntil || nowMs - emittedUntil > MAX_INDIVIDUAL_JUMP_MS) {
      emittedUntil = nowMs;
      emit({ type: 'resync' });
      return;
    }
    const full = fullEvents(day);
    const due: LiveEvent[] = [];
    const items: { at: number; event: LiveEvent }[] = [];
    for (const scan of full.scans) {
      const at = Date.parse(scan.at);
      if (at > emittedUntil && at <= nowMs) items.push({ at, event: { type: 'scan', scan } });
    }
    for (const access of full.access) {
      const at = Date.parse(access.at);
      if (at > emittedUntil && at <= nowMs) items.push({ at, event: { type: 'access', access } });
    }
    items.sort((a, b) => a.at - b.at);
    for (const i of items) due.push(i.event);
    emittedUntil = nowMs;
    for (const e of due) emit(e);
  }

  let offClock: (() => void) | null = null;
  function startLive() {
    if (!liveEnabled || timer) return;
    emittedUntil = clock().getTime();
    lastDay = today();
    timer = setInterval(tick, TICK_MS);
    if (!options.now) {
      offClock = onDemoClockChange(() => {
        emittedUntil = clock().getTime();
        lastDay = today();
        emit({ type: 'resync' });
      });
    }
  }
  function stopLive() {
    if (timer) clearInterval(timer);
    timer = null;
    offClock?.();
    offClock = null;
  }

  return source;
}
