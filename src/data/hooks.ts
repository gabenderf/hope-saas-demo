/**
 * HOOKS DE DADOS DA EXPEDIÇÃO: a única porta das telas para os dados.
 *
 * CONTRATO: nomes, parâmetros e tipos de retorno abaixo são usados por todas
 * as telas. Implementar os corpos é livre; mudar assinatura exige falar com o
 * orquestrador.
 *
 * Regras:
 *  - toda conta vem de src/lib/metrics.ts (nunca recalcular em componente);
 *  - "agora" vem de useNow() (relógio da fonte), nunca de new Date();
 *  - toda gravação passa por useWriteGate (perfil + modo somente leitura),
 *    registra auditoria e devolve `undo` para o toast de desfazer.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { create } from 'zustand';
import { ROLE_LABEL, ROLE_PERMISSIONS, useAuth, useCan, type Permission, type Role } from '@/auth';
import { type DayKey, addDays, todayKey } from '@/lib/time';
import {
  buildActivityFeed,
  buildCustomPeriod,
  buildOperatorDetail,
  buildOverview,
  lastWorkedWeekdays,
  withUndo,
} from './assemble';
import { useSource } from './source';
import type {
  Actor,
  ActivityItem,
  AuditEntry,
  CompareKey,
  ConnectionState,
  DataCapabilities,
  GeneralConfig,
  GoalScheduleEntry,
  LiveEvent,
  Operator,
  OperationsSource,
  OperatorDetailModel,
  OperatorId,
  OperatorInput,
  OverviewModel,
  PanelUser,
  RangeKey,
} from './types';

/* ---------- chaves de cache (invalidar sempre por aqui) ---------- */
export const qk = {
  all: ['expedicao'] as const,
  operators: () => ['expedicao', 'operators'] as const,
  config: () => ['expedicao', 'config'] as const,
  overview: (p: { range: RangeKey; compare: CompareKey }) => ['expedicao', 'overview', p] as const,
  period: (p: PeriodParams) => ['expedicao', 'period', p] as const,
  operator: (id: OperatorId) => ['expedicao', 'operator', id] as const,
  activity: (p: { limit: number; day?: DayKey }) => ['expedicao', 'activity', p] as const,
  audit: (p: { limit: number }) => ['expedicao', 'audit', p] as const,
  schedule: (p: { from: DayKey; to: DayKey }) => ['expedicao', 'goal-schedule', p] as const,
  users: () => ['expedicao', 'panel-users'] as const,
};

export interface PeriodParams {
  from: DayKey;
  to: DayKey;
  /** comparação explícita; ausente = período anterior do mesmo tamanho em dias úteis */
  compareFrom?: DayKey;
  compareTo?: DayKey;
  operatorIds?: OperatorId[];
}

/** Prefixos usados para invalidar grupos de consultas. */
const GROUP = {
  operators: ['expedicao', 'operators'],
  config: ['expedicao', 'config'],
  overview: ['expedicao', 'overview'],
  period: ['expedicao', 'period'],
  operator: ['expedicao', 'operator'],
  activity: ['expedicao', 'activity'],
  audit: ['expedicao', 'audit'],
  schedule: ['expedicao', 'goal-schedule'],
  users: ['expedicao', 'panel-users'],
} as const;

const TODAY_REFRESH_MS = 60_000;

/* ---------- leitura ---------- */
export function useOperators(): UseQueryResult<Operator[]> {
  const source = useSource();
  return useQuery({ queryKey: qk.operators(), queryFn: () => source.listOperators() });
}
export function useGeneralConfig(): UseQueryResult<GeneralConfig> {
  const source = useSource();
  return useQuery({ queryKey: qk.config(), queryFn: () => source.getConfig() });
}
/** Visão Geral: hoje (por hora) ou 7d/30d (por dia útil fechado), com comparação. */
export function useOverview(params: { range: RangeKey; compare: CompareKey }): UseQueryResult<OverviewModel> {
  const source = useSource();
  return useQuery({
    queryKey: qk.overview(params),
    queryFn: () => buildOverview(source, params),
    // o status "ausente" aparece com o tempo, sem nenhum evento novo
    refetchInterval: params.range === 'hoje' ? TODAY_REFRESH_MS : false,
  });
}
/** Relatórios: qualquer intervalo de dias, mesmo modelo da Visão Geral. */
export function usePeriodOverview(params: PeriodParams): UseQueryResult<OverviewModel> {
  const source = useSource();
  return useQuery({ queryKey: qk.period(params), queryFn: () => buildCustomPeriod(source, params) });
}
/**
 * Os últimos `count` dias trabalhados (segunda a sexta com movimento, hoje incluso se já
 * houve pedido) e os `count` anteriores. Mesma definição da Visão Geral.
 */
