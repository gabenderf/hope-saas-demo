import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSetIndividualGoals, useWriteGate } from '@/data/hooks';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { parseGoal } from './goal';

export interface GoalCellProps {
  operatorId: string;
  operatorName: string;
  value: number;
  /** Quando a meta global está ativa, a individual aparece riscada (continua valendo ao remover a global). */
  overridden: boolean;
}

/** Meta individual editável na célula. Sem permissão, o controle fica aria-disabled e o clique explica. */
export function GoalCell({ operatorId, operatorName, value, overridden }: GoalCellProps) {
  const gate = useWriteGate('expedicao.metas.editar');
  const mutation = useSetIndividualGoals();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const start = () => {
    if (!gate.allowed) {
      toast(gate.message ?? 'Seu perfil não permite alterar metas.');
      return;
    }
    setDraft(String(value));
    setError(null);
    setEditing(true);
  };

  const commit = async () => {
    if (savingRef.current) return;
    const parsed = parseGoal(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.value === value) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    try {
      const result = await mutation.mutateAsync({ operatorIds: [operatorId], value: parsed.value });
      toast.undoable(`Meta de ${operatorName} agora é ${formatInt(parsed.value)}/h.`, result.undo);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a meta.');
    } finally {
      savingRef.current = false;
    }
  };

  if (editing) {
    return (
      <span className="inline-grid justify-items-end gap-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          inputMode="numeric"
          aria-label={`Meta individual de ${operatorName}, pedidos por hora`}
          aria-invalid={error ? true : undefined}
          className="tabular h-6 w-16 text-right"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => void commit()}
        />
        {error && (
          <span role="alert" className="max-w-40 whitespace-normal text-xs text-crit">
            {error}
          </span>
        )}
      </span>
    );
  }

  const button = (
    <button
      type="button"
      aria-disabled={!gate.allowed || undefined}
      aria-label={`Meta individual de ${operatorName}: ${formatInt(value)} por hora${overridden ? ', ignorada enquanto a meta global estiver ativa' : ''}. Editar`}
      onClick={(e) => {
        e.stopPropagation();
        start();
      }}
      className={cn(
        'group/goal inline-flex items-center gap-1.5 rounded-sm px-1 hover:bg-sunk focus-visible:shadow-focus aria-disabled:cursor-not-allowed',
        overridden && 'text-ink-3 line-through',
      )}
    >
      <span className="tabular">{formatInt(value)}</span>
      {gate.allowed && <Pencil className="size-3 opacity-0 group-hover/goal:opacity-60 group-focus-visible/goal:opacity-60" aria-hidden="true" />}
    </button>
  );

  return overridden ? <Tooltip content="Ignorada enquanto a meta global estiver ativa. Não é apagada.">{button}</Tooltip> : button;
}
