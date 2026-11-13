/**
 * Regras de leitura que no planejamento.js moravam dentro das funções de
 * render (cards, ordenação, listas de alta e queda, médias dos gráficos,
 * agenda de datas). Aqui saem do HTML e viram funções puras: componente não
 * calcula regra de negócio. Os textos ficam com a tela.
 */
import { ehFeriado } from '@/lib/calendar';
import type { DayKey } from '@/lib/time';
import type { Comparativo, PecaComparada, ProdutoComparado } from './comparar';
import type { OrdemPecas } from './constantes';
import type { Backtest, FeriadoDoMes, LinhaProjecao, Projecao, SemanaProjetada, SpikeProjetado } from './projecao';
import { diaDoMes } from './datas';
import type { DiaUtil, MesAgregado } from './types';

// ---------------------------------------------------------------------------
// Resumo do comparativo
// ---------------------------------------------------------------------------

export interface VariacaoResumo {
  /** variação do total de pedidos em dia útil (%); null sem mês anterior */
  varTotal: number | null;
  /** variação da média por dia útil (%) */
  varMedia: number | null;
  /** os dois meses têm quantidade diferente de dias úteis: a nota "leia a média" aparece */
  diasUteisDiferem: boolean;
  /** total e média andaram em direções opostas (caso em que ler o total inverte a conclusão) */
  direcaoOposta: boolean;
}

export function variacaoResumo(c: Comparativo): VariacaoResumo {
  const varTotal = c.somaA ? (c.somaB / c.somaA - 1) * 100 : null;
  const varMedia = c.mediaA ? (c.mediaB / c.mediaA - 1) * 100 : null;
  const ambos = varTotal != null && varMedia != null;
  return {
    varTotal,
    varMedia,
    diasUteisDiferem: ambos && c.uteisA.length !== c.uteisB.length,
    direcaoOposta: ambos && ((varTotal < 0 && varMedia > 0) || (varTotal > 0 && varMedia < 0)),
  };
}

/** Dias úteis trabalhados do mês B que são feriado de calendário (o card avisa "feriado trabalhado"). */
export function feriadosTrabalhadosNoMes(uteis: readonly DiaUtil[]): DiaUtil[] {
  return uteis.filter((x) => ehFeriado(x.dia));
}

// ---------------------------------------------------------------------------
// Tabela de produtos (SKU exato)
// ---------------------------------------------------------------------------

/** Produtos cujo crescimento vem de pedido misto em combinação nova (faixa de combinações). */
export function produtosAfetadosPorCombinacao(c: Comparativo): ProdutoComparado[] {
  if (!c.qtdParesNovos) return [];
  return c.produtos.filter((p) => p.combinado).sort((a, b) => b.difDia - a.difDia);
}

/** Posição no ranking completo é preservada ao buscar. */
export function filtrarPorBusca<T>(lista: readonly T[], busca: string, chave: (x: T) => string): { item: T; pos: number }[] {
  const termo = (busca || '').trim().toUpperCase();
  const comPos = lista.map((item, i) => ({ item, pos: i + 1 }));
  return termo ? comPos.filter((x) => chave(x.item).indexOf(termo) !== -1) : comPos;
}

export interface ProdutoTendencia extends ProdutoComparado {
  /** a 2ª quinzena manteve pelo menos 90% da 1ª (só faz sentido na lista de alta) */
  mantem?: boolean;
}

/**
 * Produtos que devem seguir em alta: cresceu mais de 10% E aumentou em
 * pedidos/dia. `mantem` marca quem não perdeu força na 2ª quinzena. Até 6.
 */
export function produtosEmAlta(produtos: readonly ProdutoComparado[]): ProdutoTendencia[] {
  return produtos
    .filter((p) => p.variacao != null && p.variacao > 10 && p.difDia > 0)
    .map((p): ProdutoTendencia => ({ ...p, mantem: p.q2 >= p.q1 * 0.9 }))
    .sort((a, b) => b.difDia - a.difDia)
    .slice(0, 6);
}

/** Produtos em queda: perdeu mais de 10% E diminuiu em pedidos/dia. Até 6. */
export function produtosEmQueda(produtos: readonly ProdutoComparado[]): ProdutoComparado[] {
  return produtos
    .filter((p) => p.variacao != null && p.variacao < -10 && p.difDia < 0)
    .sort((a, b) => a.difDia - b.difDia)
    .slice(0, 6);
}

