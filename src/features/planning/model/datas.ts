/**
 * Datas do planejamento: rótulos, meses e janela de leitura. Tudo em DayKey
 * (dia de São Paulo); nada depende do fuso do navegador. No arquivo antigo
 * estas funções usavam Date local.
 */
import { type DadosDias } from '@/lib/calendar';
import { type DayKey, atTime } from '@/lib/time';
import type { ContextoPlanejamento } from './types';

export const NOME_MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;
export const NOME_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
export const ABREV_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM' -> 'agosto/2026'. */
export function rotuloMes(chave: string): string {
  const mes = Number(chave.slice(5, 7));
  return `${NOME_MES[mes - 1] ?? ''}/${chave.slice(0, 4)}`;
}

/** 'YYYY-MM-DD' -> 'DD/MM'. */
export function ddmm(dia: DayKey): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Número do dia do mês de um DayKey. */
export function diaDoMes(dia: DayKey): number {
  return Number(dia.slice(8, 10));
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vier antes). */
export function diferencaDias(de: DayKey, ate: DayKey): number {
  const t = (d: DayKey) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(ate) - t(de)) / 86400000);
}

/** 'YYYY-MM' do mês `deslocamento` meses antes (ou depois, se positivo) de `chave`. */
export function deslocarMes(chave: string, deslocamento: number): string {
  const ano = Number(chave.slice(0, 4));
  const mes = Number(chave.slice(5, 7)) - 1 + deslocamento;
  const a = ano + Math.floor(mes / 12);
  const m = ((mes % 12) + 12) % 12;
  return `${a}-${pad(m + 1)}`;
}

/**
 * Os três meses do planejamento a partir de hoje: o corrente e os dois
 * FECHADOS anteriores. A janela anda sozinha com o calendário.
 */
export function chavesDoPlanejamento(hoje: DayKey): { chaveAtual: string; chaveB: string; chaveA: string } {
  const chaveAtual = hoje.slice(0, 7);
  return { chaveAtual, chaveB: deslocarMes(chaveAtual, -1), chaveA: deslocarMes(chaveAtual, -2) };
}

/**
 * Intervalo [inicio, fim) do mês em instantes absolutos, no fuso de São
 * Paulo. É o que a consulta `data_hora >= inicio and data_hora < fim` usa
 * (o arquivo antigo usava a meia-noite do navegador).
 */
export function intervaloDoMes(chave: string): { inicio: Date; fim: Date } {
  const inicio = atTime(`${chave}-01`, 0);
  const fim = atTime(`${deslocarMes(chave, 1)}-01`, 0);
  return { inicio, fim };
}

/** O que o calendário precisa do histórico para decidir "feriado trabalhado". */
export function dadosDias(ctx: ContextoPlanejamento): DadosDias {
  return { diasDoMes: (chave) => ctx.meses[chave]?.dias, hoje: ctx.hoje };
}
