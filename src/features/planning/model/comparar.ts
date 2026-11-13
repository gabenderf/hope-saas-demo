/**
 * Comparativo entre os dois meses fechados, portado do planejamento.js:
 * dias úteis, pedidos por SKU exato, combinações novas (pedido misto) e a
 * tabela de peças por produto de prateleira.
 */
import { diasDoMes, ehUtil, feriadoParado } from '@/lib/calendar';
import { weekdayOf } from '@/lib/time';
import {
  MIN_PECAS_SKU,
  MIN_PEDIDOS_SKU,
  PAR_MIN_OCORRENCIAS,
  PAR_RAZAO_MES_ANTERIOR,
  PCT_COMBINADO,
  PCT_COMB_ATENCAO,
} from './constantes';
import { dadosDias } from './datas';
import {
  type Familias,
  FAMILIAS_PADRAO,
  embalagensDe,
  escolherEmbalagem,
  grupoEstoque,
  multiplicador,
  pecasDe,
  prefixo,
  skuCru,
} from './sku';
import type { ContextoPlanejamento, DiaUtil, MesAgregado, ProdutoAgg } from './types';

/**
 * Dias úteis COM movimento. Feriado PARADO não conta como dia útil, e dia útil
 * sem nenhum pedido também não: senão a média por dia útil cairia por causa de
 * um dia em que ninguém trabalhou. Feriado TRABALHADO entra (12/10/2026).
 */
export function diasUteisComMovimento(
  ctx: ContextoPlanejamento,
  agg: MesAgregado | undefined,
  chave: string,
): DiaUtil[] {
  const out: DiaUtil[] = [];
  if (!agg) return out;
  const dados = dadosDias(ctx);
  for (const dia of diasDoMes(chave)) {
    if (!ehUtil(dia) || feriadoParado(dia, dados)) continue;
    const n = agg.dias[dia] || 0;
    if (n > 0) out.push({ dia, pedidos: n, diaSemana: weekdayOf(dia) });
  }
  return out;
}

const SEM_PEDIDOS: ProdutoAgg = { total: 0, q1: 0, q2: 0, solo: 0, acomp: 0, unid: 0 };

export interface TotalSabados {
  total: number;
  dias: number;
}

/** Pedidos em dias fora de segunda a sexta (sábado e domingo). */
export function totalSabados(agg: MesAgregado, chave: string): TotalSabados {
  let total = 0;
  let dias = 0;
  for (const dia of diasDoMes(chave)) {
    if (ehUtil(dia)) continue;
    const v = agg.dias[dia] || 0;
    if (v > 0) {
      total += v;
      dias++;
    }
  }
  return { total, dias };
}

/**
 * Combinações de SKU que passaram a sair juntas no mês B e praticamente não
 * saíam no mês A. NÃO é alarme de dado ruim: é um fato COMERCIAL (kit, brinde,
 * "compre junto"), conferido contra `fila_snapshot_itens`. Ver ../../dashboard-expedicao/CLAUDE.md,
 * "Combinações novas".
 */
export function detectarParesNovos(aggB: MesAgregado, aggA: MesAgregado): Record<string, number> {
  const novos: Record<string, number> = {};
  for (const k of Object.keys(aggB.pares)) {
    const vb = aggB.pares[k] ?? 0;
    const va = aggA.pares[k] || 0;
    if (vb >= PAR_MIN_OCORRENCIAS && va <= PAR_RAZAO_MES_ANTERIOR * vb) novos[k] = vb;
  }
  return novos;
}

/** Quantos pedidos do SKU no mês B vêm de uma combinação nova. */
export function presencaViaParesNovos(sku: string, novos: Readonly<Record<string, number>>): number {
  let soma = 0;
  for (const k of Object.keys(novos)) {
    for (const parte of k.split('||')) {
      if (skuCru(parte) === sku) {
        soma += novos[k] ?? 0;
        break;
      }
    }
  }
  return soma;
}

export interface ProdutoComparado {
  produto: string;
  pedidosA: number;
  pedidosB: number;
  diaA: number;
  diaB: number;
  variacao: number | null;
  difDia: number;
  pctVia: number;
  acompA: number;
  acompB: number;
  soloA: number;
  soloB: number;
  varSolo: number | null;
  /** o crescimento vem de pedido misto em combinação nova (marca ●) */
  combinado: boolean;
  atencaoComb: boolean;
  q1: number;
  q2: number;
}