export function useLastWorkedDays(count: number): UseQueryResult<{ current: DayKey[]; previous: DayKey[] }> {
  const source = useSource();
  const today = useToday();
  return useQuery({
    queryKey: ['expedicao', 'worked-days', today, count] as const,
    queryFn: async () => {
      const current = await lastWorkedWeekdays(source, addDays(today, 1), count);
      const previous = current.length ? await lastWorkedWeekdays(source, current[0]!, count) : [];
      return { current, previous };
    },
  });
}
export function useOperatorDetail(id: OperatorId): UseQueryResult<OperatorDetailModel | null> {
  const source = useSource();
  return useQuery({
    queryKey: qk.operator(id),
    queryFn: () => buildOperatorDetail(source, id),
    refetchInterval: TODAY_REFRESH_MS,
  });
}
export function useActivity(params: { limit: number; day?: DayKey }): UseQueryResult<ActivityItem[]> {
  const source = useSource();
  return useQuery({ queryKey: qk.activity(params), queryFn: () => buildActivityFeed(source, params) });
}
export function useAuditLog(params: { limit: number }): UseQueryResult<AuditEntry[]> {
  const source = useSource();
  return useQuery({ queryKey: qk.audit(params), queryFn: () => source.listAudit({ limit: params.limit }) });
}
export function useGoalSchedule(params: { from: DayKey; to: DayKey }): UseQueryResult<GoalScheduleEntry[]> {
  const source = useSource();
  return useQuery({ queryKey: qk.schedule(params), queryFn: () => source.listGoalSchedule(params.from, params.to) });
}
export function usePanelUsers(): UseQueryResult<PanelUser[]> {
  const source = useSource();
  return useQuery({ queryKey: qk.users(), queryFn: () => source.listPanelUsers() });
}

/* ---------- tempo ---------- */
/** Relógio da fonte, atualizado a cada `intervalMs` (padrão 30 s). */
export function useNow(intervalMs: number = 30_000): Date {
  const source = useSource();
  const [now, setNow] = useState(() => source.now());
  useEffect(() => {
    const id = setInterval(() => setNow(source.now()), intervalMs);
    // troca de horário do demo ou virada do dia: atualiza na hora
    const off = source.subscribe((e) => {
      if (e.type === 'resync') setNow(source.now());
    });
    return () => {
      clearInterval(id);
      off();
    };
  }, [source, intervalMs]);
  return now;
}
/** Dia operacional de hoje (São Paulo). */
export function useToday(): DayKey {
  return todayKey(useNow());
}

/* ---------- ao vivo ---------- */
const useConnectionStore = create<{ state: ConnectionState; set: (s: ConnectionState) => void }>((set) => ({
  state: 'connecting',
  set: (state) => set({ state }),
}));

const SCAN_THROTTLE_MS = 3000;

