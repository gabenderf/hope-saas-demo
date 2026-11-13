/**
 * Tipos de domínio da Expedição.
 *
 * Espelham as tabelas reais (nome do banco anotado em cada campo) para que o
 * adaptador demo e o adaptador Supabase devolvam exatamente o mesmo formato.
 * Detalhes de cada tabela: docs/modelo-de-dados.md.
 *
 * CONTRATO COMPARTILHADO: não renomeie nem remova campos sem falar com o
 * orquestrador. Acrescentar campo opcional é permitido.
 */
import type { Role } from '@/auth/types';
import type { DayKey } from '@/lib/time';

export type OperatorId = string;
/** Bancada já normalizada: "Bancada 03" vira "03". */
export type StationId = string;

/** `operadores_metas` */
export interface Operator {
  /** id_operador */
  id: OperatorId;
  /** nome_colaborador */
  name: string;
  /** meta_horaria (pedidos/h). No banco o padrão é 35. */
  individualGoal: number;
  /** status do CADASTRO. Não confundir com ActivityStatus (calculado). */
  registration: 'ativo' | 'inativo';
}

export interface OrderItem {
  sku: string;
  quantity: number;
}

/** `pedidos_separados`: UMA LINHA POR BIPAGEM (pacote), não por item. */
export interface ScanEvent {
  /** id_registro */
  id: string;
  /** id_operador */
  operatorId: OperatorId;
  /** data_hora, ISO 8601 */
  at: string;
  /** quantidade_pedidos (quase sempre 1). Pedidos = soma deste campo. */
  orderCount: number;
  /** bancada, normalizada */
  station: StationId | null;
  /** codigo_rastreio (único) */
  trackingCode: string | null;
  /** num_pedido */
  orderNumber: string | null;
  /** itens [{sku, quantidade}]. null = linha antiga sem itens (conta como simples). */
  items: OrderItem[] | null;
}

/** `logs_acesso`: troca de operador numa bancada (entrada, saída ou troca). */
export interface AccessEvent {
  /** id_log */
  id: string;
  /** data_hora, ISO 8601 */
  at: string;
  station: StationId | null;
  /** id_anterior */
  previousOperatorId: OperatorId | null;
  /** id_novo */
  nextOperatorId: OperatorId | null;
  /** justificativa */
  reason: string | null;
}

/** `configuracoes_gerais` (linha única, id = 1) */
export interface GeneralConfig {
  /** meta_horaria_global. null = sem meta global (vale a individual). */
  globalGoal: number | null;
  /** atualizado_em */
  updatedAt: string | null;
}

/** Eventos de um dia operacional (fuso de São Paulo), em ordem cronológica crescente. */
export interface DayEvents {
  day: DayKey;
  scans: ScanEvent[];
  access: AccessEvent[];
}

/** Um operador num dia fechado. O relatório por período soma isto. */
export interface DailyOperatorAggregate {
  day: DayKey;
  operatorId: OperatorId;
  orders: number;
  simpleOrders: number;
  mixedOrders: number;
  /** max(0.2, última atividade - início) daquele dia, em horas. 0 se não houve pedido. */
  hours: number;
  /** início = menor entre o primeiro bipe e o primeiro registro de acesso do dia */
  startAt: string | null;
  lastActivityAt: string | null;
}

/** Um SKU num dia (para ranking de produtos e planejamento). */
export interface DailySkuAggregate {
  day: DayKey;
  sku: string;
  /** bipagens que contêm o SKU */
  orders: number;
  /** soma de item.quantity */
  units: number;
  /** bipagens em que o SKU dividiu a caixa com outro SKU (pedido misto) */
  mixedOrders: number;
}

/** Status calculado (não é o cadastro). Mesma regra do app.js antigo. */
export type ActivityStatus = 'ativo' | 'ausente' | 'inativo';

/** Por que um operador está "ausente" (o app antigo não distinguia; a fórmula é a mesma). */
export type AwayReason = 'saiu-da-bancada' | 'sem-atividade' | 'sem-registro';

export interface Actor {
  id: string;
  name: string;
}

