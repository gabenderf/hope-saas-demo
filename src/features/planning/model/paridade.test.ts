// @vitest-environment node
/// <reference types="node" />
/**
 * PARIDADE com o ../../dashboard-expedicao/planejamento.js ORIGINAL (o que está em produção).
 *
 * O arquivo antigo é carregado do disco (mesmo método do ../../dashboard-expedicao/teste-pecas.js:
 * extrai o bloco de funções puras e executa) com um relógio fixo, e a saída
 * dele é comparada, número a número, com a do modelo novo, em cenários que
 * cobrem as viradas de janela. Se este teste falhar, ou o planejamento.js
 * mudou e o porte precisa acompanhar, ou o porte regrediu. Nunca "ajuste" o
 * esperado aqui para fazer passar: registre a divergência em
 * docs/planejamento-modelo.md.
 *
 * Diferenças de FORMATO que o normalizador absorve (não são de regra):
 *   - Date vira DayKey; o campo `data: Date` vira `diaSemana: number`;
 *   - listaPecas ganhou o campo `variantes` (o mesmo `detalhe`, estruturado).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FERIADOS_TRABALHADOS_PLANEJADOS,
  FRACAO_FERIADO_TRABALHADO,
  diasDoMes,
  easterSunday,
  ehFeriado,
  feriadoParado,
  feriadoTrabalhado,
  holidaysOf,
} from '@/lib/calendar';
import { addDays } from '@/lib/time';
import { agregar } from './agregar';
import { compararMeses, detectarParesNovos, diasUteisComMovimento, listaPecas, presencaViaParesNovos, totalSabados } from './comparar';
import {
  MIN_PECAS_SKU,
  MIN_PEDIDOS_SKU,
  ORDEM_PECAS,
  PAR_MIN_OCORRENCIAS,
  PAR_RAZAO_MES_ANTERIOR,
  PCT_COMBINADO,
  PCT_COMB_ATENCAO,
} from './constantes';
import { dadosDias } from './datas';
import {
  backtest,
  fatoresDiaSemana,
  historicoFeriados,
  mediaDiaUtil,
  medirOndaSpike,
  ondaDoTipo,
  projetar,
  realizadoUteis,
  simularMes,
  spikeDays,
  tetoObservado,
  validarFeriados,
} from './projecao';
import {
  FAMILIAS_PADRAO,
  GRUPOS_ESTOQUE,
  type Familias,
  baseEstoque,
  embalagensDe,
  escolherEmbalagem,
  grupoEstoque,
  multiplicador,
  pecasDe,
  prefixo,
} from './sku';
import { type Cenario, CATALOGO, cenarios } from './testes/fixture';
import { CAMINHO_CLAUDE_MD, CAMINHO_ORIGINAL, type Original, carregarOriginal, originalExiste } from './testes/original';
import type { ContextoPlanejamento, MesAgregado } from './types';

// ---------------------------------------------------------------------------
// Normalização de formato (Date -> DayKey etc.)
// ---------------------------------------------------------------------------

function normalizarAntigo(x: unknown, iso: (d: Date) => string): unknown {
  if (x instanceof Date) return iso(x);
  if (Array.isArray(x)) return x.map((v) => normalizarAntigo(v, iso));
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === 'data' && v instanceof Date) out['diaSemana'] = v.getDay();
      else out[k] = normalizarAntigo(v, iso);
    }
    return out;
  }
  return x;
}

function normalizarNovo(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(normalizarNovo);
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    const peca = 'detalheDoMesB' in x;
    for (const [k, v] of Object.entries(x)) {
      if (peca && k === 'variantes') continue;
      out[k] = normalizarNovo(v);
    }
    return out;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Montagem dos dois lados com os mesmos dados
// ---------------------------------------------------------------------------

interface Par {
  orig: Original;
  ctx: ContextoPlanejamento;
  cen: Cenario;
}

function montar(cen: Cenario): Par {
  const orig = carregarOriginal(cen.hoje);
  const meses: Record<string, MesAgregado> = {};
  const antigos: Record<string, unknown> = {};
  for (const [chave, linhas] of Object.entries(cen.linhas)) {
    meses[chave] = agregar(linhas);
    antigos[chave] = orig.agregar(linhas);
  }
  orig.ESTADO.meses = antigos;
  orig.ESTADO.chaveA = cen.chaveA;
  orig.ESTADO.chaveB = cen.chaveB;
  orig.ESTADO.chaveAtual = cen.chaveAtual;
  for (const k of cen.planejados) {
    orig.FERIADOS_TRABALHADOS_PLANEJADOS[k] = true;
    FERIADOS_TRABALHADOS_PLANEJADOS[k] = true;
  }
  return { orig, cen, ctx: { meses, chaveA: cen.chaveA, chaveB: cen.chaveB, chaveAtual: cen.chaveAtual, hoje: cen.hoje } };
}

function limparPlanejados() {
  for (const k of Object.keys(FERIADOS_TRABALHADOS_PLANEJADOS)) delete FERIADOS_TRABALHADOS_PLANEJADOS[k];
}

/** O lado antigo, já normalizado. */
function velho(p: Par, v: unknown): unknown {
  return normalizarAntigo(v, p.orig.iso);
}

