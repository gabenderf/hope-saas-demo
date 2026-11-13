import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth, useCan } from '@/auth';
import type { Permission } from '@/auth/types';
import { EmptyState, PageHeader } from '@/components/ui';
import { useDataMode } from '@/data/hooks';
import { DevicesSettings, SecuritySettings } from '@/features/auth/settings';
import { NotificationPreferences } from '@/features/notifications';
import { cn } from '@/lib/cn';
import { AppearanceSection, DemoSection, ProfileSection } from './sections';

interface Section {
  id: string;
  label: string;
  permission?: Permission;
  demoOnly?: boolean;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'perfil', label: 'Perfil', render: () => <ProfileSection /> },
  { id: 'aparencia', label: 'Aparência', render: () => <AppearanceSection /> },
  { id: 'notificacoes', label: 'Notificações', render: () => <NotificationPreferences /> },
  { id: 'seguranca', label: 'Segurança', render: () => <SecuritySettings /> },
  { id: 'dispositivos', label: 'Dispositivos', permission: 'dispositivos.gerenciar', render: () => <DevicesSettings /> },
  { id: 'demonstracao', label: 'Demonstração', demoOnly: true, render: () => <DemoSection /> },
];

function useVisibleSections(): Section[] {
  const mode = useDataMode();
  const canDevices = useCan('dispositivos.gerenciar');
  return SECTIONS.filter((s) => {
    if (s.demoOnly && mode !== 'demo') return false;
    if (s.permission === 'dispositivos.gerenciar' && !canDevices) return false;
    return true;
  });
}

export default function SettingsPage() {
  const { secao } = useParams();
  const { user } = useAuth();
  const sections = useVisibleSections();
  const current = sections.find((s) => s.id === secao);

  if (!secao) return <Navigate to="/configuracoes/perfil" replace />;
  if (!user) return null;

  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
        <nav aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
          <ul className="flex gap-1 md:grid">
            {sections.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/configuracoes/${s.id}`}
                  aria-current={s.id === secao ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center whitespace-nowrap rounded-md px-2.5 text-ink-2 hover:bg-hover hover:text-ink focus-visible:shadow-focus',
                    'aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent',
                  )}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-[760px]">
          {current ? (
            current.render()
          ) : (
            <EmptyState
              title="Esta seção não está disponível"
              description={
                secao === 'dispositivos'
                  ? 'Dispositivos exigem o perfil Administrador.'
                  : 'Ela não existe ou não se aplica ao seu perfil e ao modo de dados atual.'
              }
              action={
                <Link to="/configuracoes/perfil" className="font-medium text-accent underline underline-offset-2">
                  Voltar para o perfil
                </Link>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
