/* eslint-disable react-refresh/only-export-components */
import { ChevronsUpDown } from 'lucide-react';
import { useNavigate } from 'react-router';
import { MODULES } from '@/app/modules';
import { useAuth } from '@/auth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Módulo atual: o primeiro com status ativo (hoje só a Expedição existe). */
export function useCurrentModule() {
  return MODULES[0]!;
}

export function ModuleSwitcher({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const current = useCurrentModule();
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-md px-2 font-medium text-ink hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-hover',
          className,
        )}
        aria-label={`Módulo: ${current.label}. Trocar de módulo`}
      >
        <Icon className="size-4 text-ink-2" aria-hidden="true" />
        <span className="truncate">{current.label}</span>
        <ChevronsUpDown className="size-3.5 text-ink-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[280px]">
        <DropdownMenuLabel>Módulos da Hope</DropdownMenuLabel>
        {MODULES.map((m) => {
          const MIcon = m.icon;
          const soon = m.status === 'em-breve';
          const noAccess = !soon && !(user?.modules ?? []).includes(m.id);
          const disabled = soon || noAccess;
          return (
            <DropdownMenuItem
              key={m.id}
              disabled={disabled}
              disabledReason={soon ? 'Este módulo ainda não está disponível.' : 'Seu perfil não tem acesso a este módulo.'}
              aria-current={m.id === current.id ? 'true' : undefined}
              icon={<MIcon className="size-4 text-ink-2" aria-hidden="true" />}
              onSelect={() => void navigate(m.home)}
            >
              <span className="flex items-center justify-between gap-3">
                <span className={cn(m.id === current.id && 'font-semibold')}>{m.label}</span>
                {soon ? <span className="text-xs text-ink-3">em breve</span> : noAccess ? <span className="text-xs text-ink-3">sem acesso</span> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
