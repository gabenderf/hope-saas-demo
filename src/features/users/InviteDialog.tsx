import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from '@/auth/types';
import { useInvitePanelUser, type WriteGate } from '@/data/hooks';
import { Button, Dialog, DialogContent, Field, Input, Select, toast } from '@/components/ui';

const ROLES: Role[] = ['lideranca', 'leitura', 'admin'];

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').email('Esse e-mail não parece certo.'),
  role: z.enum(['admin', 'lideranca', 'leitura', 'tv']),
});
type FormValues = z.infer<typeof schema>;

export function InviteDialog({ open, onOpenChange, gate }: { open: boolean; onOpenChange: (open: boolean) => void; gate: WriteGate }) {
  const invite = useInvitePanelUser();
  const { register, handleSubmit, control, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'leitura' },
  });
  const role = useWatch({ control, name: 'role' });

  const submit = handleSubmit((v) => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    invite.mutate(v, {
      onSuccess: (r) => {
        toast.undoable(`Convite enviado para ${v.email}.`, r.undo);
        reset();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || 'Não foi possível convidar.'),
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Convidar usuário"
        description="A pessoa recebe um e-mail para criar a senha e configurar a verificação em duas etapas."
        footer={
          <>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="invite-form" variant="primary" loading={invite.isPending} aria-disabled={!gate.allowed || undefined}>
              Enviar convite
            </Button>
          </>
        }
      >
        <form id="invite-form" className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
          <Field label="Nome" required error={formState.errors.name?.message}>
            <Input autoComplete="off" {...register('name')} />
          </Field>
          <Field label="E-mail" required error={formState.errors.email?.message}>
            <Input type="email" autoComplete="off" {...register('email')} />
          </Field>
          <Field label="Perfil" help={ROLE_DESCRIPTION[role]}>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                />
              )}
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
