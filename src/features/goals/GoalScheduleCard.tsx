import { CalendarClock, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGoalSchedule, useSetGoalSchedule, useToday, type WriteGate } from '@/data/hooks';
import type { GoalScheduleEntry } from '@/data/types';
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Input, Notice, Skeleton, toast } from '@/components/ui';
import { formatDayWithWeekday } from '@/lib/format';
import { useIntent } from '@/lib/url-state';
import { type AgendaDay, nextBusinessDays, parseGoal } from './logic';

export function GoalScheduleCard({ enabled, gate }: { enabled: boolean; gate: WriteGate; globalGoal: number | null }) {
  const [intent, clearIntent] = useIntent();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (intent === 'agenda') {
      ref.current?.scrollIntoView({ block: 'start' });
      ref.current?.querySelector<HTMLInputElement>('input')?.focus();
      clearIntent();
    }
  }, [intent, clearIntent]);

  return (
    <Card ref={ref} id="agenda">
      <CardHeader
        title="Agenda de metas"
        description="Meta global planejada para os próximos 15 dias úteis. Aplicada automaticamente no início do dia."
      />
      {enabled ? (
        <ScheduleList gate={gate} />
      ) : (
        <CardBody>
          <Notice title="A agenda precisa de uma tabela nova no banco">
            Ela entra na fase da nuvem, junto com o histórico de alterações. Até lá, ajuste a meta global do dia no cartão acima.
          </Notice>
        </CardBody>
      )}
    </Card>
  );
}

function ScheduleList({ gate }: { gate: WriteGate }) {
  const today = useToday();
  const days = useMemo(() => nextBusinessDays(today, 15), [today]);
  const from = days[0]!.day;
  const to = days[days.length - 1]!.day;
  const query = useGoalSchedule({ from, to });

  if (query.isPending) {
    return (
      <CardBody className="grid gap-2" aria-busy="true">
        {days.slice(0, 5).map((d) => (
          <Skeleton key={d.day} className="h-9 w-full" />
        ))}
      </CardBody>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Não foi possível carregar a agenda"
        description="A leitura falhou. Nada foi alterado."
        action={
          <Button size="sm" icon={<RefreshCw />} onClick={() => void query.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }
  const byDay = new Map(query.data.map((e) => [e.day, e]));
  return (
    <>
      <ul className="divide-y divide-line">
        {days.map((d) => (
          <ScheduleRow key={`${d.day}-${byDay.get(d.day)?.value ?? 'x'}-${byDay.get(d.day)?.note ?? ''}`} day={d} entry={byDay.get(d.day)} gate={gate} />
        ))}
      </ul>
      <CardFooter>Dia sem meta planejada fica sem meta global: valem as metas individuais.</CardFooter>
    </>
  );
}

function ScheduleRow({ day, entry, gate }: { day: AgendaDay; entry: GoalScheduleEntry | undefined; gate: WriteGate }) {
  const mutation = useSetGoalSchedule();
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string | undefined>();
  const label = formatDayWithWeekday(day.day);

  const dirty = value !== (entry?.value != null ? String(entry.value) : '') || note !== (entry?.note ?? '');

  const save = () => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    let parsed: number | null = null;
    if (value.trim()) {
      const r = parseGoal(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      parsed = r.value;
    }
    setError(undefined);
    mutation.mutate(
      { day: day.day, value: parsed, note: note.trim() || undefined },
      {
        onSuccess: (r) =>
          toast.undoable(parsed == null ? `${label}: sem meta global.` : `${label}: meta planejada em ${parsed}/h.`, r.undo),
        onError: (e) => toast.error(e.message || 'Não foi possível salvar.'),
      },
    );
  };

  return (
    <li className="grid gap-2 px-4 py-2.5 sm:grid-cols-[170px_110px_1fr_auto] sm:items-start">
      <div className="grid gap-1">
        <span className="font-medium">{label}</span>
        {day.holiday ? (
          <Badge tone={day.stopped ? 'neutral' : 'warn'} className="w-fit">
            {day.holiday.name}
            {day.stopped ? ', galpão para' : ''}
          </Badge>
        ) : null}
      </div>
      <div>
        <Input
          aria-label={`Meta planejada para ${label}`}
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          placeholder="Sem meta"
          value={value}
          disabled={!gate.allowed}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
        {error ? (
          <p role="alert" className="mt-1 text-xs text-crit">
            {error}
          </p>
        ) : null}
      </div>
      <Input
        aria-label={`Nota para ${label}`}
        placeholder="Nota (opcional)"
        value={note}
        disabled={!gate.allowed}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="sm"
        loading={mutation.isPending}
        aria-disabled={!gate.allowed || !dirty || undefined}
        onClick={() => {
          if (gate.allowed && !dirty) return;
          save();
        }}
      >
        Salvar
      </Button>
    </li>
  );
}
