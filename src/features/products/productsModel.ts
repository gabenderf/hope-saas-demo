import type { CsvColumn } from '@/lib/csv';
import type { ProductRow } from '@/data/types';

export type ProductOrder = 'pedidos' | 'unidades';

/** % dos pedidos do SKU em que ele dividiu a caixa com outro SKU. */
export function mixedPercentOfProduct(p: Pick<ProductRow, 'orders' | 'mixedOrders'>): number | null {
  return p.orders > 0 ? (p.mixedOrders / p.orders) * 100 : null;
}

/** Busca por trecho do SKU e ordena por pedidos (padrão) ou unidades. Empate: o outro critério, depois o SKU. */
export function filterAndSortProducts(rows: ProductRow[], query: string, order: ProductOrder): ProductRow[] {
  const q = query.trim().toLowerCase();
  const list = q ? rows.filter((r) => r.sku.toLowerCase().includes(q)) : [...rows];
  return list.sort((a, b) => {
    const [pa, pb] = order === 'pedidos' ? [a.orders, b.orders] : [a.units, b.units];
    const [sa, sb] = order === 'pedidos' ? [a.units, b.units] : [a.orders, b.orders];
    return pb - pa || sb - sa || a.sku.localeCompare(b.sku);
  });
}

export const PRODUCT_CSV_COLUMNS: CsvColumn<ProductRow>[] = [
  { header: 'SKU', value: (r) => r.sku },
  { header: 'Pedidos', value: (r) => r.orders },
  { header: 'Unidades', value: (r) => r.units },
  { header: 'Em pedido misto %', value: (r) => mixedPercentOfProduct(r), decimals: 1 },
];
