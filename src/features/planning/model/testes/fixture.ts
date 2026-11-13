/**
 * Fixture determinística (gerador com semente) para os testes de paridade.
 * Imita o formato de `pedidos_separados` (data_hora, itens) e as anomalias que
 * o modelo trata: feriado parado, feriado trabalhado, segunda com acúmulo,
 * onda de spike day, combinações novas (pedido misto), sábado de resíduo,
 * SKU com caixa e espaço diferentes, item sem SKU, pedido sem itens.
 */
import { diasDoMes, ehFeriado } from '@/lib/calendar';
import { type DayKey, addDays, weekdayOf } from '@/lib/time';
import type { PedidoLinha } from '../types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SKUs do catálogo real que o CLAUDE.md cita, com pesos de venda. */
export const CATALOGO: readonly (readonly [string, number])[] = [
  ['1X-LEN-ECO-70X50', 6],
  ['3X-LEN-ECO-70X50', 9],
  ['4X-LEN-ECO-70X50', 5],
  ['10X-LEN-CEL-70X50', 5],
  ['1X-LEN-CEL-50X50', 3],
  ['3X-LEN-ECO-50X50', 3],
  ['10X-LEN-CEL-50X50', 3],
  ['1X-GAZE-11FIOS', 4],
  ['1X-GAZE-13FIOS', 4],
  ['1X-GAZE-ESTÉRIL', 3],
  ['100X-TOU-DESC-TNT-BRA', 5],
  ['50X-TOU-DESC-TNT-BRA', 2],
  ['100X-TOU-TNT-BRA', 2],
  ['24X-ATADURA-10CM', 3],
  ['60X-ATADURA-10CM', 2],
  ['12X-ATADURA-8CM', 2],
  ['6X-ATADURA-8CM', 1],
  ['100X-LUVA-SOFT-M', 2],
  ['20X-LUVA-SOFT-M', 2],
  ['40X-LUVA-SOFT-P', 2],
  ['2CX-LUVA-VINIL-M', 2],
  ['100UN-40X1,20-AGULHA', 2],
  ['50UN-13X0,45-AGULHA', 1],
  ['100X-SERIN-5ML', 2],
  ['50X-SERIN-5ML', 1],
  ['30X-SERIN-5ML', 1],
  ['1X-500-PAP-INTER', 3],
  ['13L-PERFU-FLEX', 2],
  ['1,5L-PERFU-FLEX', 2],
  ['3L-PERFU-FLEX', 6],
  ['5X-LEN-COM-TNT', 4],
  ['1X-LEN-SEM-TNT', 2],
  ['1X-MASC-BRA', 4],
  ['2X-MASC-BRA', 2],
  ['10CM-GRAU', 1],
  [' 3x-len-eco-70x50 ', 2], // caixa e espaços diferentes
];

export interface OpcoesMes {
  /** semente do gerador */
  semente: number;
  /** pedidos num dia útil comum (antes do fator) */
  base: number;
  /** dias de feriado em que a equipe trabalhou (ex.: 2026-10-12) */
  feriadosTrabalhados?: readonly DayKey[];
  /** acréscimo de pedidos por spike day (chega em D+3), por dia 'YYYY-MM-DD' do spike */
  ondas?: Readonly<Record<DayKey, number>>;
  /** fração dos pedidos que saem em combinação nova (3L-PERFU-FLEX + 5X-LEN-COM-TNT) */
  combinado?: number;
  /** só gera dias antes deste (mês corrente parcial) */
  ate?: DayKey;
}

const FATOR: Record<number, number> = { 1: 1.3, 2: 1.0, 3: 0.95, 4: 0.9, 5: 0.85 };

