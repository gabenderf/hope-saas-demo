import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import type { OperatorRow } from '@/data/types';
import { AWAY_TEXT } from './awayText';

export function StatusBadge({ row }: { row: OperatorRow }) {
  if (row.status === 'ativo') return <Badge tone="ok">Ativo</Badge>;
  if (row.status === 'inativo') return <Badge>Inativo</Badge>;
  const reason = row.awayReason ? AWAY_TEXT[row.awayReason] : 'Fora da bancada.';
  return (
    <Tooltip content={reason}>
      <Badge tabIndex={0} aria-label={`Ausente. ${reason}`}>
        Ausente
      </Badge>
    </Tooltip>
  );
}
