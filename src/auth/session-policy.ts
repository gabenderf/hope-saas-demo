/**
 * Quanto tempo o login de uma PESSOA vale (decidido pelo dono em 11/11/2026).
 *
 *   computador pessoal       15 dias, sem encerramento por inatividade
 *   computador compartilhado 12 h no máximo e sai depois de 30 min sem uso
 *
 * "Compartilhado" é escolhido na tela de login e fica guardado NESTE navegador:
 * é uma propriedade do aparelho, não da pessoa. O banco
 * (app.tem_permissao, migration 0009) só conhece o teto de 15 dias. O limite
 * menor do computador compartilhado vale no cliente, que encerra a sessão no
 * servidor ao sair. Ele protege contra a próxima pessoa na mesma cadeira, não
 * contra quem tem a senha (isso é papel do TOTP).
 *
 * Dispositivo (TV, bancada, coletor) não passa por aqui: vale até `expira_em`.
 */
import { IDLE_TIMEOUT_MS } from './idle';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Teto para qualquer pessoa. O banco repete em app.tem_permissao (0009). */
export const MAX_PERSON_SESSION_MS = 15 * DAY;
/** Teto no computador compartilhado (só no cliente). */
export const SHARED_MAX_SESSION_MS = 12 * HOUR;

export const SHARED_COMPUTER_KEY = 'hope.auth.computador-compartilhado';

export interface SessionPolicy {
  shared: boolean;
  /** duração máxima do login, contada a partir da senha */
  maxSessionMs: number;
  /** null = não encerra por inatividade */
  idleTimeoutMs: number | null;
}

export function sessionPolicy(shared: boolean): SessionPolicy {
  return shared
    ? { shared, maxSessionMs: SHARED_MAX_SESSION_MS, idleTimeoutMs: IDLE_TIMEOUT_MS }
    : { shared, maxSessionMs: MAX_PERSON_SESSION_MS, idleTimeoutMs: null };
}

/**
 * Sem storage (navegação privada, bloqueio de site) a resposta é "compartilhado":
 * na dúvida, o limite curto. Navegador que não guarda nada também não guarda a
 * escolha, então não daria para honrar um "pessoal" de verdade.
 */
export function readSharedComputer(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    if (!storage) return true;
    return storage.getItem(SHARED_COMPUTER_KEY) === '1';
  } catch {
    return true;
  }
}

export function writeSharedComputer(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, shared: boolean): void {
  try {
    if (shared) storage?.setItem(SHARED_COMPUTER_KEY, '1');
    else storage?.removeItem(SHARED_COMPUTER_KEY);
  } catch {
    /* sem storage: readSharedComputer já responde "compartilhado" */
  }
}

export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
