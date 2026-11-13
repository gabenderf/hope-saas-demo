/**
 * Regra de verificação em duas etapas (TOTP).
 *
 * Admin e liderança mexem em meta, operador, usuário e dispositivo: senha
 * vazada sozinha não pode bastar. O banco exige o mesmo (aal2) nas policies,
 * então pular esta tela não dá acesso a nada.
 */
import { MFA_REQUIRED_ROLES, type MfaStage, type Role, type SessionUser } from './types';

export function roleRequiresMfa(role: Role, kind: SessionUser['kind']): boolean {
  if (kind === 'dispositivo') return false;
  return MFA_REQUIRED_ROLES.includes(role);
}

export interface MfaInput {
  role: Role;
  kind: SessionUser['kind'];
  /** nível da sessão atual, do claim `aal` do JWT */
  aal: string | null;
  /** a pessoa tem autenticador TOTP verificado */
  hasVerifiedFactor: boolean;
}

/**
 * 'ok'      entra
 * 'verify'  tem autenticador e a sessão ainda está em aal1: pedir o código
 * 'enroll'  o papel exige e não há autenticador: cadastrar antes de entrar
 *
 * Quem tem autenticador sempre verifica, mesmo num papel que não exige:
 * cadastrou porque quis a proteção, e o Supabase só sobe para aal2 assim.
 */
export function decideMfa(input: MfaInput): 'ok' | MfaStage {
  if (input.kind === 'dispositivo') return 'ok';
  if (input.aal === 'aal2') return 'ok';
  if (input.hasVerifiedFactor) return 'verify';
  if (roleRequiresMfa(input.role, input.kind)) return 'enroll';
  return 'ok';
}

/** Código TOTP: exatamente 6 dígitos (espaços do copiar e colar são removidos). */
export function normalizeTotpCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
