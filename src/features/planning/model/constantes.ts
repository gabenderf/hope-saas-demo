/**
 * Constantes de calibragem do Planejamento (mesmos nomes do planejamento.js).
 * Cada uma já custou erro; o porquê está em ../../dashboard-expedicao/CLAUDE.md.
 */

/**
 * Piso para um SKU entrar no comparativo. Abaixo disso a variação percentual
 * é ruído: 3 pedidos virando 6 são "+100%". Baixo porque a tabela é por SKU
 * EXATO: o volume de um produto se reparte entre 1X-, 3X-, 4X-.
 */
export const MIN_PEDIDOS_SKU = 30;

/**
 * Piso da tabela de peças, em peças/mês. Baixo de propósito: depois que a peça
 * virou EMBALAGEM, um pacote de 100 toucas conta 1. `LUVA-SOFT-M` faz 10
 * peças/mês; um piso de 20 apagaria a família inteira.
 */
export const MIN_PECAS_SKU = 5;

/** Detector de combinações novas: um par é "novo" quando aparece muito no mês recente... */
export const PAR_MIN_OCORRENCIAS = 30;
/** ... e era quase inexistente no anterior (no máximo esta razão do mês recente). */
export const PAR_RAZAO_MES_ANTERIOR = 0.1;

/** Fatia (em %) dos pedidos de um produto que pode vir de combinação nova antes da marca "pedido misto". */
export const PCT_COMBINADO = 25;
export const PCT_COMB_ATENCAO = 10;

/** Ordem padrão da tabela de peças: |diferença por dia útil|, subiu ou caiu. */
export type CampoOrdemPecas = 'movimento' | 'sku' | 'diaA' | 'diaB' | 'variacao' | 'pecasB';

export interface OrdemPecas {
  campo: CampoOrdemPecas;
  desc: boolean;
}

export const ORDEM_PECAS_PADRAO: OrdemPecas = { campo: 'movimento', desc: true };

/**
 * Rótulo de cada critério, para a legenda dizer em português o que está
 * ordenando. Se acrescentar coluna, acrescente o rótulo aqui junto.
 */
export const ORDEM_PECAS: Readonly<Record<CampoOrdemPecas, string>> = {
  movimento: 'Ordenado por maior movimento: o que mais mudou, tendo subido ou caído',
  sku: 'Ordenado por nome do produto',
  diaA: 'Ordenado pelas peças/dia útil do mês mais antigo',
  diaB: 'Ordenado pelas peças/dia útil do mês mais recente',
  variacao: 'Ordenado pela variação percentual',
  pecasB: 'Ordenado pelo total de peças do mês mais recente',
};

/** Prefixo de chave do cache local da tela (a versão sobe quando o formato do agregado muda). */
export const CACHE_PREFIXO = 'planejamento-v3-';

/** Tamanho da página de leitura de `pedidos_separados`. */
export const PAGINA = 1000;

/** Cache do mês corrente vale 10 minutos; mês fechado nunca expira. */
export const CACHE_MES_CORRENTE_MS = 10 * 60 * 1000;
