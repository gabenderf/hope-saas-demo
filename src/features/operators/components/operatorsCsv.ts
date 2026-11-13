import type { CsvColumn } from '@/lib/csv';
import type { OperatorRow } from '@/data/types';
import { mixedPercent } from './columns';

/** Colunas do CSV de operadores (Visão Geral e Operadores). */
export const OPERATOR_CSV_COLUMNS: CsvColumn<OperatorRow>[] = [
  { header: 'ID', value: (r) => r.id },
  { header: 'Operador', value: (r) => r.name },
  { header: 'Bancada', value: (r) => r.station },
  { header: 'Status', value: (r) => r.status },
  { header: 'Pedidos', value: (r) => r.orders },
  { header: 'Pedidos simples', value: (r) => r.simpleOrders },
  { header: 'Pedidos mistos', value: (r) => r.mixedOrders },
  { header: 'Mistos %', value: (r) => mixedPercent(r), decimals: 1 },
  { header: 'Ritmo por hora', value: (r) => r.rate, decimals: 1 },
  { header: 'Meta individual', value: (r) => r.individualGoal },
  { header: 'Meta valendo', value: (r) => r.effectiveGoal },
  { header: 'Contra a meta %', value: (r) => (r.goalRatio == null ? null : r.goalRatio * 100), decimals: 0 },
];
