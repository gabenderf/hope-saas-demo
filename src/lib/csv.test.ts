import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  const cols = [
    { header: 'Operador', value: (r: { n: string; v: number }) => r.n },
    { header: 'Ritmo (/h)', value: (r: { n: string; v: number }) => r.v, decimals: 1 },
  ];

  it('usa ; e vírgula decimal, com BOM e CRLF', () => {
    const csv = toCsv([{ n: 'Ana', v: 37.14 }], cols);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿Operador;Ritmo (/h)\r\nAna;37,1\r\n');
  });

  it('neutraliza fórmula vinda de texto', () => {
    const csv = toCsv([{ n: '=HYPERLINK("x")', v: 1 }], cols);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('cita campo com separador ou aspas', () => {
    expect(toCsv([{ n: 'a;b', v: 2 }], cols)).toContain('"a;b";2,0');
  });
});
