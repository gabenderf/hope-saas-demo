/**
 * Código de pareamento de dispositivo: 8 letras e números, sem os que se
 * confundem de longe numa TV (0/O, 1/I/L). Mesmo alfabeto da coluna
 * pareamentos.codigo (supabase/migrations/0006).
 */

export const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;
/** validade do código na tela da TV */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** Sorteio sem viés (rejeita bytes que distorceriam a distribuição). */
export function generatePairingCode(random: (n: number) => Uint8Array = defaultRandom): string {
  const n = PAIRING_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < PAIRING_CODE_LENGTH) {
    for (const byte of random(PAIRING_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      out += PAIRING_ALPHABET[byte % n];
      if (out.length === PAIRING_CODE_LENGTH) break;
    }
  }
  return out;
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** O que a pessoa digitou ("k7m4 qx9p", "K7M4-QX9P") vira "K7M4QX9P". */
export function normalizePairingCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidPairingCode(code: string): boolean {
  if (code.length !== PAIRING_CODE_LENGTH) return false;
  for (const ch of code) if (!PAIRING_ALPHABET.includes(ch)) return false;
  return true;
}

/** "K7M4QX9P" vira "K7M4-QX9P" (mais fácil de ler e ditar). */
export function formatPairingCode(code: string): string {
  return code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** "9:41" para a contagem regressiva. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
