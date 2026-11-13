/**
 * Volta para onde a pessoa estava depois do login, sem abrir brecha de
 * "open redirect": só caminho interno que começa com UMA barra.
 *
 * Casos barrados (todos já foram usados em ataque real):
 *   //evil.com          protocolo relativo, sai do site
 *   /\evil.com          o navegador troca \ por / e vira //evil.com
 *   /\t/evil.com        o navegador remove TAB e quebra de linha da URL
 *   https://evil.com    absoluto
 *   javascript:...      esquema
 */

export const DEFAULT_AFTER_LOGIN = '/expedicao';
export const LOGIN_PATH = '/entrar';
export const MFA_PATH = '/entrar/verificacao';
export const RESET_PATH = '/entrar/redefinir';

const PROBE_ORIGIN = 'https://hope.invalid';

export function safeRedirectPath(raw: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (raw.includes('\\')) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;

  const path = url.pathname + url.search + url.hash;
  // Não volta para o próprio login (laço) nem cai em caminho normalizado para //.
  // Exceção: a nova senha, para onde a verificação em duas etapas devolve no fluxo de redefinição.
  if (path.startsWith('//')) return fallback;
  if (url.pathname === RESET_PATH) return path;
  if (url.pathname === LOGIN_PATH || url.pathname.startsWith(`${LOGIN_PATH}/`)) return fallback;
  return path;
}

/** Monta /entrar?para=<caminho atual> (ou outra tela do fluxo de login). */
export function loginRedirect(
  location: { pathname: string; search?: string; hash?: string },
  base: string = LOGIN_PATH,
): string {
  const here = `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
  const target = safeRedirectPath(here, '');
  if (!target || target === DEFAULT_AFTER_LOGIN) return base;
  return `${base}?para=${encodeURIComponent(target)}`;
}
