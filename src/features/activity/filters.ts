import type { ActivityItem } from '@/data/types';
import { formatTime } from '@/lib/format';

export type KindFilter = 'todos' | 'bipes' | 'acessos';

export interface ActivityFilters {
  kind: KindFilter;
  /** '' = todos */
  operatorId: string;
  /** '' = todas */
  station: string;
}

export function filterActivity(items: ActivityItem[], f: ActivityFilters): ActivityItem[] {
  return items.filter((it) => {
    if (f.kind === 'bipes' && it.kind !== 'bipe') return false;
    if (f.kind === 'acessos' && it.kind === 'bipe') return false;
    if (f.operatorId && it.operatorId !== f.operatorId) return false;
    if (f.station && it.station !== f.station) return false;
    return true;
  });
}

export interface HourGroup {
  /** "14h" */
  label: string;
  items: ActivityItem[];
}

/** Agrupa por hora (fuso de São Paulo), preservando a ordem recebida (mais recente primeiro). */
export function groupByHour(items: ActivityItem[]): HourGroup[] {
  const groups: HourGroup[] = [];
  for (const it of items) {
    const label = `${formatTime(it.at).slice(0, 2)}h`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}
