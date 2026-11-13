/**
 * Exportação CSV que abre certo no Excel em português: separador ';',
 * vírgula decimal, BOM UTF-8 (acentos) e quebra de linha CRLF.
 *
 * Proteção contra injeção de fórmula: célula de texto que começa com
 * = + - @ (ou tab/CR) ganha um apóstrofo na frente, senão o Excel executaria
 * "=HYPERLINK(...)" vindo de um nome de operador ou SKU.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** casas decimais para números (padrão: inteiro se for inteiro, senão 1) */
  decimals?: number;
}

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined, decimals?: number): string {
  if (value == null) return '';
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const d = decimals ?? (Number.isInteger(value) ? 0 : 1);
    text = value.toFixed(d).replace('.', ',');
  } else {
    text = FORMULA_START.test(value) ? `'${value}` : value;
  }
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(';')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row), c.decimals)).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Dispara o download no navegador. Nome sem acento para não quebrar em sistema nenhum. */
export function downloadCsv(filename: string, csv: string): void {
  const safe = filename
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.csv') ? safe : `${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
