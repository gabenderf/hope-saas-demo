import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { useSetIndividualGoals, useWriteGate } from '@/data/hooks';
import { formatInt } from '@/lib/format';
import { parseGoal } from './goal';

export interface OperatorGoalFormProps {
  operatorId: string;
  operatorName: string;
  value: number;
  /** A meta global está valendo e ignora a individual. */
  globalActive: boolean;
}

/** Editor da meta individual (painel e página do operador). */
export function OperatorGoalForm({ operatorId, operatorName, value, globalActive }: OperatorGoalFormProps) {
  const gate = useWriteGate('expedicao.metas.editar');
  const mutation = useSetIndividualGoals();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const text = draft ?? String(value);

  const submit = async () => {
    if (!gate.allowed) {
      toast(gate.message ?? 'Seu perfil não permite alterar metas.');
      return;
    }
    const parsed = parseGoal(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      const result = await mutation.mutateAsync({ operatorIds: [operatorId], value: parsed.value });
      toast.undoable(`Meta de ${operatorName} agora é ${formatInt(parsed.value)}/h.`, result.undo);
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a meta.');
    }
  };

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field
        label="Meta individual, pedidos por hora"
        error={error}
        help={globalActive ? 'A meta global está ativa e vale no lugar desta. Esta fica guardada para quando a global for removida.' : undefined}
      >
        <Input
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" variant="primary" aria-disabled={!gate.allowed || undefined} loading={mutation.isPending}>
          Salvar meta
        </Button>
      </div>
    </form>
  );
}