// ---------------------------------------------------------------------------
// Tabela de peças
// ---------------------------------------------------------------------------

/**
 * Ordena a tabela de peças. `movimento` é |diferença|: quem despencou é tão
 * relevante quanto quem disparou. Produto sem mês anterior (variação null) vai
 * para o fim em qualquer sentido. Não muda a lista recebida.
 */
export function ordenarPecas(pecas: readonly PecaComparada[], ordem: OrdemPecas): PecaComparada[] {
  const sinal = ordem.desc ? -1 : 1;
  return pecas.slice().sort((x, y) => {
    let a: number | null;
    let b: number | null;
    if (ordem.campo === 'movimento') {
      a = Math.abs(x.difDia);
      b = Math.abs(y.difDia);
    } else if (ordem.campo === 'sku') {
      return sinal * x.sku.localeCompare(y.sku, 'pt-BR');
    } else {
      a = x[ordem.campo];
      b = y[ordem.campo];
    }
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return sinal * (a - b);
  });
}

/**
 * Próxima ordem ao clicar num cabeçalho: clicar no campo ativo inverte o
 * sentido; campo novo começa decrescente, menos "Produto" (A a Z).
 */
export function alternarOrdemPecas(atual: OrdemPecas, campo: OrdemPecas['campo']): OrdemPecas {
  if (atual.campo === campo) return { campo, desc: !atual.desc };
  return { campo, desc: campo !== 'sku' };
}

// ---------------------------------------------------------------------------
// Gráficos do comparativo
// ---------------------------------------------------------------------------

/** Média de pedidos por dia da semana, segunda a sexta. */
export function mediasPorDiaSemana(uteis: readonly DiaUtil[]): number[] {
  const acc: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const x of uteis) acc[x.diaSemana]?.push(x.pedidos);
  return [1, 2, 3, 4, 5].map((w) => {
    const v = acc[w] ?? [];
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
  });
}

/** Dia pico (índice 0 = segunda) e quanto ele fica acima do dia útil médio (%). */
export function picoDiaSemana(medias: readonly number[]): { indice: number; acima: number } {
  const indice = medias.indexOf(Math.max(...medias));
  const mediaGeral = medias.reduce((s, v) => s + v, 0) / 5;
  const pico = medias[indice] ?? 0;
  return { indice, acima: mediaGeral ? (pico / mediaGeral - 1) * 100 : 0 };
}

/** Faixas de dias do mês usadas no gráfico "por semana do mês". */
export const FAIXAS_DO_MES: readonly (readonly [number, number])[] = [
  [1, 7],
  [8, 14],
  [15, 21],
  [22, 28],
  [29, 31],
];

/**
 * Média por dia útil dentro de cada faixa do mês, NÃO o total (a faixa 29 a
 * 31 tem 1 a 3 dias e apareceria sempre como a mais fraca).
 */
export function mediasPorFaixaDoMes(uteis: readonly DiaUtil[]): number[] {
  return FAIXAS_DO_MES.map(([ini, fim]) => {
    const v = uteis.filter((x) => {
      const d = diaDoMes(x.dia);
      return d >= ini && d <= fim;
    });
    return v.length ? v.reduce((s, x) => s + x.pedidos, 0) / v.length : 0;
  });
}

/** Diferença (%) entre a faixa mais cheia e a mais vazia; null com menos de 2 faixas com movimento. */
export function amplitudeFaixas(medias: readonly number[]): number | null {
  const v = medias.filter((x) => x > 0);
  if (v.length < 2) return null;
  return (Math.max(...v) / Math.min(...v) - 1) * 100;
}

