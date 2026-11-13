/// <reference types="node" />
/**
 * Carrega a lógica pura do ../../dashboard-expedicao/planejamento.js ORIGINAL para os testes de
 * paridade, no mesmo espírito do ../../dashboard-expedicao/teste-pecas.js (que extrai um bloco do
 * arquivo e roda com eval). Aqui o bloco vai do começo das constantes até
 * antes do render, e é executado dentro de uma função com o `Date` trocado
 * por um relógio fixo: o original lê "agora" com `new Date()`.
 *
 * Só testes importam este arquivo. Nunca entra no bundle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CAMINHO_ORIGINAL = fileURLToPath(new URL('../../../../../../../dashboard-expedicao/planejamento.js', import.meta.url));
export const CAMINHO_CLAUDE_MD = fileURLToPath(new URL('../../../../../../../dashboard-expedicao/CLAUDE.md', import.meta.url));

export const originalExiste = existsSync(CAMINHO_ORIGINAL);

/** Funções e constantes do original que os testes usam (tipagem frouxa de propósito: é código JS antigo). */
export interface Original {
  ESTADO: {
    meses: Record<string, unknown>;
    chaveA: string | null;
    chaveB: string | null;
    chaveAtual: string | null;
    familias: Record<string, number[]>;
  };
  FERIADOS_TRABALHADOS_PLANEJADOS: Record<string, boolean>;
  GRUPOS_ESTOQUE: { grupo: string; padrao: RegExp }[];
  MIN_PEDIDOS_SKU: number;
  MIN_PECAS_SKU: number;
  PAR_MIN_OCORRENCIAS: number;
  PAR_RAZAO_MES_ANTERIOR: number;
  PCT_COMBINADO: number;
  PCT_COMB_ATENCAO: number;
  FRACAO_FERIADO_TRABALHADO: number;
  ORDEM_PECAS: Record<string, string>;
  iso(d: Date): string;
  deIso(s: string): Date;
  pascoa(ano: number): Date;
  feriados(ano: number): Record<string, { nome: string; escopo: string }>;
  ehFeriado(d: Date): { nome: string; escopo: string } | null;
  feriadoTrabalhado(d: Date): boolean;
  feriadoParado(d: Date): { nome: string; escopo: string } | null;
  spikeDays(chave: string): unknown[];
  diasDoMes(chave: string): Date[];
  prefixo(sku: unknown): { n: number; unidade: string };
  multiplicador(sku: unknown): number;
  baseEstoque(sku: unknown): string;
  grupoEstoque(sku: unknown): string;
  embalagensDe(sku: unknown): number[];
  escolherEmbalagem(mult: number, packs: number[]): number;
  pecasDe(sku: unknown, quantidade: unknown): number;
  agregar(linhas: unknown[]): unknown;
  diasUteisComMovimento(agg: unknown, chave: string): unknown[];
  totalSabados(agg: unknown, chave: string): unknown;
  detectarParesNovos(aggB: unknown, aggA: unknown): unknown;
  presencaViaParesNovos(sku: string, novos: unknown): number;
  compararMeses(chaveA: string, chaveB: string): unknown;
  listaPecas(aggA: unknown, aggB: unknown, duA: number, duB: number): unknown;
  mediaDiaUtil(chave: string): number;
  fatoresDiaSemana(chaves?: string[]): unknown;
  medirOndaSpike(fat: unknown, chaves?: string[]): unknown;
  ondaDoTipo(onda: unknown, tipo: string): unknown;
  tetoObservado(chaves?: string[]): unknown;
  simularMes(chave: string, fat: unknown, base: number, onda: unknown, tet: unknown): unknown;
  realizadoUteis(chave: string): number;
  backtest(): unknown;
  validarFeriados(fat: unknown, tet: unknown): unknown;
  historicoFeriados(): unknown;
  projetar(): unknown;
}

const NOMES = [
  'ESTADO', 'FERIADOS_TRABALHADOS_PLANEJADOS', 'GRUPOS_ESTOQUE', 'MIN_PEDIDOS_SKU', 'MIN_PECAS_SKU',
  'PAR_MIN_OCORRENCIAS', 'PAR_RAZAO_MES_ANTERIOR', 'PCT_COMBINADO', 'PCT_COMB_ATENCAO',
  'FRACAO_FERIADO_TRABALHADO', 'ORDEM_PECAS', 'iso', 'deIso', 'pascoa', 'feriados', 'ehFeriado',
  'feriadoTrabalhado', 'feriadoParado', 'spikeDays', 'diasDoMes', 'prefixo', 'multiplicador',
  'baseEstoque', 'grupoEstoque', 'embalagensDe', 'escolherEmbalagem', 'pecasDe', 'agregar',
  'diasUteisComMovimento', 'totalSabados', 'detectarParesNovos', 'presencaViaParesNovos',
  'compararMeses', 'listaPecas', 'mediaDiaUtil', 'fatoresDiaSemana', 'medirOndaSpike', 'ondaDoTipo',
  'tetoObservado', 'simularMes', 'realizadoUteis', 'backtest', 'validarFeriados',
  'historicoFeriados', 'projetar',
];

/** Fonte do original, sem o render. */
export function blocoPuro(): string {
  const src = readFileSync(CAMINHO_ORIGINAL, 'utf8');
  const ini = src.indexOf('var CACHE_PREFIXO');
  const render = src.indexOf('function renderEstado(');
  if (ini < 0 || render < 0) throw new Error('extração do planejamento.js falhou');
  const fim = src.lastIndexOf('// ---', render);
  // `num` mora na seção de render, mas listaPecas a usa para montar o tooltip.
  const numIni = src.indexOf('function num(');
  const numFim = src.indexOf('function pct(');
  if (numIni < 0 || numFim < 0) throw new Error('extração de num() falhou');
  return `${src.slice(ini, fim)}
${src.slice(numIni, numFim)}`;
}

/**
 * Instância nova do original com "hoje" fixo (meio-dia local do dia dado).
 * Cada chamada tem o próprio ESTADO e os próprios FERIADOS_TRABALHADOS_PLANEJADOS.
 */
export function carregarOriginal(hoje: string): Original {
  const [y, m, d] = hoje.split('-').map(Number) as [number, number, number];
  const agora = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();

  class RelogioFixo extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(agora);
      else super(...(args as [number, number]));
    }
    static now(): number {
      return agora;
    }
  }

  const corpo = `${blocoPuro()}\n;return { ${NOMES.join(', ')} };`;
  const fabrica = new Function('Date', corpo) as (d: typeof Date) => Original;
  return fabrica(RelogioFixo as unknown as typeof Date);
}
