import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { useSaveOperator } from '@/data/hooks';
import type { Operator } from '@/data/types';
import { DEFAULT_INDIVIDUAL_GOAL } from '@/lib/metrics';
import { type OperatorFormValues, operatorSchema } from './operatorSchema';

export interface OperatorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem operador = cadastro novo. */
  operator?: Operator;
  allOperators: Operator[];
}

export function OperatorFormDialog({ open, onOpenChange, operator, allOperators }: OperatorFormDialogProps) {
  const isNew = !operator;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <FormBody key={operator?.id ?? 'novo'} isNew={isNew} operator={operator} allOperators={allOperators} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function FormBody({ isNew, operator, allOperators, onClose }: { isNew: boolean; operator?: Operator; allOperators: Operator[]; onClose: () => void }) {
  const save = useSaveOperator();
  const taken = isNew ? allOperators.map((o) => o.id) : [];
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OperatorFormValues>({
    resolver: zodResolver(operatorSchema(taken)),
    defaultValues: { id: operator?.id ?? '', name: operator?.name ?? '', individualGoal: operator?.individualGoal ?? DEFAULT_INDIVIDUAL_GOAL },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await save.mutateAsync({ input: { ...values, id: values.id.trim(), name: values.name.trim() }, isNew });
      toast.undoable(isNew ? `${values.name.trim()} foi cadastrado.` : `${values.name.trim()} foi atualizado.`, result.undo);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o operador.');
    }
  });

  return (
    <DialogContent
      title={isNew ? 'Novo operador' : `Editar ${operator?.name ?? 'operador'}`}
      description="Operador com bipe registrado não pode ser apagado, porque os pedidos dele ficam ligados ao cadastro. Para tirar da lista, inative."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="operator-form" loading={save.isPending}>
            {isNew ? 'Cadastrar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="operator-form" className="grid gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field label="ID do operador" required error={errors.id?.message} help={isNew ? 'É o número que a extensão registra em cada bipe. Não muda depois.' : 'O ID não muda depois de cadastrado.'}>
          <Input className="font-mono" readOnly={!isNew} {...register('id')} />
        </Field>
        <Field label="Nome" required error={errors.name?.message}>
          <Input autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Meta individual, pedidos por hora" required error={errors.individualGoal?.message}>
          <Input inputMode="numeric" {...register('individualGoal', { valueAsNumber: true })} />
        </Field>
      </form>
    </DialogContent>
  );
}