export interface PecaComparada {
  sku: string;
  pecasA: number;
  pecasB: number;
  diaA: number;
  diaB: number;
  difDia: number;
  variacao: number | null;
  pedidosB: number;
  unidB: number;
  nVariantes: number;
  /** variantes somadas na linha, da maior para a menor, no formato do tooltip antigo */
  detalhe: string;
  /** mesma informação, estruturada (até 8) */
  variantes: { sku: string; pecas: number }[];
  /** embalagens fechadas realmente aplicadas nas variantes (maior primeiro) */
  embalagens: number[];
  /** alguma variante tem prefixo CX (já vem em caixas) */
  temCaixa: boolean;
  /** as variantes são do mês B (senão, do mês A) */
  detalheDoMesB: boolean;
}

export interface Comparativo {
  chaveA: string;
  chaveB: string;
  uteisA: DiaUtil[];
  uteisB: DiaUtil[];
  somaA: number;
  somaB: number;
  mediaA: number;
  mediaB: number;
  sabA: TotalSabados;
  sabB: TotalSabados;
  maiorA: DiaUtil | null;
  maiorB: DiaUtil | null;
  produtos: ProdutoComparado[];
  pecas: PecaComparada[];
  paresNovos: Record<string, number>;
  qtdParesNovos: number;
}

export function compararMeses(ctx: ContextoPlanejamento, chaveA: string, chaveB: string): Comparativo {
  const aggA = ctx.meses[chaveA];
  const aggB = ctx.meses[chaveB];
  if (!aggA || !aggB) throw new Error(`Mês não carregado: ${!aggA ? chaveA : chaveB}`);
  const utA = diasUteisComMovimento(ctx, aggA, chaveA);
  const utB = diasUteisComMovimento(ctx, aggB, chaveB);
  const somaA = utA.reduce((s, x) => s + x.pedidos, 0);
  const somaB = utB.reduce((s, x) => s + x.pedidos, 0);
  const mediaA = utA.length ? somaA / utA.length : 0;
  const mediaB = utB.length ? somaB / utB.length : 0;

  const novos = detectarParesNovos(aggB, aggA);

  const produtos: ProdutoComparado[] = [];
  const todosProd: Record<string, true> = {};
  for (const k of Object.keys(aggA.prod)) todosProd[k] = true;
  for (const k of Object.keys(aggB.prod)) todosProd[k] = true;

  for (const b of Object.keys(todosProd)) {
    const pA = aggA.prod[b]?.total ?? 0;
    const pB = aggB.prod[b]?.total ?? 0;
    if (Math.max(pA, pB) < MIN_PEDIDOS_SKU) continue;

    const via = presencaViaParesNovos(b, novos);
    const pctVia = pB ? (via / pB) * 100 : 0;

    const dA = utA.length ? pA / utA.length : 0;
    const dB = utB.length ? pB / utB.length : 0;
    const variacao = dA > 0 ? (dB / dA - 1) * 100 : null;

    const rA: ProdutoAgg = aggA.prod[b] ?? SEM_PEDIDOS;
    const rB: ProdutoAgg = aggB.prod[b] ?? SEM_PEDIDOS;
    const acompA = pA ? (rA.acomp / pA) * 100 : 0;
    const acompB = pB ? (rB.acomp / pB) * 100 : 0;

    // Venda avulsa por dia útil: diz se a demanda PRÓPRIA do produto mudou,
    // separada do que ele ganhou por vir em pedido misto. Sem isso, um brinde
    // parece campeão de vendas.
    const soloA = utA.length ? rA.solo / utA.length : 0;
    const soloB = utB.length ? rB.solo / utB.length : 0;

    produtos.push({
      produto: b,
      pedidosA: pA,
      pedidosB: pB,
      diaA: dA,
      diaB: dB,
      variacao,
      difDia: dB - dA,
      pctVia,
      acompA,
      acompB,
      soloA,
      soloB,
      varSolo: soloA > 0 ? (soloB / soloA - 1) * 100 : null,
      combinado: pctVia >= PCT_COMBINADO,
      atencaoComb: pctVia >= PCT_COMB_ATENCAO && pctVia < PCT_COMBINADO,
      q1: rB.q1 || 0,
      q2: rB.q2 || 0,
    });
  }

  // Ranqueado por diferença absoluta por dia útil, não por percentual.
  produtos.sort((x, y) => Math.abs(y.difDia) - Math.abs(x.difDia));

  const maiorA = utA.slice().sort((x, y) => y.pedidos - x.pedidos)[0] ?? null;
  const maiorB = utB.slice().sort((x, y) => y.pedidos - x.pedidos)[0] ?? null;

  return {
    chaveA,
    chaveB,
    uteisA: utA,
    uteisB: utB,
    somaA,
    somaB,
    mediaA,
    mediaB,
    sabA: totalSabados(aggA, chaveA),
    sabB: totalSabados(aggB, chaveB),
    maiorA,
    maiorB,
    produtos,
    pecas: listaPecas(aggA, aggB, utA.length, utB.length, ctx.familias),
    paresNovos: novos,
    qtdParesNovos: Object.keys(novos).length,
  };
}

