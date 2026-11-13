import { Badge } from '@/components/ui/Badge';
import { formatTime } from '@/lib/format';
import type { ActivityItem } from '@/data/types';
import { describeActivity } from './activityText';

/** Lista compacta de atividade (painel e página do operador). */
export function ActivityList({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-ink-3">{empty}</p>;
  return (
    <ul className="grid">
      {items.map((it) => (
        <li key={it.id} className="flex items-baseline gap-3 border-b border-line py-1.5 last:border-b-0">
          <time dateTime={it.at} className="font-mono text-xs text-ink-3">
            {formatTime(it.at)}
          </time>
          <span className="min-w-0 flex-1 text-ink-2">{describeActivity(it)}</span>
          {it.mixed && <Badge>misto</Badge>}
        </li>
      ))}
    </ul>
  );
}
