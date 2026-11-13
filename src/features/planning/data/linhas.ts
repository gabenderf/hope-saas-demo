/**
 * Eventos crus da fonte de operações -> linhas no formato de
 * `pedidos_separados` que o modelo lê (data_hora, itens). Uma bipagem = uma
 * linha, como no planejamento.js. As combinações (pares de SKU no mesmo
 * pedido) saem daqui: `agregar` conta os pedidos de exatamente 2 SKUs.
 */
import type { DayEvents } from '@/data/types';
import type { PedidoLinha } from '../model/types';

export function linhasDoDia(events: Pick<DayEvents, 'scans'>): PedidoLinha[] {
  return events.scans.map((s) => ({
    data_hora: s.at,
    itens: s.items ? s.items.map((i) => ({ sku: i.sku, quantidade: i.quantity })) : null,
  }));
}
