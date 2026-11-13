/**
 * Linha do banco → tipo de domínio (src/data/types.ts).
 *
 * Formatos conferidos no banco real em 05/11/2026 (somente leitura):
 *  - id_registro e id_log chegam como número (bigserial); viram string.
 *  - data_hora chega como "2026-11-05T17:59:26.013851+00:00" (microssegundos, UTC).
 *  - bancada: "Bancada 04" (atual), "Bancada 1" (junho/2026), "04" (alguns
 *    logs), "Liderança 1" e "Admin" (logs de quem não é bancada).
 *  - itens: array JSONB de {sku, quantidade:number}; null nas linhas antigas
 *    de junho/2026 (antes da extensão ler itens).
 *  - quantidade_pedidos: sempre 1 até hoje.
 */
import type { Role } from '@/auth/types';
import { DEFAULT_INDIVIDUAL_GOAL } from '@/lib/metrics';
import type { AccessEvent, GeneralConfig, GoalScheduleEntry, Operator, OrderItem, PanelUser, ScanEvent, StationId } from '../types';
import type { Row } from './port';

export const SCAN_COLUMNS = 'id_registro,id_operador,data_hora,quantidade_pedidos,bancada,codigo_rastreio,itens,num_pedido';
export const ACCESS_COLUMNS = 'id_log,data_hora,bancada,id_anterior,id_novo,justificativa';
export const OPERATOR_COLUMNS = 'id_operador,nome_colaborador,meta_horaria,status';
export const CONFIG_COLUMNS = 'id,meta_horaria_global,atualizado_em';
/** A anon key só lê estas duas colunas (GRANT por coluna). `select=*` dá 401. */
export const PANEL_USER_COLUMNS = 'username,role';

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/**
 * "Bancada 03", "Bancada 3", "bancada03", "03" e "3" viram "03". O que não é
 * bancada numerada ("Liderança 1", "Admin") passa como veio, sem espaços nas pontas.
 */
export function normalizeStation(raw: unknown): StationId | null {
  const s = str(raw);
  if (!s) return null;
  const m = /^(?:bancada\s*)?0*(\d+)$/i.exec(s);
  if (m) return m[1]!.padStart(2, '0');
  return s;
}

/**
 * Instante ISO em UTC com milissegundos. O PostgREST manda microssegundos e
 * "+00:00"; normalizar evita depender de o Date.parse aceitar 6 casas.
 */
export function normalizeInstant(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const trimmed = s
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    // "+00" (fuso curto do Postgres) vira "+00:00"
    .replace(/(T[^+-]*[+-]\d{2})$/, '$1:00');
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * `itens` pode chegar como array (jsonb) ou como texto JSON. Quantidade
 * ausente ou inválida conta 1 (o item foi listado, então saiu ao menos uma
 * peça). Item sem SKU é descartado. Formato irreconhecível = null (linha
 * antiga: conta como pedido simples, mesma regra do app.js).
 */
export function parseItems(raw: unknown): OrderItem[] | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const out: OrderItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const sku = str(e.sku);
    if (!sku) continue;
    const q = Number(e.quantidade ?? e.quantity);
    out.push({ sku, quantity: Number.isFinite(q) && q >= 0 ? q : 1 });
  }
  return out;
}

export function toScan(row: Row): ScanEvent | null {
  const id = str(row.id_registro);
  const operatorId = str(row.id_operador);
  const at = normalizeInstant(row.data_hora);
  if (!id || !operatorId || !at) return null;
  const count = row.quantidade_pedidos == null ? NaN : Number(row.quantidade_pedidos);
  return {
    id,
    operatorId,
    at,
    // DEFAULT 1 no banco
    orderCount: Number.isFinite(count) ? count : 1,
    station: normalizeStation(row.bancada),
    trackingCode: str(row.codigo_rastreio),
    orderNumber: str(row.num_pedido),
    items: parseItems(row.itens),
  };
}

