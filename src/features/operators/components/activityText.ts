import type { ActivityItem } from '@/data/types';

/** Frase curta de um item do feed. Usada na Atividade, no painel e na página do operador. */
export function describeActivity(item: ActivityItem): string {
  const who = item.operatorName ?? 'Operador desconhecido';
  const st = item.station ? ` na bancada ${item.station}` : '';
  switch (item.kind) {
    case 'bipe': {
      const skus = item.skus?.length ? ` ${item.skus.join(', ')}` : '';
      return `${who} bipou${item.mixed ? ' um pedido misto' : ' um pedido'}${st}.${skus}`.replace(/\.$/, '');
    }
    case 'entrada':
      return `${who} entrou${st}`;
    case 'saida':
      return `${who} saiu${st}`;
    case 'troca':
      return `${item.previousOperatorName ?? 'Operador'} deu lugar a ${who}${st}`;
  }
}
