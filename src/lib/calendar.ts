/**
 * Calendário de feriados, portado de ../../dashboard-expedicao/planejamento.js (CONTRATO do projeto).
 * A paridade com o arquivo antigo é testada em
 * src/features/planning/model/paridade.test.ts (feriados de 2026 a 2028, dia a dia).
 *
 * Duas perguntas diferentes (../../dashboard-expedicao/CLAUDE.md, revisado em 03/11/2026):
 *   ehFeriado(d)      "é feriado no calendário?"  rótulo, tooltip, agenda
 *   feriadoParado(d)  "o galpão parou?"           conta de dia útil, transferência de volume
 * Feriado no calendário NÃO é galpão parado: 12/10/2026 teve 901 pedidos.
 *
 * Datas móveis saem da Páscoa (Meeus/Butcher), então nada precisa de manutenção
 * em 2027 e 2028. Carnaval e Corpus Christi entram como dia não trabalhado:
 * são ponto facultativo no papel, mas o galpão para.
 *
 * Todas as datas são DayKey ('YYYY-MM-DD', dia de São Paulo). Nenhuma função
 * aqui depende do fuso do navegador.
 */
import { type DayKey, addDays, isWeekend } from './time';

export interface Holiday {
  day: DayKey;
  name: string;
  /** nacional, estadual (SP), municipal (São Paulo) ou facultativo que o galpão respeita */
  scope: 'nacional' | 'estadual' | 'municipal' | 'facultativo';
  /** Rótulo como o planejamento.js antigo o escrevia: 'nacional', 'SP estadual', 'SP municipal', 'facultativo'. */
  scopeLabel: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Domingo de Páscoa (algoritmo de Meeus/Butcher, calendário gregoriano). */
export function easterSunday(year: number): DayKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const cache = new Map<number, Holiday[]>();

/**
 * Feriados do ano, ordenados por data. Quando duas regras caem no mesmo dia
 * (ex.: Sexta-feira Santa em 21/04), vale a ÚLTIMA, como no arquivo antigo,
 * que guardava os feriados num objeto indexado pela data.
 */
export function holidaysOf(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const porDia = new Map<DayKey, Holiday>();
  const por = (day: DayKey, name: string, scope: Holiday['scope'], scopeLabel: string) => {
    porDia.set(day, { day, name, scope, scopeLabel });
  };
  const fixo = (md: string) => `${year}-${md}`;

  por(fixo('01-01'), 'Confraternização Universal', 'nacional', 'nacional');
  por(fixo('04-21'), 'Tiradentes', 'nacional', 'nacional');
  por(fixo('05-01'), 'Dia do Trabalho', 'nacional', 'nacional');
  por(fixo('09-07'), 'Independência', 'nacional', 'nacional');
  por(fixo('10-12'), 'Nossa Senhora Aparecida', 'nacional', 'nacional');
  por(fixo('11-02'), 'Finados', 'nacional', 'nacional');
  por(fixo('11-15'), 'Proclamação da República', 'nacional', 'nacional');
  por(fixo('11-20'), 'Consciência Negra', 'nacional', 'nacional');
  por(fixo('12-25'), 'Natal', 'nacional', 'nacional');

  por(fixo('07-09'), 'Revolução Constitucionalista', 'estadual', 'SP estadual');
  por(fixo('01-25'), 'Aniversário de São Paulo', 'municipal', 'SP municipal');

  por(addDays(easter, -48), 'Carnaval', 'facultativo', 'facultativo');
  por(addDays(easter, -47), 'Carnaval', 'facultativo', 'facultativo');
  por(addDays(easter, -2), 'Sexta-feira Santa', 'nacional', 'nacional');
  por(addDays(easter, 60), 'Corpus Christi', 'facultativo', 'facultativo');

  const list = [...porDia.values()].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
  cache.set(year, list);
  return list;
}

/** Feriado do calendário naquele dia, ou null. NÃO diz se o galpão parou (use feriadoParado). */
export function ehFeriado(day: DayKey): Holiday | null {
  return holidaysOf(Number(day.slice(0, 4))).find((h) => h.day === day) ?? null;
}

/** Segunda a sexta (sem olhar feriado). Equivale ao `ehUtil` do arquivo antigo. */
export function ehUtil(day: DayKey): boolean {
  return !isWeekend(day);
}

/**
 * Fração da mediana dos dias úteis comuns do mês a partir da qual o feriado
 * conta como trabalhado. Pega o 12/10 (901 contra mediana ~775) e ignora
 * bipagem solta: sábado de resíduo faz 20 a 50 pedidos.
 */
export const FRACAO_FERIADO_TRABALHADO = 0.25;

/**
 * Feriados que a liderança decidiu trabalhar no FUTURO (no passado, o dado decide).
 * Formato 'YYYY-MM-DD': true.
 */
export const FERIADOS_TRABALHADOS_PLANEJADOS: Record<DayKey, true> = {};

/**
 * O que o histórico sabe: pedidos por dia de cada mês ('YYYY-MM') e o dia de
 * hoje. Sem isso, só vale a lista de feriados planejados.
 */
export interface DadosDias {
  diasDoMes: (chave: string) => Readonly<Record<DayKey, number>> | undefined;
  hoje: DayKey;
}

/** Todos os dias do mês 'YYYY-MM', como DayKey. */
export function diasDoMes(chave: string): DayKey[] {
  const ano = Number(chave.slice(0, 4));
  const mes = Number(chave.slice(5, 7));
  const n = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const out: DayKey[] = [];
  for (let d = 1; d <= n; d++) out.push(`${chave.slice(0, 4)}-${pad(mes)}-${pad(d)}`);
  return out;
}

/**
 * O galpão trabalhou neste dia de calendário?
 *
 * No HISTÓRICO o dado decide: movimento de pelo menos FRACAO_FERIADO_TRABALHADO
 * da mediana dos dias úteis comuns do mês. No FUTURO (e em hoje) não há dado:
 * vale só FERIADOS_TRABALHADOS_PLANEJADOS.
 */
export function feriadoTrabalhado(day: DayKey, dados?: DadosDias): boolean {
  if (FERIADOS_TRABALHADOS_PLANEJADOS[day]) return true;
  if (!dados) return false;
  const chave = day.slice(0, 7);
  const dias = dados.diasDoMes(chave);
  if (!dias || day >= dados.hoje) return false;
  const n = dias[day] || 0;
  if (!n) return false;
  const comuns: number[] = [];
  for (const x of diasDoMes(chave)) {
    const v = dias[x];
    if (v && ehUtil(x) && !ehFeriado(x)) comuns.push(v);
  }
  if (!comuns.length) return false;
  comuns.sort((a, b) => a - b);
  return n >= FRACAO_FERIADO_TRABALHADO * (comuns[Math.floor(comuns.length / 2)] ?? 0);
}

/**
 * Feriado em que o galpão PAROU: o único que tira o dia da conta. Use este, e
 * não ehFeriado(), em tudo que pergunta "houve expedição?".
 */
export function feriadoParado(day: DayKey, dados?: DadosDias): Holiday | null {
  const f = ehFeriado(day);
  return f && !feriadoTrabalhado(day, dados) ? f : null;
}

/**
 * Dia útil para CONTA: segunda a sexta, menos feriado parado.
 * `worked` = dias de feriado em que o galpão trabalhou (vem do dado no
 * histórico, ou de FERIADOS_TRABALHADOS_PLANEJADOS no futuro).
 */
export function isBusinessDay(day: DayKey, worked?: ReadonlySet<DayKey>): boolean {
  if (isWeekend(day)) return false;
  if (!ehFeriado(day)) return true;
  return Boolean(worked?.has(day) || FERIADOS_TRABALHADOS_PLANEJADOS[day]);
}