/** Pedidos de um dia. 0 = nenhum. */
function volumeDoDia(dia: DayKey, o: OpcoesMes, rng: () => number, ontemParado: boolean): number {
  const dow = weekdayOf(dia);
  const ruido = 0.92 + rng() * 0.16;
  const trabalhado = o.feriadosTrabalhados?.includes(dia) ?? false;
  if (dow === 0) return 0;
  if (dow === 6) return rng() < 0.4 ? Math.round(5 + rng() * 25) : 0;
  if (ehFeriado(dia) && !trabalhado) return 0;
  let v = o.base * (FATOR[dow] ?? 1) * ruido;
  if (trabalhado) v *= 0.8; // equipe reduzida
  if (ontemParado) v += o.base * (FATOR[weekdayOf(addDays(dia, -1))] ?? 1); // fila acumulada
  for (const [spike, extra] of Object.entries(o.ondas ?? {})) {
    // onda em D+3, escorregando para o próximo dia útil
    let alvo = addDays(spike, 3);
    let guarda = 0;
    while ((weekdayOf(alvo) === 0 || weekdayOf(alvo) === 6 || (ehFeriado(alvo) && !o.feriadosTrabalhados?.includes(alvo))) && guarda++ < 10) {
      alvo = addDays(alvo, 1);
    }
    if (alvo === dia) v += extra;
  }
  return Math.round(v);
}

function escolher(rng: () => number): string {
  const total = CATALOGO.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [sku, w] of CATALOGO) {
    r -= w;
    if (r <= 0) return sku;
  }
  return CATALOGO[0]?.[0] ?? '';
}

/** Linhas de `pedidos_separados` de um mês ('YYYY-MM'). */
export function gerarMes(chave: string, o: OpcoesMes): PedidoLinha[] {
  const rng = mulberry32(o.semente);
  const linhas: PedidoLinha[] = [];
  let ontemParado = false;
  for (const dia of diasDoMes(chave)) {
    if (o.ate && dia >= o.ate) break;
    const n = volumeDoDia(dia, o, rng, ontemParado);
    const dow = weekdayOf(dia);
    ontemParado = dow >= 1 && dow <= 5 && n === 0;
    for (let i = 0; i < n; i++) {
      // 15:00Z = 12:00 em São Paulo: o dia é o mesmo em qualquer fuso razoável
      const minuto = String(Math.floor(rng() * 60)).padStart(2, '0');
      const data_hora = `${dia}T15:${minuto}:00Z`;
      const r = rng();
      let itens: unknown;
      if (r < 0.01) itens = [];
      else if (r < 0.015) itens = null;
      else if (r < 0.02) itens = [{ quantidade: 2 }, { sku: '', quantidade: 1 }];
      else if (o.combinado && r < 0.02 + o.combinado) {
        itens = [
          { sku: '3L-PERFU-FLEX', quantidade: 1 },
          { sku: '5X-LEN-COM-TNT', quantidade: 1 + Math.floor(rng() * 3) },
        ];
      } else if (r < 0.15 + (o.combinado ?? 0)) {
        const a = escolher(rng);
        let b = escolher(rng);
        if (b === a) b = '1X-MASC-BRA';
        itens = [
          { sku: a, quantidade: 1 + Math.floor(rng() * 3) },
          { sku: b, quantidade: 1 },
        ];
      } else if (r < 0.16 + (o.combinado ?? 0)) {
        itens = [
          { sku: escolher(rng), quantidade: 1 },
          { sku: escolher(rng), quantidade: '2' },
          { sku: escolher(rng), quantidade: 1 },
        ];
      } else {
        itens = [{ sku: escolher(rng), quantidade: rng() < 0.9 ? 1 : 1 + Math.floor(rng() * 4) }];
      }
      linhas.push({ data_hora, itens });
    }
  }
  return linhas;
}

export interface Cenario {
  nome: string;
  hoje: DayKey;
  chaveA: string;
  chaveB: string;
  chaveAtual: string;
  linhas: Record<string, PedidoLinha[]>;
  /** feriados futuros que a liderança decidiu trabalhar neste cenário */
  planejados: readonly DayKey[];
}

/**
 * Cenários que cobrem a virada de janela (o único momento em que defeitos de
 * modelo aparecem): jul-ago (09/07 parado), ago-set (07/09 parado, 9.9), set-out
 * (12/10 TRABALHADO, 10.10 em sábado) e out-nov (Black Friday no futuro).
 */
