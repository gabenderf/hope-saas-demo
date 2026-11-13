import { Activity } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useActivity, useToday } from '@/data/hooks';
import { describeActivity } from '@/features/operators/components/activityText';
import { QueryError } from '@/features/operators/components/QueryError';
import { cn } from '@/lib/cn';
import { formatDayLong, formatTime } from '@/lib/format';
import { useUrlEnum, useUrlString } from '@/lib/url-state';
import { type KindFilter, filterActivity, groupByHour } from './filters';

const KINDS: readonly KindFilter[] = ['todos', 'bipes', 'acessos'];
const ALL = '__todos__';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function ActivityPage() {
  const today = useToday();
  const [dayParam, setDayParam] = useUrlString('dia');
  const day = DAY_PATTERN.test(dayParam) && dayParam < today ? dayParam : today;
  const isToday = day === today;
  const [kind, setKind] = useUrlEnum<KindFilter>('tipo', KINDS, 'todos');
  const [operatorId, setOperatorId] = useUrlString('operador');
  const [station, setStation] = useUrlString('bancada');

  const q = useActivity(isToday ? { limit: 200 } : { limit: 200, day });

  const items = q.data;

  // Itens novos acendem quando APARECEM na lista (a lista chega com atraso do throttle), só hoje.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<ReadonlySet<string> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const ids = new Set((items ?? []).map((i) => i.id));
    const prev = seen.current;
    seen.current = ids;
    if (!isToday || prev == null || prev.size === 0) return;
    const added = [...ids].filter((id) => !prev.has(id));
    if (added.length === 0 || added.length > 20) return;
    setFresh(new Set(added));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFresh(new Set()), 1500);
  }, [items, isToday]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const operators = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items ?? []) if (it.operatorId) map.set(it.operatorId, it.operatorName ?? `ID ${it.operatorId}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [items]);
  const stations = useMemo(() => [...new Set((items ?? []).map((i) => i.station).filter((s): s is string => !!s))].sort(), [items]);

  const groups = useMemo(() => groupByHour(filterActivity(items ?? [], { kind, operatorId, station })), [items, kind, operatorId, station]);

  return (
    <div className="mx-auto grid max-w-[900px] gap-4 p-4 md:p-6">
      <PageHeader
        title="Atividade"
        breadcrumbs={[{ label: 'Expedição', to: '/expedicao' }, { label: 'Atividade' }]}
        renderLink={(c) => <Link to={c.to}>{c.label}</Link>}
        meta={formatDayLong(day)}
        actions={
          <>
            <SegmentedControl
              aria-label="Tipo de atividade"
              value={kind}
              onValueChange={(v) => setKind(v as KindFilter)}
              options={[
                { value: 'todos', label: 'Tudo' },
                { value: 'bipes', label: 'Bipes' },
                { value: 'acessos', label: 'Entradas e saídas' },
              ]}
            />
            <Select
              aria-label="Operador"
              className="w-auto min-w-40"
              value={operatorId || ALL}
              onValueChange={(v) => setOperatorId(v === ALL ? '' : v)}
              options={[{ value: ALL, label: 'Todos os operadores' }, ...operators.map(([id, name]) => ({ value: id, label: name }))]}
            />
            <Select
              aria-label="Bancada"
              className="w-auto min-w-36"
              value={station || ALL}
              onValueChange={(v) => setStation(v === ALL ? '' : v)}
              options={[{ value: ALL, label: 'Todas as bancadas' }, ...stations.map((s) => ({ value: s, label: `Bancada ${s}` }))]}
            />
            <Input
              type="date"
              aria-label="Dia"
              className="w-auto"
              max={today}
              value={day}
              onChange={(e) => setDayParam(e.target.value >= today ? '' : e.target.value)}
            />
          </>
        }
      />

      {q.isError ? (
        <QueryError what="a atividade" onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Card className="grid gap-3 p-4" aria-busy="true" aria-label="Carregando atividade">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity />}
            title={items && items.length > 0 ? 'Nada com esses filtros' : isToday ? 'Nenhuma atividade ainda hoje' : 'Nenhuma atividade neste dia'}
            description={
              items && items.length > 0
                ? 'Mude os filtros para ver o resto do dia.'
                : 'Bipes e entradas e saídas aparecem aqui assim que a extensão os registrar nas bancadas.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <Card key={g.label} aria-label={`Atividade das ${g.label}`}>
              <h2 className="border-b border-line px-4 py-2 text-md">
                <span className="font-mono">{g.label}</span>
                <span className="ml-2 font-normal text-ink-3">{g.items.length} registros</span>
              </h2>
              <ul>
                {g.items.map((it) => (
                  <li
                    key={it.id}
                    className={cn('flex items-baseline gap-3 border-b border-line px-4 py-2 last:border-b-0', fresh.has(it.id) && 'animate-row-flash')}
                  >
                    <time dateTime={it.at} className="font-mono text-xs text-ink-3">
                      {formatTime(it.at)}
                    </time>
                    <span className="min-w-0 flex-1 text-ink-2">{describeActivity(it)}</span>
                    {it.mixed && <Badge>pedido misto</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
