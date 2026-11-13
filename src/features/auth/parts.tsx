/** Peças das telas de acesso: senha com mostrar/ocultar, regras ao vivo e computador compartilhado. */
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useId, useState, type ComponentProps } from 'react';
import { useAuth } from '@/auth';
import { passwordChecks } from '@/auth/messages';
import { Checkbox, IconButton, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Campo de senha com botão de mostrar. Recebe id/aria-* do <Field>. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-9', className)} spellCheck={false} />
      <IconButton
        size="sm"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-0.5 top-1/2 -translate-y-1/2"
      >
        {visible ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  );
}

/** Regras da senha nova, atualizadas enquanto a pessoa digita. */
export function PasswordRules({ password, confirmation, id }: { password: string; confirmation: string; id?: string }) {
  const checks = passwordChecks(password, confirmation);
  return (
    <ul id={id} className="grid gap-1 text-xs" aria-label="Regras da senha">
      {checks.map((c) => (
        <li key={c.id} className={cn('flex items-center gap-1.5', c.ok ? 'text-ok' : 'text-ink-3')}>
          {c.ok ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
          <span>
            {c.label}
            <span className="sr-only">{c.ok ? ': cumprida' : ': falta'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Computador compartilhado": vale para este navegador (src/auth/session-policy.ts).
 * Aparece em toda tela que termina com a pessoa logada: login, senha nova do
 * convite e da redefinição. Sem isso, quem entra pelo link num PC do galpão
 * ficaria 15 dias logado.
 */
export function SharedComputerField() {
  const { sharedComputer = false, setSharedComputer } = useAuth();
  const id = useId();
  const helpId = useId();
  if (!setSharedComputer) return null;
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={sharedComputer}
        onCheckedChange={(v) => setSharedComputer(v === true)}
        aria-describedby={helpId}
      />
      <label htmlFor={id} className="cursor-pointer text-ink">
        Computador compartilhado
      </label>
      <p id={helpId} className="col-start-2 text-xs text-ink-3">
        Marque se outras pessoas usam este computador. O painel sai depois de 30 minutos sem uso. Sem marcar, você
        continua conectado por até 15 dias.
      </p>
    </div>
  );
}
