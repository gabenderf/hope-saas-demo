import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatPairingCode,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
  PAIRING_ALPHABET,
} from './pairing';

describe('código de pareamento', () => {
  it('alfabeto sem caracteres que se confundem de longe', () => {
    for (const ch of '01ILO') expect(PAIRING_ALPHABET).not.toContain(ch);
    expect(PAIRING_ALPHABET).toHaveLength(31);
  });

  it('gera 8 caracteres válidos', () => {
    for (let i = 0; i < 50; i += 1) {
      const c = generatePairingCode();
      expect(c).toHaveLength(8);
      expect(isValidPairingCode(c)).toBe(true);
    }
  });

  it('descarta bytes que dariam viés', () => {
    // 248 é o primeiro byte rejeitado (256 - 256 % 31); 0 vira "A"
    const bytes = [248, 255, 0, 0, 0, 0, 0, 0, 0, 0];
    const code = generatePairingCode(() => Uint8Array.from(bytes));
    expect(code).toBe('AAAAAAAA');
  });

  it('normaliza o que a pessoa digita', () => {
    expect(normalizePairingCode('k7m4-qx9p')).toBe('K7M4QX9P');
    expect(normalizePairingCode(' K7M4 QX9P ')).toBe('K7M4QX9P');
  });

  it('recusa formato errado e caractere ambíguo', () => {
    expect(isValidPairingCode('K7M4QX9')).toBe(false);
    expect(isValidPairingCode('K7M4QX9O')).toBe(false);
    expect(isValidPairingCode('K7M4QX91')).toBe(false);
  });

  it('formata para leitura', () => {
    expect(formatPairingCode('K7M4QX9P')).toBe('K7M4-QX9P');
    expect(formatCountdown(9 * 60_000 + 41_000)).toBe('9:41');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
