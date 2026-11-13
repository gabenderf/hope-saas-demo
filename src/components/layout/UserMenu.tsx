import { Component, Keyboard, LogOut, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth';
import { ROLE_LABEL, type Role } from '@/auth/types';
import { usePaletteStore } from '@/components/command/palette-store';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';

const DEMO_ROLES: Role[] = ['admin', 'lideranca', 'leitura', 'tv'];

export function UserMenu() {
  const { user, mode, signOut, signInDemo } = useAuth();
  const navigate = useNavigate();
  const setHelpOpen = usePaletteStore((s) => s.setHelpOpen);
  if (!user) return null;
  const showGuide = import.meta.env.DEV; // a rota /dev/ui só existe em desenvolvimento
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-2 rounded-md px-1 hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-hover md:px-1.5"
        aria-label={`Menu de ${user.name}`}
      >
        <Avatar name={user.name} />
        <span className="hidden text-sm font-medium md:inline">{ROLE_LABEL[user.role]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[240px]">
        <div className="px-2 py-1.5">
          <p className="truncate font-semibold">{user.name}</p>
          {user.email ? <p className="truncate text-xs text-ink-3">{user.email}</p> : null}
          <p className="text-xs text-ink-3">{ROLE_LABEL[user.role]}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Settings className="size-4" />} onSelect={() => void navigate('/configuracoes')}>
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Keyboard className="size-4" />} shortcut="?" onSelect={() => setHelpOpen(true)}>
          Atalhos de teclado
        </DropdownMenuItem>
        {showGuide ? (
          <DropdownMenuItem icon={<Component className="size-4" />} onSelect={() => void navigate('/dev/ui')}>
            Guia de componentes
          </DropdownMenuItem>
        ) : null}
        {mode === 'demo' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                Trocar perfil (demonstração)
              </span>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={user.role}
              onValueChange={(r) => {
                void signInDemo(r as Role);
              }}
            >
              {DEMO_ROLES.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOut className="size-4" />} onSelect={() => void signOut()}>
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