/** Todos os dias dos meses do cenário. */
function diasDoCenario(c: Cenario): string[] {
  return [c.chaveA, c.chaveB, c.chaveAtual].flatMap((k) => diasDoMes(k));
}

describe.skipIf(!originalExiste)('paridade com ../../dashboard-expedicao/planejamento.js', () => {
  afterEach(limparPlanejados);

  it('o arquivo antigo está onde se espera', () => {
    expect(CAMINHO_ORIGINAL).toMatch(/planejamento\.js$/);
    expect(readFileSync(CAMINHO_ORIGINAL, 'utf8')).toContain('function simularMes');
  });

  // -------------------------------------------------------------------------
  describe('constantes de negócio', () => {
    it('mesmos valores e mesmos rótulos', () => {
      const o = carregarOriginal('2026-11-05');
      expect(MIN_PEDIDOS_SKU).toBe(o.MIN_PEDIDOS_SKU);
      expect(MIN_PECAS_SKU).toBe(o.MIN_PECAS_SKU);
      expect(PAR_MIN_OCORRENCIAS).toBe(o.PAR_MIN_OCORRENCIAS);
      expect(PAR_RAZAO_MES_ANTERIOR).toBe(o.PAR_RAZAO_MES_ANTERIOR);
      expect(PCT_COMBINADO).toBe(o.PCT_COMBINADO);
      expect(PCT_COMB_ATENCAO).toBe(o.PCT_COMB_ATENCAO);
      expect(FRACAO_FERIADO_TRABALHADO).toBe(o.FRACAO_FERIADO_TRABALHADO);
      expect(FAMILIAS_PADRAO).toEqual(o.ESTADO.familias);
      expect(GRUPOS_ESTOQUE.map((g) => [g.grupo, g.padrao.source])).toEqual(o.GRUPOS_ESTOQUE.map((g) => [g.grupo, g.padrao.source]));
      expect(Object.keys(ORDEM_PECAS)).toEqual(Object.keys(o.ORDEM_PECAS));
    });
  });

  // -------------------------------------------------------------------------
  describe('calendário', () => {
    const o = carregarOriginal('2026-11-05');

    it('Páscoa de 1900 a 2200', () => {
      for (let ano = 1900; ano <= 2200; ano++) {
        expect(easterSunday(ano), String(ano)).toBe(o.iso(o.pascoa(ano)));
      }
    });

    it('lista de feriados de 1990 a 2100 (nome e escopo)', () => {
      for (let ano = 1990; ano <= 2100; ano++) {
        const antigo = o.feriados(ano);
        const novo = Object.fromEntries(holidaysOf(ano).map((h) => [h.day, { nome: h.name, escopo: h.scopeLabel }]));
        expect(novo, String(ano)).toEqual(antigo);
      }
    });

    it('ehFeriado dia a dia de 2026 a 2028', () => {
      for (let ano = 2026; ano <= 2028; ano++) {
        for (let m = 1; m <= 12; m++) {
          for (const dia of diasDoMes(`${ano}-${String(m).padStart(2, '0')}`)) {
            const a = o.ehFeriado(o.deIso(dia));
            const n = ehFeriado(dia);
            expect(n ? { nome: n.name, escopo: n.scopeLabel } : null, dia).toEqual(a);
          }
        }
      }
    });

    it('spikeDays de 2025 a 2029', () => {
      for (let ano = 2025; ano <= 2029; ano++) {
        for (let m = 1; m <= 12; m++) {
          const chave = `${ano}-${String(m).padStart(2, '0')}`;
          expect(spikeDays(chave), chave).toEqual(o.spikeDays(chave));
        }
      }
    });

    it('diasDoMes', () => {
      for (const chave of ['2026-02', '2028-02', '2026-10', '2026-11', '2027-01']) {
        expect(diasDoMes(chave)).toEqual(o.diasDoMes(chave).map((d) => o.iso(d)));
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('SKU, peças, agrupamento e embalagens', () => {
    const o = carregarOriginal('2026-11-05');

    const tokens = new Set<string>();
    const regex = /[0-9A-ZÉÇ][0-9A-ZÉÇ,.]*(?:-[0-9A-ZÉÇ,.]+)+/g;
    for (const caminho of [CAMINHO_CLAUDE_MD, CAMINHO_ORIGINAL]) {
      const texto = readFileSync(caminho, 'utf8');
      for (const m of texto.matchAll(regex)) tokens.add(m[0]);
    }
    for (const [sku] of CATALOGO) tokens.add(sku);

    // cruzamento: prefixos x unidades x corpos
    const cruzados: string[] = [];
    const numeros = ['0', '1', '2', '3', '4', '5', '6', '10', '12', '13', '20', '24', '30', '40', '50', '60', '100', '500'];
    const unidades = ['X', 'UN', 'CX', 'x', 'un', 'cx', 'L', 'CM', ''];
    const corpos = [
      'LEN-ECO-70X50', 'LEN-CEL-70X50', 'LEN-ECO-50X50', 'LEN-CEL-50X50', 'GAZE-11FIOS', 'GAZE-13FIOS',
      'GAZE-ESTÉRIL', 'GAZE-ESTERIL', 'TOU-DESC-TNT-BRA', 'TOU-TNT-BRA', 'AGULHA', '40X1,20-AGULHA',
      'ATADURA-10CM', 'ATADURA-8CM', 'LUVA-SOFT-M', 'LUVA-SOFT-P', 'LUVA-VINIL-M', 'LUVA-NIT', 'LUVA-ESTÉRIL',
      'SERIN-5ML', 'SERIN-3ML', 'PAP-INTER', '500-PAP-INTER', 'PERFU-FLEX', 'MASC-BRA', 'LEN-COM-TNT', 'GRAU',
    ];
    for (const n of numeros) for (const u of unidades) for (const c of corpos) cruzados.push(`${n}${u}-${c}`);
    const todos = [...tokens, ...cruzados, '', '  ', '  3x-len-eco-70x50  ', 'sem-prefixo', '1x-LUVA-soft-M'];
    const quantidades: unknown[] = [0, 1, 2, 3, 7, 100, '5', null, undefined, 'abc', 2.5];

    it(`prefixo, multiplicador, baseEstoque, grupoEstoque e embalagens (${todos.length} SKUs)`, () => {
      expect(todos.length).toBeGreaterThan(4000);
      for (const sku of todos) {
        expect(prefixo(sku), sku).toEqual(o.prefixo(sku));
        expect(multiplicador(sku), sku).toBe(o.multiplicador(sku));
        expect(baseEstoque(sku), sku).toBe(o.baseEstoque(sku));
        expect(grupoEstoque(sku), sku).toBe(o.grupoEstoque(sku));
        expect(embalagensDe(sku), sku).toEqual(o.embalagensDe(sku));
      }
    });

    it('pecasDe, bit a bit, com as famílias padrão', () => {
      for (const sku of todos) {
        for (const q of quantidades) {
          expect(Object.is(pecasDe(sku, q), o.pecasDe(sku, q)), `${sku} x ${String(q)}`).toBe(true);
        }
      }
    });

    it('escolherEmbalagem', () => {
      for (const mult of [0, 1, 2, 3, 6, 12, 20, 24, 40, 50, 60, 100, 200]) {
        for (const packs of [[], [1], [100], [12], [100, 20], [20, 100], [100, 20, 5]]) {
          expect(escolherEmbalagem(mult, packs), `${mult} ${packs.join()}`).toBe(o.escolherEmbalagem(mult, packs));
        }
      }
    });

    it('pecasDe e embalagensDe com famílias alteradas (banco por cima, escalar, lista vazia)', () => {
      const alt: Record<string, number[]> = { ...o.ESTADO.familias, TOU: [50], SERINGA: [50], 'LUVA-SOFT': [200, 100, 20], ATADURA: [0] };
      o.ESTADO.familias = alt;
      const familias: Familias = alt;
      for (const sku of todos) {
        expect(embalagensDe(sku, familias), sku).toEqual(o.embalagensDe(sku));
        for (const q of [1, 3, 100]) expect(Object.is(pecasDe(sku, q, familias), o.pecasDe(sku, q)), `${sku} x ${q}`).toBe(true);
      }
      const escalar: Record<string, number> = { SERIN: 50 };
      o.ESTADO.familias = escalar as unknown as Record<string, number[]>;
      for (const sku of ['100X-SERIN-5ML', '50X-SERIN-5ML', '30X-SERIN-5ML', '3X-LEN-ECO-70X50']) {
        expect(embalagensDe(sku, escalar), sku).toEqual(o.embalagensDe(sku));
        expect(Object.is(pecasDe(sku, 2, escalar), o.pecasDe(sku, 2)), sku).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe.each(cenarios())('cenário $nome', (cen) => {
    it('agregar: mesmo agregado do original', () => {
      const p = montar(cen);
      for (const chave of Object.keys(cen.linhas)) {
        expect(p.ctx.meses[chave], chave).toEqual(p.orig.ESTADO.meses[chave]);
      }
      // sanidade do fixture: tem volume e pares
      const b = p.ctx.meses[cen.chaveB];
      expect(b?.totalPedidos ?? 0).toBeGreaterThan(1000);
    });

    it('feriado trabalhado / parado, dia a dia', () => {
      const p = montar(cen);
      for (const dia of diasDoCenario(cen)) {
        const d = p.orig.deIso(dia);
        const dados = dadosDias(p.ctx);
        expect(feriadoTrabalhado(dia, dados), dia).toBe(p.orig.feriadoTrabalhado(d));
        const a = p.orig.feriadoParado(d);
        const n = feriadoParado(dia, dados);
        expect(n ? { nome: n.name, escopo: n.scopeLabel } : null, dia).toEqual(a);
      }
    });

    it('dias úteis com movimento, sábados, pares novos', () => {
      const p = montar(cen);
      for (const chave of [cen.chaveA, cen.chaveB, cen.chaveAtual]) {
        const agg = p.ctx.meses[chave] as MesAgregado;
        expect(diasUteisComMovimento(p.ctx, agg, chave), chave).toEqual(velho(p, p.orig.diasUteisComMovimento(p.orig.ESTADO.meses[chave], chave)));
        expect(totalSabados(agg, chave), chave).toEqual(p.orig.totalSabados(p.orig.ESTADO.meses[chave], chave));
        expect(realizadoUteis(p.ctx, chave), chave).toBe(p.orig.realizadoUteis(chave));
        expect(mediaDiaUtil(p.ctx, chave), chave).toBe(p.orig.mediaDiaUtil(chave));
      }
      const a = p.ctx.meses[cen.chaveA] as MesAgregado;
      const b = p.ctx.meses[cen.chaveB] as MesAgregado;
      const novos = detectarParesNovos(b, a);
      expect(novos).toEqual(p.orig.detectarParesNovos(p.orig.ESTADO.meses[cen.chaveB], p.orig.ESTADO.meses[cen.chaveA]));
      for (const sku of Object.keys(b.prod)) {
        expect(presencaViaParesNovos(sku, novos), sku).toBe(p.orig.presencaViaParesNovos(sku, novos));
      }
    });

    it('compararMeses: produtos, pecas, médias, sábados, pares', () => {
      const p = montar(cen);
      const novo = normalizarNovo(compararMeses(p.ctx, cen.chaveA, cen.chaveB));
      const antigo = velho(p, p.orig.compararMeses(cen.chaveA, cen.chaveB));
      expect(novo).toEqual(antigo);
      const c = compararMeses(p.ctx, cen.chaveA, cen.chaveB);
      expect(c.produtos.length).toBeGreaterThan(5);
      expect(c.pecas.length).toBeGreaterThan(5);
    });

    it('listaPecas isolada, com famílias alteradas', () => {
      const p = montar(cen);
      const alt: Record<string, number[]> = { ...p.orig.ESTADO.familias, TOU: [50], 'LUVA-SOFT': [100, 25] };
      p.orig.ESTADO.familias = alt;
      const a = p.ctx.meses[cen.chaveA] as MesAgregado;
      const b = p.ctx.meses[cen.chaveB] as MesAgregado;
      const novo = normalizarNovo(listaPecas(a, b, 21, 22, alt));
      const antigo = velho(p, p.orig.listaPecas(p.orig.ESTADO.meses[cen.chaveA], p.orig.ESTADO.meses[cen.chaveB], 21, 22));
      expect(novo).toEqual(antigo);
    });

    it('fatores de dia da semana (dois meses e só o mês A)', () => {
      const p = montar(cen);
      expect(fatoresDiaSemana(p.ctx)).toEqual(p.orig.fatoresDiaSemana());
      expect(fatoresDiaSemana(p.ctx, [cen.chaveA])).toEqual(p.orig.fatoresDiaSemana([cen.chaveA]));
      expect(fatoresDiaSemana(p.ctx, [cen.chaveB])).toEqual(p.orig.fatoresDiaSemana([cen.chaveB]));
    });

    it('medirOndaSpike, ondaDoTipo e teto', () => {
      const p = montar(cen);
      const fat = fatoresDiaSemana(p.ctx).fatores;
      if (!fat) throw new Error('fixture sem fatores');
      const onda = medirOndaSpike(p.ctx, fat);
      expect(onda).toEqual(p.orig.medirOndaSpike(fat));
      expect(medirOndaSpike(p.ctx, fat, [cen.chaveA])).toEqual(p.orig.medirOndaSpike(fat, [cen.chaveA]));
      expect(medirOndaSpike(p.ctx, fat, [cen.chaveB])).toEqual(p.orig.medirOndaSpike(fat, [cen.chaveB]));
      for (const tipo of ['nn', 'bf'] as const) expect(ondaDoTipo(onda, tipo)).toEqual(p.orig.ondaDoTipo(onda, tipo));
      expect(tetoObservado(p.ctx)).toEqual(p.orig.tetoObservado());
      expect(tetoObservado(p.ctx, [cen.chaveA])).toEqual(p.orig.tetoObservado([cen.chaveA]));
    });

    it('simularMes com várias bases, ondas e tetos (mesma função da projeção e do backtest)', () => {
      const p = montar(cen);
      const fat = fatoresDiaSemana(p.ctx).fatores;
      if (!fat) throw new Error('fixture sem fatores');
      const ondaReal = medirOndaSpike(p.ctx, fat);
      const ondaGrande = { excesso: 500, medicoes: [{ spike: 'x', tipo: 'nn' as const, diaSpike: '2026-01-01', dia: '2026-01-05', mes: '2026-01', excesso: 500, real: 1, esperado: 1, base: 1, atraso: 4 }, { spike: 'bf', tipo: 'bf' as const, diaSpike: '2026-01-02', dia: '2026-01-06', mes: '2026-01', excesso: 900, real: 1, esperado: 1, base: 1, atraso: 4 }] };
      const ondaVazia = { excesso: 0, medicoes: [] };
      const tetos = [{ teto: 0, quando: null }, { teto: 60, quando: '2026-01-01' }, { teto: 105, quando: '2026-01-01' }, { teto: 5000, quando: '2026-01-01' }];
      for (const chave of [cen.chaveA, cen.chaveB, cen.chaveAtual]) {
        for (const base of [0, 40, 91.7, 140]) {
          for (const onda of [ondaReal, ondaGrande, ondaVazia]) {
            for (const tet of tetos) {
              const novo = normalizarNovo(simularMes(p.ctx, chave, fat, base, onda, tet));
              const antigo = velho(p, p.orig.simularMes(chave, fat, base, onda, tet));
              expect(novo, `${chave} base ${base} teto ${tet.teto}`).toEqual(antigo);
            }
          }
        }
      }
    });

    it('backtest, validação de feriados, histórico de feriados', () => {
      const p = montar(cen);
      expect(backtest(p.ctx)).toEqual(p.orig.backtest());
      const fat = fatoresDiaSemana(p.ctx).fatores;
      if (!fat) throw new Error('fixture sem fatores');
      const tet = tetoObservado(p.ctx);
      expect(validarFeriados(p.ctx, fat, tet)).toEqual(p.orig.validarFeriados(fat, tet));
      expect(validarFeriados(p.ctx, fat, { teto: 0, quando: null })).toEqual(p.orig.validarFeriados(fat, { teto: 0, quando: null }));
      expect(historicoFeriados(p.ctx)).toEqual(p.orig.historicoFeriados());
    });

    it('projetar: a projeção inteira do mês corrente', () => {
      const p = montar(cen);
      const novo = projetar(p.ctx);
      expect(novo).not.toBeNull();
      expect(normalizarNovo(novo)).toEqual(velho(p, p.orig.projetar()));
    });
  });

  // -------------------------------------------------------------------------
  describe('o fixture exercita o que importa (senão a paridade seria vácua)', () => {
    const porNome = (trecho: string): Cenario => {
      const c = cenarios().find((x) => x.nome.includes(trecho));
      if (!c) throw new Error(trecho);
      return c;
    };

    it('05/11: 12/10 trabalhado, 10.10 medido, Black Friday sem medição, validação e backtest presentes', () => {
      const p = montar(porNome('05/11/2026 (set-out'));
      const pr = projetar(p.ctx);
      expect(pr).not.toBeNull();
      if (!pr) return;
      const dados = dadosDias(p.ctx);
      expect(feriadoTrabalhado('2026-10-12', dados)).toBe(true);
      expect(feriadoParado('2026-11-02', dados)).not.toBeNull();
      expect(pr.onda.medicoes.some((m) => m.diaSpike === '2026-10-10')).toBe(true);
      const bf = pr.spikes.find((s) => s.tipo === 'bf');
      expect(bf?.medicoes).toEqual([]);
      expect(bf?.excesso).toBe(0);
      expect(pr.historicoFeriados.map((h) => [h.data, h.trabalhado])).toEqual([
        ['2026-09-07', false],
        ['2026-10-12', true],
        ['2026-11-02', false],
      ]);
      expect(pr.backtest).not.toBeNull();
      expect(pr.feriados.some((f) => f.transferido)).toBe(true);
    });

    it('02/09: 09/07 parado gera validação com transferência', () => {
      const p = montar(porNome('02/09/2026'));
      const pr = projetar(p.ctx);
      expect(pr?.validacaoFeriados.map((v) => v.feriado)).toContain('2026-07-09');
    });

    it('01/10: o teto estoura em 13/10 quando 12/10 e a onda do 10.10 caem juntos', () => {
      const p = montar(porNome('01/10/2026 (ago-set'));
      const pr = projetar(p.ctx);
      expect(pr?.linhas.some((l) => l.estoura)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('bordas', () => {
    it('sem nenhum pedido: fatores nulos, projeção e backtest nulos, nos dois lados', () => {
      const orig = carregarOriginal('2026-11-05');
      const vazio = agregar([]);
      orig.ESTADO.meses = { '2026-09': orig.agregar([]), '2026-10': orig.agregar([]), '2026-11': orig.agregar([]) };
      orig.ESTADO.chaveA = '2026-09';
      orig.ESTADO.chaveB = '2026-10';
      orig.ESTADO.chaveAtual = '2026-11';
      const ctx: ContextoPlanejamento = {
        meses: { '2026-09': vazio, '2026-10': vazio, '2026-11': vazio },
        chaveA: '2026-09',
        chaveB: '2026-10',
        chaveAtual: '2026-11',
        hoje: '2026-11-05',
      };
      expect(projetar(ctx)).toBeNull();
      expect(orig.projetar()).toBeNull();
      expect(backtest(ctx)).toBeNull();
      expect(orig.backtest()).toBeNull();
      expect(fatoresDiaSemana(ctx)).toEqual(orig.fatoresDiaSemana());
    });

    it('o dia seguinte ao feriado e o domingo não entram no fator', () => {
      const [cen] = cenarios();
      if (!cen) throw new Error('sem cenário');
      const p = montar(cen);
      // 10/07/2026 (sexta, dia seguinte ao 09/07) tem que ficar fora; confere contra o original
      expect(addDays('2026-07-09', 1)).toBe('2026-07-10');
      expect(fatoresDiaSemana(p.ctx, ['2026-07'])).toEqual(p.orig.fatoresDiaSemana(['2026-07']));
    });
  });
});