export function cenarios(): Cenario[] {
  return [
    {
      nome: '02/09/2026 (jul-ago, atual set)',
      hoje: '2026-09-02',
      chaveA: '2026-07',
      chaveB: '2026-08',
      chaveAtual: '2026-09',
      planejados: [],
      linhas: {
        '2026-07': gerarMes('2026-07', { semente: 11, base: 90, ondas: { '2026-07-07': 30 } }),
        '2026-08': gerarMes('2026-08', { semente: 12, base: 96, ondas: { '2026-08-08': 70 }, combinado: 0.12 }),
        '2026-09': gerarMes('2026-09', { semente: 13, base: 92, ate: '2026-09-02' }),
      },
    },
    {
      nome: '01/10/2026 (ago-set, atual out, 12/10 ainda futuro)',
      hoje: '2026-10-01',
      chaveA: '2026-08',
      chaveB: '2026-09',
      chaveAtual: '2026-10',
      planejados: [],
      linhas: {
        '2026-08': gerarMes('2026-08', { semente: 21, base: 100, ondas: { '2026-08-08': 70 }, combinado: 0.02 }),
        '2026-09': gerarMes('2026-09', { semente: 22, base: 90, ondas: { '2026-09-09': 40 }, combinado: 0.14 }),
        '2026-10': gerarMes('2026-10', { semente: 23, base: 85, ate: '2026-10-01' }),
      },
    },
    {
      nome: '01/10/2026 com 12/10 e 20/11 planejados como trabalhados',
      hoje: '2026-10-01',
      chaveA: '2026-08',
      chaveB: '2026-09',
      chaveAtual: '2026-10',
      planejados: ['2026-10-12'],
      linhas: {
        '2026-08': gerarMes('2026-08', { semente: 21, base: 100, ondas: { '2026-08-08': 70 } }),
        '2026-09': gerarMes('2026-09', { semente: 22, base: 90, ondas: { '2026-09-09': 40 } }),
        '2026-10': gerarMes('2026-10', { semente: 23, base: 85, ate: '2026-10-01' }),
      },
    },
    {
      nome: '05/11/2026 (set-out, atual nov, 12/10 trabalhado)',
      hoje: '2026-11-05',
      chaveA: '2026-09',
      chaveB: '2026-10',
      chaveAtual: '2026-11',
      planejados: [],
      linhas: {
        '2026-09': gerarMes('2026-09', { semente: 31, base: 90, ondas: { '2026-09-09': 40 } }),
        '2026-10': gerarMes('2026-10', {
          semente: 32,
          base: 80,
          feriadosTrabalhados: ['2026-10-12'],
          ondas: { '2026-10-10': 60 },
          combinado: 0.1,
        }),
        '2026-11': gerarMes('2026-11', { semente: 33, base: 82, ate: '2026-11-05' }),
      },
    },
    {
      nome: '05/11/2026 com 20/11 planejado como trabalhado',
      hoje: '2026-11-05',
      chaveA: '2026-09',
      chaveB: '2026-10',
      chaveAtual: '2026-11',
      planejados: ['2026-11-20'],
      linhas: {
        '2026-09': gerarMes('2026-09', { semente: 31, base: 90, ondas: { '2026-09-09': 40 } }),
        '2026-10': gerarMes('2026-10', { semente: 32, base: 80, feriadosTrabalhados: ['2026-10-12'], ondas: { '2026-10-10': 60 } }),
        '2026-11': gerarMes('2026-11', { semente: 33, base: 82, ate: '2026-11-05' }),
      },
    },
    {
      nome: '03/01/2027 (virada de ano: nov-dez, atual jan)',
      hoje: '2027-01-03',
      chaveA: '2026-11',
      chaveB: '2026-12',
      chaveAtual: '2027-01',
      planejados: [],
      linhas: {
        '2026-11': gerarMes('2026-11', { semente: 41, base: 88, ondas: { '2026-11-11': 50, '2026-11-27': 90 } }),
        '2026-12': gerarMes('2026-12', { semente: 42, base: 95, ondas: { '2026-12-12': 35 } }),
        '2027-01': gerarMes('2027-01', { semente: 43, base: 70, ate: '2027-01-03' }),
      },
    },
  ];
}