/** Formata como o `num(v, 1)` do arquivo antigo (pt-BR, uma casa). */
function umaCasa(v: number): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface GrupoPecas {
  pecas: number;
  unid: number;
  pedidos: number;
  variantes: Record<string, number>;
}

/**
 * Peças que saíram da prateleira, por PRODUTO, nunca por variante. A conversão
 * em peça acontece AQUI, não na agregação, para que corrigir
 * `familias_embalagem` arrume a tela sem invalidar cache. Sem ordenação: a
 * ordem é escolha da tela (ver ordenarPecas).
 */
export function listaPecas(
  aggA: MesAgregado,
  aggB: MesAgregado,
  duA: number,
  duB: number,
  familias: Familias = FAMILIAS_PADRAO,
): PecaComparada[] {
  const juntar = (agg: MesAgregado): Record<string, GrupoPecas> => {
    const m: Record<string, GrupoPecas> = {};
    for (const sk of Object.keys(agg.prod)) {
      const k = grupoEstoque(sk);
      let g = m[k];
      if (!g) {
        g = { pecas: 0, unid: 0, pedidos: 0, variantes: {} };
        m[k] = g;
      }
      const p = agg.prod[sk];
      const unid = p?.unid || 0;
      const pc = pecasDe(sk, unid, familias);
      g.pecas += pc;
      g.unid += unid * multiplicador(sk);
      // Soma de pedidos por SKU, não pedidos distintos: aceito porque esta
      // coluna é contexto para a peça, não a métrica ranqueada.
      g.pedidos += p?.total || 0;
      if (pc > 0) g.variantes[sk] = (g.variantes[sk] || 0) + pc;
    }
    return m;
  };
  const mA = juntar(aggA);
  const mB = juntar(aggB);
  const todos: Record<string, true> = {};
  for (const k of Object.keys(mA)) todos[k] = true;
  for (const k of Object.keys(mB)) todos[k] = true;

  const vazio: GrupoPecas = { pecas: 0, unid: 0, pedidos: 0, variantes: {} };
  const out: PecaComparada[] = [];
  for (const k of Object.keys(todos)) {
    const a = mA[k] ?? vazio;
    const b = mB[k] ?? vazio;
    if (Math.max(a.pecas, b.pecas) < MIN_PECAS_SKU) continue;
    const dA = duA ? a.pecas / duA : 0;
    const dB = duB ? b.pecas / duB : 0;

    const doMesB = Object.keys(b.variantes).length > 0;
    const vars = doMesB ? b.variantes : a.variantes;
    const ordenadas = Object.keys(vars)
      .sort((x, y) => (vars[y] ?? 0) - (vars[x] ?? 0))
      .slice(0, 8);
    const detalhe = ordenadas.map((sk) => `${sk}: ${umaCasa(vars[sk] ?? 0)}`).join('  ·  ');

    // Embalagens REALMENTE aplicadas, não as que a família declara: `2CX-`
    // cai na família LUVA (100) mas já vem em caixas e nada é dividido.
    const packs: Record<number, true> = {};
    let temCaixa = false;
    for (const sk of Object.keys(vars)) {
      const pre = prefixo(sk);
      if (pre.unidade === 'CX') {
        temCaixa = true;
        continue;
      }
      const alvo = escolherEmbalagem(pre.n, embalagensDe(sk, familias));
      if (alvo > 1) packs[alvo] = true;
    }
    const listaPacks = Object.keys(packs)
      .map(Number)
      .sort((x, y) => y - x);

    out.push({
      sku: k,
      pecasA: a.pecas,
      pecasB: b.pecas,
      diaA: dA,
      diaB: dB,
      difDia: dB - dA,
      variacao: dA > 0 ? (dB / dA - 1) * 100 : null,
      pedidosB: b.pedidos,
      unidB: b.unid,
      nVariantes: Object.keys(vars).length,
      detalhe,
      variantes: ordenadas.map((sku) => ({ sku, pecas: vars[sku] ?? 0 })),
      embalagens: listaPacks,
      temCaixa,
      detalheDoMesB: doMesB,
    });
  }
  return out;
}
