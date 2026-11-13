import { History, Pencil, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { toast } from '@/components/ui/toast';
import { useAuditLog, useNow, useSetGlobalGoal, useWriteGate } from '@/data/hooks';
import { parseGoal } from '@/features/operators/components/goal';
import { formatDateTime, formatInt, formatWhen } from '@/lib/format';

export interface GlobalGoalStripProps {
  globalGoal: number | null;
  globalGoalUpdatedAt: string | null;
}

/** Faixa da meta global: mostra, e (com permissão) altera ou remove. */
export function GlobalGoalStrip({ globalGoal, globalGoalUpdatedAt }: GlobalGoalStripProps) {
  const gate = useWriteGate('expedicao.metas.editar');
  const now = useNow();
  const mutation = useSetGlobalGoal();
  const audit = useAuditLog({ limit: 50 });
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(() => (audit.data ?? []).filter((e) => e.action.startsWith('meta-global.')), [audit.data]);
  const last = history[0];

  const denied = () => toast(gate.message ?? 'Seu perfil não permite alterar a meta global.');

  const apply = async (value: number | null) => {
    try {
      const result = await mutation.mutateAsync({ value });
      toast.undoable(value == null ? 'Meta global removida. Cada operador volta à própria meta.' : `Meta global definida em ${formatInt(value)}/h.`, result.undo);
      setEditOpen(false);
      setText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a meta global.');
    }
  };

  const submit = () => {
    const parsed = parseGoal(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    void apply(parsed.value);
  };

  const form = (
    <Popover
      open={editOpen}
      onOpenChange={(o) => {
        if (o && !gate.allowed) return denied();
        if (o) setText(globalGoal != null ? String(globalGoal) : '');
        setError(null);
        setEditOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" icon={globalGoal == null ? <Target /> : <Pencil />} variant={globalGoal == null ? 'primary' : 'secondary'} aria-disabled={!gate.allowed || undefined}>
          {globalGoal == null ? 'Definir meta global' : 'Alterar'}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="global-goal" className="text-xs font-medium">
            Meta global, pedidos por hora
          </label>
          <Input id="global-goal" inputMode="numeric" autoFocus value={text} aria-invalid={error ? true : undefined} onChange={(e) => (setText(e.target.value), setError(null))} />
          <p className="text-xs text-ink-3">Vale para todos os operadores e ignora as metas individuais enquanto estiver ativa. Inteiro de 1 a 200.</p>
          {error && (
            <p role="alert" className="text-xs text-crit">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="sm" loading={mutation.isPending}>
            Salvar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );

  const author = last ? last.actor.name : null;
  const when = last ? formatWhen(last.at, now) : globalGoalUpdatedAt ? formatWhen(globalGoalUpdatedAt, now) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-4 py-2.5">
      <Target className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-ink-2">
        {globalGoal == null ? (
          'Sem meta global. Cada operador usa a própria meta individual.'
        ) : (
          <>
            <b className="font-semibold text-ink">Meta global ativa: {formatInt(globalGoal)}/h</b> para todos os operadores.
            {when && ` Alterada${author ? ` por ${author}` : ''} ${when}.`}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {history.length > 0 && (
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" icon={<History />}>
                Histórico
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px]">
              <p className="mb-2 font-semibold">Últimas mudanças da meta global</p>
              <ul className="grid gap-2">
                {history.slice(0, 6).map((e) => (
                  <li key={e.id} className="grid">
                    <span>
                      {e.actor.name} {e.summary}
                    </span>
                    <span className="font-mono text-xs text-ink-3">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        {form}
        {globalGoal != null && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X />}
            aria-disabled={!gate.allowed || undefined}
            loading={mutation.isPending && !editOpen}
            onClick={() => (gate.allowed ? void apply(null) : denied())}
          >
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