export function toAccess(row: Row): AccessEvent | null {
  const id = str(row.id_log);
  const at = normalizeInstant(row.data_hora);
  if (!id || !at) return null;
  return {
    id,
    at,
    station: normalizeStation(row.bancada),
    previousOperatorId: str(row.id_anterior),
    nextOperatorId: str(row.id_novo),
    reason: str(row.justificativa),
  };
}

/** `op.meta_horaria || 35` no app.js: nulo, zero ou inválido vira 35. */
export function toOperator(row: Row): Operator | null {
  const id = str(row.id_operador);
  if (!id) return null;
  const goal = Number(row.meta_horaria);
  return {
    id,
    name: str(row.nome_colaborador) ?? id,
    individualGoal: Number.isFinite(goal) && goal > 0 ? goal : DEFAULT_INDIVIDUAL_GOAL,
    registration: str(row.status)?.toLowerCase() === 'inativo' ? 'inativo' : 'ativo',
  };
}

/**
 * Meta global não positiva vira null (sem meta global): uma meta 0 faria todo
 * mundo dividir por zero na razão da meta.
 */
export function toConfig(row: Row | null | undefined): GeneralConfig {
  if (!row) return { globalGoal: null, updatedAt: null };
  const goal = row.meta_horaria_global == null ? NaN : Number(row.meta_horaria_global);
  return {
    globalGoal: Number.isFinite(goal) && goal > 0 ? goal : null,
    updatedAt: normalizeInstant(row.atualizado_em),
  };
}

/** `usuarios_painel` hoje: só username e role. Papel 'admin' = admin; o resto ('user') = leitura. */
export function toPanelUser(row: Row): PanelUser | null {
  const username = str(row.username);
  if (!username) return null;
  return {
    id: username,
    name: username,
    email: null,
    username,
    role: str(row.role)?.toLowerCase() === 'admin' ? 'admin' : 'leitura',
    status: 'ativo',
    lastSignInAt: null,
    mfaEnrolled: false,
  };
}

const ROLES: readonly Role[] = ['admin', 'lideranca', 'leitura', 'tv'];

/**
 * Linha de `listar_usuarios_painel` (login de verdade) → PanelUser.
 * Status: desativado vence; senão convite pendente = 'convidado'; senão 'ativo'.
 * Papel desconhecido cai no menor privilégio ('leitura').
 */
export function toPanelUserFromRpc(row: Row): PanelUser | null {
  const id = str(row.user_id);
  if (!id) return null;
  const papel = str(row.papel);
  const status = str(row.status) === 'desativado' ? 'desativado' : row.convite_pendente === true ? 'convidado' : 'ativo';
  return {
    id,
    name: str(row.nome) ?? str(row.email) ?? id,
    email: str(row.email),
    username: null,
    role: ROLES.find((r) => r === papel) ?? 'leitura',
    status,
    lastSignInAt: normalizeInstant(row.ultimo_acesso),
    mfaEnrolled: row.mfa_cadastrado === true,
  };
}

/** Ordem cronológica com desempate pelo id numérico (mesma ordem da consulta). */
export function compareEvents(a: { at: string; id: string }, b: { at: string; id: string }): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return compareIds(a.id, b.id);
}

export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.length !== b.length) return a.length - b.length;
  }
  return a < b ? -1 : 1;
}

export function mapRows<T>(rows: Row[], fn: (r: Row) => T | null): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const v = fn(r);
    if (v != null) out.push(v);
  }
  return out;
}

export const GOAL_SCHEDULE_COLUMNS = 'dia,valor,nota,criado_por,criado_em';

/**
 * `metas_programadas` → entrada da agenda. O nome de quem criou não está na
 * tabela (só o uuid) e nenhuma tela o mostra: fica vazio.
 */
export function toGoalScheduleEntry(row: Row): GoalScheduleEntry | null {
  const day = str(row.dia)?.slice(0, 10);
  if (!day) return null;
  const value = row.valor == null ? NaN : Number(row.valor);
  const note = str(row.nota);
  return {
    day,
    value: Number.isFinite(value) ? value : null,
    ...(note ? { note } : {}),
    createdBy: { id: str(row.criado_por) ?? '', name: '' },
    createdAt: normalizeInstant(row.criado_em) ?? '',
  };
}