/** Montar UMA vez (no shell e no Modo TV): assina a fonte e atualiza o cache. */
export function useLiveSync(): void {
  const source = useSource();
  const qc = useQueryClient();
  useEffect(() => {
    const setState = useConnectionStore.getState().set;
    setState('connecting');
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const flushScans = () => {
      timer = null;
      pending = false;
      qc.invalidateQueries({
        queryKey: GROUP.overview,
        predicate: (q) => (q.queryKey[2] as { range?: RangeKey } | undefined)?.range === 'hoje',
      });
      qc.invalidateQueries({ queryKey: GROUP.activity });
      qc.invalidateQueries({ queryKey: GROUP.operator });
    };
    const invalidate = (...groups: (readonly string[])[]) => groups.forEach((g) => qc.invalidateQueries({ queryKey: g }));

    const off = source.subscribe((e) => {
      switch (e.type) {
        case 'connection':
          setState(e.state);
          break;
        case 'scan':
        case 'access':
          if (!pending) {
            pending = true;
            timer = setTimeout(flushScans, SCAN_THROTTLE_MS);
          }
          break;
        case 'config-changed':
          invalidate(GROUP.config, GROUP.overview, GROUP.period, GROUP.operator);
          break;
        case 'operators-changed':
          invalidate(GROUP.operators, GROUP.overview, GROUP.period, GROUP.operator);
          break;
        case 'goal-schedule-changed':
          invalidate(GROUP.schedule, GROUP.overview);
          break;
        case 'users-changed':
          invalidate(GROUP.users);
          break;
        case 'audit':
          invalidate(GROUP.audit);
          break;
        case 'resync':
          qc.invalidateQueries({ queryKey: qk.all });
          break;
      }
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [source, qc]);
}
export function useConnectionState(): ConnectionState {
  return useConnectionStore((s) => s.state);
}
/** Escuta eventos ao vivo (ex.: destacar linha nova no feed, alertas). */
export function useLiveEvents(listener: (event: LiveEvent) => void): void {
  const source = useSource();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => source.subscribe((e) => ref.current(e)), [source]);
}

/* ---------- capacidades e permissão de escrita ---------- */
export function useCapabilities(): DataCapabilities {
  return useSource().capabilities;
}
export function useDataMode(): 'demo' | 'supabase' {
  return useSource().mode;
}
export interface WriteGate {
  allowed: boolean;
  /** 'perfil' = o papel não permite; 'somente-leitura' = fonte de dados não grava */
  reason: 'perfil' | 'somente-leitura' | null;
  /** frase pronta: "Seu perfil é Leitura. Alterar meta exige Liderança ou Administrador." */
  message: string | null;
}

const ACTION_TEXT: Record<Permission, string> = {
  'expedicao.ver': 'Ver a Expedição',
  'expedicao.exportar': 'Exportar dados',
  'expedicao.metas.editar': 'Alterar metas',
  'expedicao.operadores.gerenciar': 'Gerenciar operadores',
  'expedicao.previsao.configurar': 'Configurar a previsão',
  'auditoria.ver': 'Ver o histórico de alterações',
  'usuarios.gerenciar': 'Gerenciar usuários',
  'dispositivos.gerenciar': 'Gerenciar dispositivos',
  'notificacoes.configurar': 'Configurar notificações',
  'tv.ver': 'Abrir o Modo TV',
};

const ROLE_ORDER: Role[] = ['leitura', 'lideranca', 'admin', 'tv'];

function rolesWith(permission: Permission): string {
  const names = ROLE_ORDER.filter((r) => ROLE_PERMISSIONS[r].includes(permission)).map((r) => ROLE_LABEL[r]);
  if (names.length <= 1) return names[0] ?? 'Administrador';
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

export const READ_ONLY_MESSAGE =
  'Conectado aos dados reais em modo somente leitura. Alterações ficam para a fase da nuvem.';

export function useWriteGate(permission: Permission): WriteGate {
  const can = useCan(permission);
  const { user } = useAuth();
  const caps = useCapabilities();
  if (!can) {
    const profile = user ? `Seu perfil é ${ROLE_LABEL[user.role]}. ` : '';
    return {
      allowed: false,
      reason: 'perfil',
      message: `${profile}${ACTION_TEXT[permission]} exige ${rolesWith(permission)}.`,
    };
  }
  if (!caps.write) return { allowed: false, reason: 'somente-leitura', message: READ_ONLY_MESSAGE };
  return { allowed: true, reason: null, message: null };
}

/* ---------- gravações (todas devolvem `undo`) ---------- */
export interface Undoable {
  undo: () => Promise<void>;
}

type Group = readonly string[];

function useUndoableMutation<V>(
  run: (source: OperationsSource, vars: V, actor: Actor) => Promise<Undoable>,
  groups: Group[],
): UseMutationResult<Undoable, Error, V> {
  const source = useSource();
  const { user } = useAuth();
  const qc = useQueryClient();
  const refresh = () => {
    groups.forEach((g) => qc.invalidateQueries({ queryKey: g }));
    qc.invalidateQueries({ queryKey: GROUP.audit });
  };
  return useMutation<Undoable, Error, V>({
    mutationFn: async (vars) => {
      if (!user) throw new Error('Entre para alterar.');
      const result = await run(source, vars, { id: user.id, name: user.name });
      return {
        undo: async () => {
          await result.undo();
          refresh();
        },
      };
    },
    onSuccess: refresh,
  });
}

export function useSetGlobalGoal(): UseMutationResult<Undoable, Error, { value: number | null }> {
  return useUndoableMutation<{ value: number | null }>(
    async (source, { value }, actor) => {
      const before = (await source.getConfig()).globalGoal;
      await source.setGlobalGoal(value, actor);
      return { undo: () => withUndo(() => source.setGlobalGoal(before, actor)) };
    },
    [GROUP.config, GROUP.overview, GROUP.period, GROUP.operator],
  );
}
export function useSetIndividualGoals(): UseMutationResult<Undoable, Error, { operatorIds: OperatorId[]; value: number }> {
  return useUndoableMutation<{ operatorIds: OperatorId[]; value: number }>(
    async (source, { operatorIds, value }, actor) => {
      const operators = await source.listOperators();
      const before = operatorIds.map((id) => ({ id, goal: operators.find((o) => o.id === id)?.individualGoal ?? value }));
      await source.setIndividualGoals(operatorIds, value, actor);
      return {
        undo: async () => {
          const byGoal = new Map<number, OperatorId[]>();
          for (const b of before) byGoal.set(b.goal, [...(byGoal.get(b.goal) ?? []), b.id]);
          for (const [goal, ids] of byGoal) await withUndo(() => source.setIndividualGoals(ids, goal, actor));
        },
      };
    },
    [GROUP.operators, GROUP.overview, GROUP.period, GROUP.operator],
  );
}
export function useSaveOperator(): UseMutationResult<Undoable, Error, { input: OperatorInput; isNew: boolean }> {
  return useUndoableMutation<{ input: OperatorInput; isNew: boolean }>(
    async (source, { input, isNew }, actor) => {
      const previous = (await source.listOperators()).find((o) => o.id === input.id);
      await source.saveOperator(input, actor);
      return {
        undo: async () => {
          if (previous && !isNew) {
            await withUndo(() =>
              source.saveOperator({ id: previous.id, name: previous.name, individualGoal: previous.individualGoal }, actor),
            );
          } else {
            // não há exclusão: desfazer um cadastro novo desativa o operador
            await withUndo(() => source.setOperatorRegistration(input.id, 'inativo', actor));
          }
        },
      };
    },
    [GROUP.operators, GROUP.overview, GROUP.period, GROUP.operator],
  );
}
export function useSetOperatorRegistration(): UseMutationResult<
  Undoable,
  Error,
  { id: OperatorId; registration: Operator['registration'] }
> {
  return useUndoableMutation<{ id: OperatorId; registration: Operator['registration'] }>(
    async (source, { id, registration }, actor) => {
      const previous = (await source.listOperators()).find((o) => o.id === id)?.registration ?? 'ativo';
      await source.setOperatorRegistration(id, registration, actor);
      return { undo: () => withUndo(() => source.setOperatorRegistration(id, previous, actor)) };
    },
    [GROUP.operators, GROUP.overview, GROUP.period, GROUP.operator],
  );
}
export function useSetGoalSchedule(): UseMutationResult<Undoable, Error, { day: DayKey; value: number | null; note?: string }> {
  return useUndoableMutation<{ day: DayKey; value: number | null; note?: string }>(
    async (source, { day, value, note }, actor) => {
      const [previous] = await source.listGoalSchedule(day, day);
      await source.setGoalSchedule(day, value, actor, note);
      return {
        undo: () =>
          previous
            ? withUndo(() => source.setGoalSchedule(day, previous.value, actor, previous.note))
            : withUndo(() => source.setGoalSchedule(day, null, actor), { restoreAbsent: true }),
      };
    },
    [GROUP.schedule, GROUP.overview],
  );
}
export function useInvitePanelUser(): UseMutationResult<Undoable, Error, { name: string; email: string; role: Role }> {
  return useUndoableMutation<{ name: string; email: string; role: Role }>(
    async (source, input, actor) => {
      await source.invitePanelUser(input, actor);
      return {
        undo: async () => {
          // não há exclusão: desfazer o convite desativa o acesso
          const created = (await source.listPanelUsers()).find((u) => u.email?.toLowerCase() === input.email.trim().toLowerCase());
          if (created) await withUndo(() => source.setPanelUserStatus(created.id, 'desativado', actor));
        },
      };
    },
    [GROUP.users],
  );
}
/** Reenvia o e-mail do convite. Não desfaz: e-mail enviado não volta. */
export function useResendPanelUserInvite(): UseMutationResult<void, Error, { id: string }> {
  const source = useSource();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      if (!user) throw new Error('Entre para alterar.');
      if (!source.resendPanelUserInvite) throw new Error('Reenviar convite não está disponível nesta fonte de dados.');
      await source.resendPanelUserInvite(id, { id: user.id, name: user.name });
    },
    // "já aceitou" (409) quer dizer que a lista em cache está velha: relê, para o botão sumir.
    onSettled: () => qc.invalidateQueries({ queryKey: GROUP.users }),
  });
}
export function useSetPanelUserRole(): UseMutationResult<Undoable, Error, { id: string; role: Role }> {
  return useUndoableMutation<{ id: string; role: Role }>(
    async (source, { id, role }, actor) => {
      const previous = (await source.listPanelUsers()).find((u) => u.id === id)?.role ?? role;
      await source.setPanelUserRole(id, role, actor);
      return { undo: () => withUndo(() => source.setPanelUserRole(id, previous, actor)) };
    },
    [GROUP.users],
  );
}
export function useSetPanelUserStatus(): UseMutationResult<Undoable, Error, { id: string; status: 'ativo' | 'desativado' }> {
  return useUndoableMutation<{ id: string; status: 'ativo' | 'desativado' }>(
    async (source, { id, status }, actor) => {
      const previous = (await source.listPanelUsers()).find((u) => u.id === id)?.status;
      await source.setPanelUserStatus(id, status, actor);
      return {
        undo: () => {
          // restaura o status EXATO: convidado volta a convidado
          if (previous === 'convidado') return withUndo(() => source.setPanelUserStatus(id, 'ativo', actor), { restoreInvited: true });
          return withUndo(() => source.setPanelUserStatus(id, previous === 'desativado' ? 'desativado' : 'ativo', actor));
        },
      };
    },
    [GROUP.users],
  );
}
