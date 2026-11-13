import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import { OPERATOR_CSV_COLUMNS, dayExtras, isValidDay, lastBusinessDays, parseReportQuery, presetRange, previousRange, reportFilename, sanitizeRange } from './period';

describe('atalhos de período', () => {
  it('mês atual vai do dia 1 até hoje', () => {
    expect(presetRange('mes', '2026-11-05')).toEqual({ from: '2026-11-01', to: '2026-11-05' });
  });
  it('mês anterior na virada do mês', () => {
    expect(presetRange('mes-anterior', '2026-11-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('mes-anterior', '2026-01-03')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('mês anterior de março em ano não bissexto', () => {
    expect(presetRange('mes-anterior', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('30 dias inclui hoje', () => {
    expect(presetRange('30d', '2026-11-05')).toEqual({ from: '2026-10-07', to: '2026-11-05' });
  });
  it('7 dias úteis pulam fim de semana e feriado', () => {
    // quinta 05/11; úteis: 05, 04, 03 (02/11 é feriado), 30/10, 29, 28, 27
    expect(lastBusinessDays('2026-11-05', 7)).toEqual({ from: '2026-10-27', to: '2026-11-05' });
  });
});

describe('7 dias trabalhados', () => {
  const worked = {
    current: ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-03', '2026-11-04', '2026-11-05'],
    previous: ['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
  };
  it('usa o dado: início no primeiro dia trabalhado, comparação nos 7 anteriores', () => {
    expect(presetRange('7u', '2026-11-05', worked)).toEqual({ from: '2026-10-27', to: '2026-11-05' });
    expect(previousRange({ from: '2026-10-27', to: '2026-11-05' }, '7u', worked)).toEqual({ from: '2026-10-15', to: '2026-10-23' });
  });
  it('feriado trabalhado entra (12/10) e a consulta usa o dado', () => {
    const w = { current: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20'], previous: [] };
    expect(parseReportQuery({}, '2026-10-20', w).from).toBe('2026-10-12');
  });
});

describe('saneamento', () => {
  it('troca datas invertidas', () => {
    const r = sanitizeRange('2026-11-04', '2026-11-01', '2026-11-05');
    expect(r.from).toBe('2026-11-01');
    expect(r.to).toBe('2026-11-04');
    expect(r.warnings).toHaveLength(1);
  });
  it('corta data futura', () => {
    const r = sanitizeRange('2026-11-01', '2026-12-30', '2026-11-05');
    expect(r.to).toBe('2026-11-05');
    expect(r.warnings).toHaveLength(1);
  });
  it('início no futuro vira hoje', () => {
    const r = sanitizeRange('2026-12-01', '2026-12-30', '2026-11-05');
    expect(r.from).toBe('2026-11-05');
    expect(r.to).toBe('2026-11-05');
  });
  it('valida dias que não existem', () => {
    expect(isValidDay('2026-02-31')).toBe(false);
    expect(isValidDay('2026-2-3')).toBe(false);
    expect(isValidDay('2026-02-28')).toBe(true);
  });
  it('URL lixo cai no padrão', () => {
    const q = parseReportQuery({ periodo: 'xyz', de: 'abc', vs: 'qualquer' }, '2026-11-05');
    expect(q.preset).toBe('7u');
    expect(q.compare).toBe('anterior');
    expect(q.warnings).toEqual([]);
  });
  it('de e ate sem periodo viram personalizado, com operadores', () => {
    const q = parseReportQuery({ de: '2026-11-04', ate: '2026-11-01', vs: 'nenhum', operadores: 'OP-1, OP-2,OP-1' }, '2026-11-05');
    expect(q.preset).toBe('custom');
    expect(q.from).toBe('2026-11-01');
    expect(q.compare).toBe('nenhum');
    expect(q.operatorIds).toEqual(['OP-1', 'OP-2']);
    expect(q.warnings.length).toBe(1);
  });
});

describe('comparação', () => {
  it('período anterior tem o mesmo tamanho', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-05' }, 'mes')).toEqual({ from: '2026-10-27', to: '2026-10-31' });
  });
  it('mês anterior compara com o mês antes dele', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-31' }, 'mes-anterior')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});

describe('CSV', () => {
  it('nome do arquivo e colunas', () => {
    expect(reportFilename({ from: '2026-11-01', to: '2026-11-05' })).toBe('relatorio-expedicao-2026-11-01-a-2026-11-05.csv');
    const csv = toCsv(
      [{ name: 'Ana', orders: 100, hours: 4, rate: 25, mixedOrders: 10, simpleOrders: 90, effectiveGoal: 35, goalRatio: 0.714, daysWorked: 2 }],
      OPERATOR_CSV_COLUMNS,
    );
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Operador;Pedidos;Dias trabalhados;Horas;Ritmo (pedidos/h);Pedidos mistos;Pedidos mistos (%);Meta (pedidos/h);Contra a meta atual (%)');
    expect(lines[1]).toBe('Ana;100;2;4,0;25,0;10;10,0;35;71');
  });
});

describe('indicadores por dia', () => {
  it('ignora dia sem movimento e conta sábado trabalhado', () => {
    const r = dayExtras([
      { day: '2026-10-30', orders: 1000 },
      { day: '2026-10-31', orders: 200 },
      { day: '2026-11-01', orders: 0 },
      { day: '2026-11-03', orders: null },
    ]);
    expect(r).toEqual({ workedDays: 2, avgPerWorkedDay: 600, saturdays: 1 });
  });
});