/** Série diária de um mês para o gráfico (31 posições; null onde o mês não tem o dia). */
export function serieDiaria(agg: MesAgregado, chave: string): (number | null)[] {
  const ultimo = new Date(Date.UTC(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)), 0)).getUTCDate();
  const out: (number | null)[] = [];
  for (let d = 1; d <= 31; d++) {
    out.push(d > ultimo ? null : agg.dias[`${chave}-${String(d).padStart(2, '0')}`] || 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expectativa do mês corrente
// ---------------------------------------------------------------------------

export interface DestaquesProjecao {
  /** dias acima do teto */
  estouram: LinhaProjecao[];
  semanaMaisCheia: SemanaProjetada | undefined;
  /** pela CARGA do dia (inclui transbordo) */
  diaMaisPesado: LinhaProjecao | undefined;
}

export function destaquesProjecao(pr: Projecao): DestaquesProjecao {
  return {
    estouram: pr.linhas.filter((l) => l.estoura),
    semanaMaisCheia: pr.semanas.slice().sort((a, b) => b.demanda - a.demanda)[0],
    diaMaisPesado: pr.linhas.slice().sort((a, b) => b.demanda - a.demanda)[0],
  };
}

export interface SemanaComMedia extends SemanaProjetada {
  media: number;
  /** largura da barra, 0 a 100, proporcional à média por dia útil */
  largura: number;
  /** a semana de maior total do mês */
  maisCheia: boolean;
}

/** Semanas com a média por dia útil (a barra) e a marca da mais cheia. */
export function semanasComMedia(semanas: readonly SemanaProjetada[]): SemanaComMedia[] {
  const comMedia = semanas.map((s) => ({ ...s, media: s.dias ? s.demanda / s.dias : 0 }));
  const maxMedia = comMedia.reduce((m, s) => (s.media > m ? s.media : m), 0);
  const maiorTotal = semanas.reduce((m, s) => Math.max(m, s.demanda), 0);
  return comMedia.map((s) => ({
    ...s,
    largura: maxMedia ? (s.media / maxMedia) * 100 : 0,
    maisCheia: s.demanda === maiorTotal,
  }));
}

/** A onda de algum spike com excesso cai no mesmo dia que a transferência deste feriado? */
export function ondaNoMesmoDia(spikes: readonly SpikeProjetado[], feriado: Pick<FeriadoDoMes, 'para'>): SpikeProjetado | undefined {
  return spikes.filter((s) => (s.excesso ?? 0) > 0 && s.para === feriado.para)[0];
}

/** O texto do backtest cita o erro "sem feriado e spike" quando ele muda o resultado em 0,5 ponto ou mais. */
export function backtestMostraSemEventos(bt: Backtest): boolean {
  return Math.abs(bt.erroSemEventos - bt.erro) >= 0.5;
}

export type ItemAgenda =
  | { tipo: 'feriado-trabalhado'; data: DayKey; feriado: FeriadoDoMes; realizado: number | null }
  | { tipo: 'feriado-parado'; data: DayKey; feriado: FeriadoDoMes; ondaJunto: SpikeProjetado | undefined }
  | { tipo: 'spike'; data: DayKey; spike: SpikeProjetado; semMedicaoBF: boolean; semOnda: boolean }
  | { tipo: 'teto'; data: DayKey; linha: LinhaProjecao };

/**
 * Lista de ação do mês, ordenada por data: feriados em dia útil (trabalhados
 * ou parados), spike days e dias acima do teto. A tela escolhe o texto de cada
 * item; as classificações (BF sem medição, onda no mesmo dia do feriado) vêm
 * prontas.
 */
export function agendaDeDecisoes(pr: Projecao): ItemAgenda[] {
  const itens: ItemAgenda[] = [];

  for (const f of pr.feriados) {
    if (!f.util) continue;
    if (f.trabalhado) {
      const linha = pr.linhas.filter((l) => l.dia === f.data)[0];
      itens.push({ tipo: 'feriado-trabalhado', data: f.data, feriado: f, realizado: linha ? linha.realizado : null });
      continue;
    }
    itens.push({ tipo: 'feriado-parado', data: f.data, feriado: f, ondaJunto: ondaNoMesmoDia(pr.spikes, f) });
  }

  for (const s of pr.spikes) {
    const meds = s.medicoes ?? [];
    itens.push({
      tipo: 'spike',
      data: s.data,
      spike: s,
      semMedicaoBF: !meds.length && s.tipo === 'bf',
      semOnda: !s.para || !meds.length,
    });
  }

  for (const l of pr.linhas) {
    if (l.estoura) itens.push({ tipo: 'teto', data: l.dia, linha: l });
  }

  // ordenação estável por data, como no arquivo antigo
  return itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