export type AuditAction =
  | 'meta-global.definir'
  | 'meta-global.remover'
  | 'meta-individual.definir'
  | 'meta-programada.definir'
  | 'operador.criar'
  | 'operador.editar'
  | 'operador.cadastro'
  | 'usuario.convidar'
  | 'usuario.perfil'
  | 'usuario.status'
  | 'previsao.equipe'
  | 'dispositivo.parear'
  | 'dispositivo.revogar'
  /* geradas pelos gatilhos de auditoria do banco (supabase/migrations/0002) */
  | 'operador.excluir'
  | 'previsao.configurar'
  | 'previsao.embalagem'
  | 'dispositivo.editar'
  | 'dispositivo.aprovar'
  | 'desfazer'
  /* ação que o front ainda não conhece (tabela nova com gatilho de auditoria) */
  | 'outro';

export interface AuditEntry {
  id: string;
  at: string;
  actor: Actor;
  action: AuditAction;
  /** Frase pronta para exibir, em português: "alterou a meta global de 38 para 40/h". */
  summary: string;
  target?: { type: 'operador' | 'usuario' | 'config' | 'dispositivo'; id: string; label: string };
  before?: unknown;
  after?: unknown;
}

/** Meta global programada para um dia futuro (exige tabela nova no banco; ver docs/seguranca.md). */
export interface GoalScheduleEntry {
  day: DayKey;
  /** null = "sem meta global neste dia" */
  value: number | null;
  note?: string;
  createdBy: Actor;
  createdAt: string;
}

export interface OperatorInput {
  id: OperatorId;
  name: string;
  individualGoal: number;
}

/** Usuário do painel (hoje `usuarios_painel`; na nuvem, Supabase Auth). */
export interface PanelUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: Role;
  status: 'ativo' | 'convidado' | 'desativado';
  lastSignInAt: string | null;
  mfaEnrolled: boolean;
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type LiveEvent =
  | { type: 'scan'; scan: ScanEvent }
  | { type: 'access'; access: AccessEvent }
  | { type: 'operators-changed' }
  | { type: 'config-changed'; config: GeneralConfig }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'goal-schedule-changed' }
  | { type: 'users-changed' }
  | { type: 'connection'; state: ConnectionState }
  /** a fonte perdeu eventos (reconexão, virada do dia): recarregar tudo */
  | { type: 'resync' };

/** O que a fonte de dados atual consegue fazer. A UI usa isto para desligar controles. */
export interface DataCapabilities {
  /** Gravar metas, operadores, usuários. false no modo Supabase desta fase (somente leitura). */
  write: boolean;
  /** Há histórico de alterações com autor. */
  audit: boolean;
  realtime: boolean;
  /** Meta programada por dia (precisa de tabela nova no banco). */
  goalSchedule: boolean;
  /** Convidar, mudar perfil, desativar usuário. */
  userManagement: boolean;
}

/**
 * Fonte de dados operacionais da Expedição. Implementada por:
 *   - src/data/demo      (dados de exemplo, gravação em memória + localStorage)
 *   - src/data/supabase  (dados reais, SOMENTE LEITURA nesta fase)
 *
 * Previsão e Planejamento têm fontes próprias dentro das suas features.
 */
export interface OperationsSource {
  readonly mode: 'demo' | 'supabase';
  readonly capabilities: DataCapabilities;
  /** Relógio da fonte. O demo pode deslocar o horário; a UI nunca usa new Date() para regra de negócio. */
  now(): Date;

  listOperators(): Promise<Operator[]>;
  getConfig(): Promise<GeneralConfig>;
  /** Eventos crus de um dia (fuso de São Paulo), em ordem crescente de horário. */
  getDayEvents(day: DayKey): Promise<DayEvents>;
  /** Agregados por operador e dia, de `from` a `to` inclusive. Pode incluir hoje (até agora). */
  getDailyAggregates(from: DayKey, to: DayKey): Promise<DailyOperatorAggregate[]>;
  getDailySkuAggregates(from: DayKey, to: DayKey): Promise<DailySkuAggregate[]>;

  listAudit(options: { limit: number; before?: string }): Promise<AuditEntry[]>;
  listGoalSchedule(from: DayKey, to: DayKey): Promise<GoalScheduleEntry[]>;
  listPanelUsers(): Promise<PanelUser[]>;

  /** Todas as gravações lançam erro se capabilities.write for false. */
  setGlobalGoal(value: number | null, actor: Actor): Promise<void>;
  setIndividualGoals(operatorIds: OperatorId[], value: number, actor: Actor): Promise<void>;
  saveOperator(input: OperatorInput, actor: Actor): Promise<void>;
  setOperatorRegistration(id: OperatorId, registration: Operator['registration'], actor: Actor): Promise<void>;
  setGoalSchedule(day: DayKey, value: number | null, actor: Actor, note?: string): Promise<void>;
  invitePanelUser(input: { name: string; email: string; role: Role }, actor: Actor): Promise<void>;
  setPanelUserRole(id: string, role: Role, actor: Actor): Promise<void>;
  /** Manda o e-mail do convite de novo para quem ainda não aceitou (o link anterior deixa de valer). */
  resendPanelUserInvite?(id: string, actor: Actor): Promise<void>;
  setPanelUserStatus(id: string, status: 'ativo' | 'desativado', actor: Actor): Promise<void>;

