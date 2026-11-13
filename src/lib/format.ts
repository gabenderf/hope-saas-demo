/**
 * Formatação pt-BR. Toda tela usa estas funções, para "37,1/h" ser escrito
 * igual em todo lugar.
 *
 * Regra de texto: nenhum travessão (U+2014) nem meia-risca (U+2013) em texto
 * visível. Sinal negativo é o hífen que o Intl já usa.
 */
import { format as dfFormat } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { type DayKey, addDays, atTime, dayKeyOf, weekdayOf, zoned } from './time';

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatInt = (n: number) => int.format(Math.round(n));
export const formatDec1 = (n: number) => dec1.format(n);

/** "37,1/h" */
export const formatRate = (n: number | null | undefined) => (n == null ? 'sem dado' : `${dec1.format(n)}/h`);

/** ratio 0.931 -> "93%" */
export const formatRatio = (ratio: number | null | undefined) =>
  ratio == null ? 'sem dado' : `${int.format(Math.round(ratio * 100))}%`;

/** 12.4 -> "+12,4%"; -3 -> "-3,0%" */
export const formatSignedPercent = (p: number) => `${p > 0 ? '+' : ''}${dec1.format(p)}%`;

/** pontos percentuais: 0.4 -> "+0,4 p.p." */
export const formatSignedPoints = (pp: number) => `${pp > 0 ? '+' : ''}${dec1.format(pp)} p.p.`;

/** "14:20" no fuso de São Paulo */
export const formatTime = (iso: string | Date) => dfFormat(zoned(iso), 'HH:mm');

/** "05/11" */
export const formatDayShort = (day: DayKey) => dfFormat(zoned(atTime(day, 12)), 'dd/MM');

/**
 * Tabela fixa: o date-fns em pt-BR devolve "quinta" no EEE e "sab" (sem
 * acento) no EEEEEE. Aqui é sempre a forma de 3 letras, com acento.
 */
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "qua 05/11" */
export const formatDayWithWeekday = (day: DayKey) => `${WEEKDAY_SHORT[weekdayOf(day)]} ${formatDayShort(day)}`;

/** "qua" */
export const formatWeekdayShort = (day: DayKey) => WEEKDAY_SHORT[weekdayOf(day)] ?? '';

/** "quinta-feira, 5 de novembro" */
export const formatDayLong = (day: DayKey) => dfFormat(zoned(atTime(day, 12)), "EEEE, d 'de' MMMM", { locale: ptBR });

/** "05/11 14:20" */
export const formatDateTime = (iso: string | Date) => dfFormat(zoned(iso), 'dd/MM HH:mm');

/** "há 40 s", "há 3 min", "há 2 h", "ontem 16:40", "02/11 09:12" */
export function formatRelative(iso: string | Date, now: Date): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 12) return `há ${h} h`;
  return formatDateTime(new Date(t));
}

/**
 * Quando algo aconteceu, para frase corrida: "às 14:20" (hoje),
 * "ontem às 18:20", "em 03/11 às 09:12". Dias no fuso de São Paulo.
 */
export function formatWhen(iso: string | Date, now: Date): string {
  const at = typeof iso === 'string' ? new Date(iso) : iso;
  const day = dayKeyOf(at);
  const today = dayKeyOf(now);
  const time = formatTime(at);
  if (day === today) return `às ${time}`;
  if (day === addDays(today, -1)) return `ontem às ${time}`;
  return `em ${formatDayShort(day)} às ${time}`;
}

/** "Larissa Mendonça" -> "LM" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

/** "Larissa Mendonça" -> "Larissa" */
export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
