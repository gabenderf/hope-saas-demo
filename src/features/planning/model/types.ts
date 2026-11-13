/**
 * Tipos do modelo do Planejamento. Sem DOM, sem fetch, sem localStorage:
 * quem lê o banco e guarda cache é a camada de dados da tela; o modelo só
 * recebe agregados e devolve números.
 */
import type { DayKey } from '@/lib/time';
import type { Familias } from './sku';

/** Linha de `pedidos_separados` como o planejamento a lê (só estas colunas). */
export interface PedidoLinha {
  data_hora: string;
  itens: unknown;
}

/** Contagens de um SKU EXATO dentro de um mês. */
export interface ProdutoAgg {
  /** pedidos distintos em que o SKU aparece */
  total: number;
  /** pedidos na 1ª quinzena (dia 1 a 15) */
  q1: number;
  /** pedidos na 2ª quinzena (dia 16 em diante) */
  q2: number;
  /** pedidos em que o SKU saiu sozinho */
  solo: number;
  /** pedidos mistos: o SKU dividiu a caixa com outro produto */
  acomp: number;
  /** soma de `quantidade` (unidades de anúncio, antes do prefixo NX-) */
  unid: number;
}

/** Agregado de um mês. É o que a tela guarda em cache (~8 KB por mês). */
export interface MesAgregado {
  /** 'YYYY-MM-DD' -> pedidos do dia */
  dias: Record<DayKey, number>;
  /** SKU exato (maiúsculo) -> contagens */
  prod: Record<string, ProdutoAgg>;
  /** 'SKU_A||SKU_B' -> ocorrências (só pedidos de exatamente 2 SKUs, podados abaixo de 5) */
  pares: Record<string, number>;
  totalPedidos: number;
  /** pedidos com mais de um ITEM (contagem de linhas de item, não de SKUs distintos) */
  pedidosMulti: number;
}

/**
 * Tudo que o modelo precisa saber, de uma vez: os meses carregados, quais são
 * os dois fechados e o corrente, o dia de hoje (SP) e as embalagens.
 */
export interface ContextoPlanejamento {
  /** chave 'YYYY-MM' -> agregado */
  meses: Readonly<Record<string, MesAgregado>>;
  /** mês fechado mais antigo (base de comparação) */
  chaveA: string;
  /** mês fechado mais recente */
  chaveB: string;
  /** mês corrente (parcial) */
  chaveAtual: string;
  /** dia de hoje em São Paulo. É injetado para o modelo ser determinístico. */
  hoje: DayKey;
  /** tamanhos de embalagem por família; padrão FAMILIAS_PADRAO */
  familias?: Familias;
}

/** Dia útil com movimento. */
export interface DiaUtil {
  dia: DayKey;
  pedidos: number;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
}