  /** Assina eventos ao vivo. Devolve a função que cancela a assinatura. */
  subscribe(listener: (event: LiveEvent) => void): () => void;
}

/* ====================================================================
   MODELOS DE TELA (montados por src/data/hooks a partir de src/lib/metrics)
   ==================================================================== */

export type RangeKey = 'hoje' | '7d' | '30d';
export type CompareKey = 'dia-util-anterior' | 'semana-passada' | 'periodo-anterior';
export type MetricKey = 'pedidos' | 'ritmo' | 'ativos' | 'mistos';

export interface KpiValue {
  value: number | null;
  compare: number | null;
}

export interface Bucket {
  /** "07h" ou "2026-11-04" */
  key: string;
  /** rótulo do eixo: "07h", "qua 04/11" */
  label: string;
  /** hora em andamento */
  partial: boolean;
  /** ainda não aconteceu (horas depois de agora) */
  future: boolean;
  values: Record<MetricKey, number | null>;
  compare: Record<MetricKey, number | null>;
}

export interface OperatorRow {
  id: OperatorId;
  name: string;
  station: StationId | null;
  status: ActivityStatus;
  awayReason: AwayReason | null;
  startAt: string | null;
  lastActivityAt: string | null;
  orders: number;
  simpleOrders: number;
  mixedOrders: number;
  hours: number;
  /** pedidos/h. Mesma definição em toda a aplicação (src/lib/metrics.ts). */
  rate: number | null;
  individualGoal: number;
  effectiveGoal: number;
  goalSource: 'global' | 'individual';
  /** rate / effectiveGoal */
  goalRatio: number | null;
  /** só em período */
  daysWorked?: number;
  /** comparação (mesmo operador no período de comparação) */
  compareOrders?: number | null;
  compareRate?: number | null;
}

export interface ProductRow {
  sku: string;
  orders: number;
  units: number;
  mixedOrders: number;
}

export interface OverviewModel {
  range: RangeKey;
  compare: CompareKey;
  /** "Hoje", "Últimos 7 dias úteis" */
  label: string;
  /** "05/11, até 14:20" */
  sublabel: string;
  /** "Dia útil anterior, mesmo horário" */
  compareLabel: string;
  /** dias cobertos pelo período e pela comparação */
  days: DayKey[];
  compareDays: DayKey[];
  generatedAt: string;
  kpis: Record<MetricKey, KpiValue>;
  buckets: Bucket[];
  operators: OperatorRow[];
  products: ProductRow[];
  globalGoal: number | null;
  globalGoalUpdatedAt: string | null;
}

export interface OperatorDayPoint {
  day: DayKey;
  orders: number;
  rate: number | null;
  mixedShare: number | null;
}

export interface OperatorHourPoint {
  hour: number;
  partial: boolean;
  future: boolean;
  orders: number | null;
}

/** Página e painel de detalhe do operador. */
export interface OperatorDetailModel {
  operator: Operator;
  /** hoje, até agora */
  today: OperatorRow;
  /** pedidos por hora hoje, só dele */
  hourly: OperatorHourPoint[];
  /** últimos 10 dias úteis com movimento, mais hoje no fim */
  recentDays: OperatorDayPoint[];
  /** últimos 30 dias (fechados) */
  last30: { orders: number; rate: number | null; daysWorked: number; mixedShare: number | null };
  /** atividade dele hoje, mais recente primeiro */
  activity: ActivityItem[];
  /** ritmo médio do time hoje (mesma fórmula) para comparação */
  teamRateToday: number | null;
}

export type ActivityKind = 'bipe' | 'entrada' | 'saida' | 'troca';

export interface ActivityItem {
  id: string;
  at: string;
  kind: ActivityKind;
  operatorId: OperatorId | null;
  operatorName: string | null;
  /** na troca: quem saiu */
  previousOperatorName?: string | null;
  station: StationId | null;
  /** bipe: SKUs do pacote */
  skus?: string[];
  mixed?: boolean;
}
