import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODULES } from '@/app/modules';
import { useUiStore, type ThemePreference } from '@/app/ui-store';
import { useAuth } from '@/auth';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/auth/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  SegmentedControl,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-t border-line py-3 first:border-t-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function ProfileSection() {
  const { user } = useAuth();
  if (!user) return null;
  const modules = user.modules.map((id) => MODULES.find((m) => m.id === id)?.label ?? id);
  return (
    <Card>
      <CardHeader title="Perfil" description="Estes dados vêm da sua conta. Para mudar, fale com um administrador." />
      <CardBody>
        <dl>
          <Row label="Nome">{user.name}</Row>
          <Row label="E-mail">{user.email ?? 'Sem e-mail (dispositivo)'}</Row>
          <Row label="Papel">
            <span className="font-medium">{ROLE_LABEL[user.role]}</span>
            <span className="block text-ink-2">{ROLE_DESCRIPTION[user.role]}</span>
          </Row>
          <Row label="Módulos">{modules.length > 0 ? modules.join(', ') : 'Nenhum módulo liberado'}</Row>
          <Row label="Tipo">{user.kind === 'dispositivo' ? 'Dispositivo' : 'Pessoa'}</Row>
        </dl>
      </CardBody>
    </Card>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun; bg: string; fg: string; bar: string }[] = [
  { value: 'light', label: 'Claro', icon: Sun, bg: 'bg-[#f3f5f5]', fg: 'bg-[#ffffff]', bar: 'bg-[#cfd6d7]' },
  { value: 'dark', label: 'Escuro', icon: Moon, bg: 'bg-[#0e1213]', fg: 'bg-[#171d1f]', bar: 'bg-[#3a4548]' },
  { value: 'system', label: 'Sistema', icon: Monitor, bg: 'bg-[#f3f5f5]', fg: 'bg-[#171d1f]', bar: 'bg-[#8a9698]' },
];

export function AppearanceSection() {
  const { theme, setTheme, density, setDensity, tvTheme, setTvTheme } = useUiStore();
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Tema" description="Claro por padrão. O Modo TV tem tema próprio, abaixo." />
        <CardBody>
          <div role="radiogroup" aria-label="Tema" className="grid gap-3 sm:grid-cols-3">
            {THEMES.map((t) => {
              const selected = theme === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    'grid gap-2 rounded-md border p-2 text-left focus-visible:shadow-focus',
                    selected ? 'border-accent-fill bg-accent-soft' : 'border-line-strong bg-surface hover:bg-hover',
                  )}
                >
                  <span aria-hidden="true" className={cn('grid h-16 grid-cols-[28px_1fr] gap-1.5 rounded-sm p-1.5', t.bg)}>
                    <span className={cn('rounded-sm', t.fg)} />
                    <span className="grid content-start gap-1">
                      <span className={cn('h-1.5 w-2/3 rounded-sm', t.bar)} />
                      <span className={cn('h-5 rounded-sm', t.fg)} />
                    </span>
                  </span>
                  <span className="flex items-center gap-2 font-medium">
                    <t.icon className="size-4" aria-hidden="true" />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Densidade das tabelas" description="Compacta cabe mais linhas na tela." />
        <CardBody>
          <SegmentedControl
            aria-label="Densidade das tabelas"
            value={density}
            onValueChange={(v) => setDensity(v === 'compact' ? 'compact' : 'comfortable')}
            options={[
              { value: 'comfortable', label: 'Confortável' },
              { value: 'compact', label: 'Compacta' },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Tema do Modo TV" description="Vale só na tela da TV do galpão." />
        <CardBody>
          <SegmentedControl
            aria-label="Tema do Modo TV"
            value={tvTheme}
            onValueChange={(v) => setTvTheme(v === 'light' ? 'light' : 'dark')}
            options={[
              { value: 'dark', label: 'Escuro' },
              { value: 'light', label: 'Claro' },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

type DemoApi = typeof import('@/data/demo');

export function DemoSection() {
  const [api, setApi] = useState<DemoApi | null>(null);
  const [mode, setMode] = useState<'real' | 'fixo'>('real');
  const [time, setTime] = useState('09:30');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    void import('@/data/demo').then((m) => {
      if (!alive) return;
      setApi(m);
      const current = m.getDemoClock();
      if (current !== 'real') {
        setMode('fixo');
        setTime(current);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const apply = (nextMode: 'real' | 'fixo', nextTime: string) => {
    if (!api) return;
    if (nextMode === 'fixo' && !HHMM.test(nextTime)) {
      setError('Use o formato HH:MM, por exemplo 09:30.');
      return;
    }
    setError(undefined);
    api.setDemoClock(nextMode === 'real' ? 'real' : nextTime);
    toast.success(nextMode === 'real' ? 'Relógio em tempo real.' : `Relógio da demonstração parte de ${nextTime}.`);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Relógio da demonstração"
          description="Para apresentar o painel fora do expediente. O horário fixo é o ponto de partida: o relógio segue andando."
        />
        <CardBody className="grid gap-3">
          <SegmentedControl
            aria-label="Relógio da demonstração"
            value={mode}
            onValueChange={(v) => {
              const next = v === 'fixo' ? 'fixo' : 'real';
              setMode(next);
              if (next === 'real') apply('real', time);
            }}
            options={[
              { value: 'real', label: 'Tempo real' },
              { value: 'fixo', label: 'Horário fixo' },
            ]}
          />
          {mode === 'fixo' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Horário de partida" error={error} className="w-40">
                <Input value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" placeholder="HH:MM" className="font-mono" />
              </Field>
              <Button variant="primary" onClick={() => apply('fixo', time)} disabled={!api}>
                Aplicar
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Restaurar dados de exemplo" description="Apaga o que foi alterado na demonstração (metas, operadores, usuários) e recarrega a página." />
        <CardBody>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">Restaurar dados de exemplo</Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              title="Restaurar dados de exemplo?"
              description="As alterações feitas na demonstração serão perdidas. Os dados reais não são afetados."
              confirmLabel="Restaurar"
              danger
              onConfirm={() => {
                try {
                  localStorage.removeItem('hope-demo-state');
                } catch {
                  /* sem armazenamento: nada a apagar */
                }
                window.location.reload();
              }}
            />
          </AlertDialog>
        </CardBody>
      </Card>
    </div>
  );
}
