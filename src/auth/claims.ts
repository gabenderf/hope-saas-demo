/**
 * Leitura do perfil a partir do JWT do Supabase.
 *
 * O Custom Access Token Hook (supabase/migrations/0003) grava em
 * claims.app_metadata.hope:
 *
 *   { v: 1, tipo: 'pessoa' | 'dispositivo', papel, status, nome,
 *     modulos: { expedicao: 'lideranca', ... }, dispositivo_id? }
 *
 * O front usa isso só para montar a tela. Quem decide o acesso é o banco
 * (app.tem_permissao relê a tabela `membros` a cada consulta), então um
 * token adulterado no navegador não abre dado nenhum.
 *
 * Qualquer coisa fora do formato vira "conta sem perfil": nunca acesso total.
 */
import { z } from 'zod';
import { MAX_PERSON_SESSION_MS } from './session-policy';
import type { AccessDenialReason, ModuleId, Role, SessionUser } from './types';

const ROLES = ['admin', 'lideranca', 'leitura', 'tv'] as const satisfies readonly Role[];
const MODULES = ['expedicao', 'clientes', 'etiquetas', 'conciliacao'] as const satisfies readonly ModuleId[];
/** papéis que só existem no banco: credenciais de máquina que nunca abrem o painel */
const MACHINE_ROLES = ['bancada', 'coletor'] as const;

const hopeClaimSchema = z.object({
  v: z.literal(1),
  tipo: z.enum(['pessoa', 'dispositivo']),
  papel: z.enum([...ROLES, ...MACHINE_ROLES]),
  status: z.enum(['ativo', 'desativado']),
  nome: z.string().max(120).optional(),
  modulos: z.record(z.string(), z.string()).default({}),
  dispositivo_id: z.string().optional(),
});

export interface ClaimProfile {
  role: Role;
  kind: SessionUser['kind'];
  name: string | null;
  modules: ModuleId[];
  moduleRoles: Partial<Record<ModuleId, Role>>;
}

export type ClaimResult = { ok: true; profile: ClaimProfile } | { ok: false; reason: AccessDenialReason };

/** Decodifica o payload de um JWT (sem validar assinatura: quem valida é o servidor). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
function isModule(v: string): v is ModuleId {
  return (MODULES as readonly string[]).includes(v);
}

export function parseHopeClaims(claims: Record<string, unknown> | null): ClaimResult {
  const appMeta = claims?.app_metadata;
  const raw = appMeta && typeof appMeta === 'object' ? (appMeta as Record<string, unknown>).hope : undefined;
  const parsed = hopeClaimSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'sem-perfil' };
  const hope = parsed.data;

  if (hope.status !== 'ativo') return { ok: false, reason: 'desativado' };
  if (!isRole(hope.papel)) return { ok: false, reason: 'dispositivo' };
  // Pessoa nunca recebe o papel de TV, e dispositivo nunca recebe papel de pessoa.
  if (hope.tipo === 'dispositivo' && hope.papel !== 'tv') return { ok: false, reason: 'dispositivo' };
  if (hope.tipo === 'pessoa' && hope.papel === 'tv') return { ok: false, reason: 'sem-perfil' };

  const modules: ModuleId[] = [];
  const moduleRoles: Partial<Record<ModuleId, Role>> = {};
  for (const [mod, role] of Object.entries(hope.modulos)) {
    if (!isModule(mod) || !isRole(role)) continue;
    // Papel de módulo nunca passa do papel geral (admin de módulo exige admin geral).
    if (rank(role) > rank(hope.papel)) continue;
    modules.push(mod);
    if (role !== hope.papel) moduleRoles[mod] = role;
  }

  if (modules.length === 0 && hope.papel !== 'admin') return { ok: false, reason: 'sem-modulo' };

  return {
    ok: true,
    profile: {
      role: hope.papel,
      kind: hope.tipo,
      name: hope.nome?.trim() || null,
      modules,
      moduleRoles,
    },
  };
}

const RANK: Record<Role, number> = { tv: 0, leitura: 1, lideranca: 2, admin: 3 };
function rank(role: Role): number {
  return RANK[role];
}

/** Teto da sessão de PESSOA (15 dias; 12 h no computador compartilhado). Ver ./session-policy. */
export { MAX_PERSON_SESSION_MS };

/**
 * Quando a sessão começou, pelo claim `amr` (métodos de autenticação com o
 * horário de cada um). O mais antigo é o login com senha. null = sem claim.
 */
export function sessionStartedAt(claims: Record<string, unknown> | null): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  let min: number | null = null;
  for (const entry of amr) {
    const ts = entry && typeof entry === 'object' ? (entry as { timestamp?: unknown }).timestamp : undefined;
    if (typeof ts === 'number' && Number.isFinite(ts)) min = min === null ? ts : Math.min(min, ts);
  }
  return min === null ? null : min * 1000;
}

export function personSessionTooOld(
  claims: Record<string, unknown> | null,
  now: number,
  maxMs: number = MAX_PERSON_SESSION_MS,
): boolean {
  const started = sessionStartedAt(claims);
  return started !== null && now - started >= maxMs;
}
