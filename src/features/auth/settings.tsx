/**
 * Seções de Configurações que pertencem à segurança:
 *   SecuritySettings  verificação em duas etapas, senha, sessões
 *   DevicesSettings   dispositivos pareados (TV, bancada, coletor) (dispositivos.gerenciar), atende ?acao=parear
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu, KeyRound, LogOut, Monitor, Plus, RefreshCw, ScanBarcode, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth';
import { ROLE_LABEL } from '@/auth/types';
import { DataTable } from '@/components/data';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Notice,
  SegmentedControl,
  toast,
} from '@/components/ui';
import { useNow, useWriteGate } from '@/data/hooks';
import { formatDayShort, formatRelative } from '@/lib/format';
import { dayKeyOf } from '@/lib/time';
import { useIntent } from '@/lib/url-state';
import {
  DEVICE_KIND_LABEL,
  devicesApi,
  DevicesUnavailableError,
  MAX_VALIDITY_DAYS,
  VALIDITY_OPTIONS,
  type DeviceKind,
  type PairedDevice,
} from './data/devices';
import { formatPairingCode, isValidPairingCode, normalizePairingCode } from './data/pairing';
import { MfaEnroll } from './MfaEnroll';
import { NewPasswordForm } from './ResetPasswordPage';

/* ====================================================================
   SEGURANÇA
   ==================================================================== */

export function SecuritySettings() {
  const { user, mode } = useAuth();
  if (!user) return null;
  const demo = mode === 'demo';
  return (
    <div className="grid gap-4">
      {demo ? (
        <Notice>
          No modo de demonstração não há senha nem autenticador. Os botões abaixo mostram como fica com o login real.
        </Notice>
      ) : null}
      <MfaCard demo={demo} />
      <PasswordCard demo={demo} />
      <SessionsCard />
    </div>
  );
}

function MfaCard({ demo }: { demo: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const { enrolled, required } = user.mfa;
  return (
    <Card>
      <CardHeader
        title="Verificação em duas etapas"
        description="Além da senha, um código de 6 números do aplicativo autenticador no celular."
        actions={
          enrolled ? (
            <Badge tone="ok" icon={<ShieldCheck />}>
              Ativa
            </Badge>
          ) : (
            <Badge tone={required ? 'warn' : 'neutral'}>Não cadastrada</Badge>
          )
        }
      />
      <CardBody className="grid gap-3">
        <p className="text-ink-2">
          {required
            ? `Obrigatória para o perfil ${ROLE_LABEL[user.role]}: sem ela, o painel não abre.`
            : 'Opcional para o seu perfil, e recomendada: protege a conta mesmo se a senha vazar.'}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button
            className="justify-self-start"
            icon={<Smartphone />}
            aria-disabled={demo || undefined}
            onClick={() => (demo ? toast('Disponível só com o login real.') : setOpen(true))}
          >
            {enrolled ? 'Trocar de celular' : 'Cadastrar autenticador'}
          </Button>
          {open ? (
            <DialogContent
              title={enrolled ? 'Trocar o autenticador' : 'Cadastrar o autenticador'}
              description={enrolled ? 'O celular antigo deixa de valer assim que o novo for confirmado.' : undefined}
              className="w-[min(600px,calc(100vw-32px))]"
            >
              <MfaEnroll
                submitLabel="Confirmar autenticador"
                onDone={() => {
                  setOpen(false);
                  toast.success('Verificação em duas etapas ativa');
                }}
              />
            </DialogContent>
          ) : null}
        </Dialog>
      </CardBody>
    </Card>
  );
}

function PasswordCard({ demo }: { demo: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Senha" description="Pelo menos 12 caracteres. Senhas que já vazaram em outros sites são recusadas." />
      <CardBody>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button
            icon={<KeyRound />}
            aria-disabled={demo || undefined}
            onClick={() => (demo ? toast('Disponível só com o login real.') : setOpen(true))}
          >
            Trocar senha
          </Button>
          {open ? (
            <DialogContent title="Trocar senha">
              <NewPasswordForm onDone={() => setOpen(false)} />
            </DialogContent>
          ) : null}
        </Dialog>
      </CardBody>
    </Card>
  );
}

function SessionsCard() {
  const { signOutEverywhere } = useAuth();
  return (
    <Card>
      <CardHeader title="Sessões" />
      <CardBody className="grid gap-3">
        <p className="text-ink-2">
          Por segurança, o painel sai sozinho depois de 30 minutos sem uso, e pede login de novo 12 horas depois de entrar.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="danger" icon={<LogOut />} className="justify-self-start">
              Sair de todos os dispositivos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent
            title="Sair de todos os dispositivos?"
            description="Encerra a sua sessão neste e em todos os outros aparelhos, inclusive este. Use se perdeu um celular ou computador, ou se acha que alguém usou a sua conta."
            confirmLabel="Sair de todos"
            danger
            onConfirm={() => {
              void signOutEverywhere?.().then((r) => {
                if (!r.ok) toast.error(r.error);
              });
            }}
          />
        </AlertDialog>
      </CardBody>
    </Card>
  );
}

/* ====================================================================
   DISPOSITIVOS
   ==================================================================== */

const devicesKey = (mode: string) => ['auth', 'dispositivos', mode] as const;

export function DevicesSettings() {
  const { mode } = useAuth();
  const api = useMemo(() => devicesApi(mode), [mode]);
  const gate = useWriteGate('dispositivos.gerenciar');
  const now = useNow(60_000);
  const [intent, clearIntent] = useIntent();
  const [pairOpen, setPairOpen] = useState(false);
  const query = useQuery({ queryKey: devicesKey(mode), queryFn: () => api.list(), retry: false });

  // ?acao=parear abre o diálogo uma vez (ajuste de estado no render, padrão do React
  // para estado derivado de prop) e o efeito só limpa a URL e explica a recusa.
  const [seenIntent, setSeenIntent] = useState(false);
  if (intent === 'parear' && !seenIntent) {
    setSeenIntent(true);
    if (gate.allowed) setPairOpen(true);
  } else if (intent !== 'parear' && seenIntent) {
    setSeenIntent(false);
  }
  useEffect(() => {
    if (intent !== 'parear') return;
    clearIntent();
    if (!gate.allowed && gate.message) toast(gate.message);
  }, [intent, clearIntent, gate.allowed, gate.message]);

  function openPair() {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    setPairOpen(true);
  }

  const unavailable = query.error instanceof DevicesUnavailableError;
  const devices = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => (a.status === b.status ? b.pairedAt.localeCompare(a.pairedAt) : a.status === 'ativo' ? -1 : 1)),
    [query.data],
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Dispositivos pareados"
          description="TVs, bancadas e coletor. Cada máquina tem credencial própria, só com o acesso que o tipo dela precisa, e validade. Revogar desliga na hora."
          actions={
            <Button variant="primary" icon={<Plus />} aria-disabled={!gate.allowed || undefined} onClick={openPair}>
              Parear dispositivo
            </Button>
          }
        />
        {query.isError && !unavailable ? (
          <CardBody>
            <Notice
              tone="crit"
              title="Não foi possível carregar os dispositivos"
              action={
                <Button size="sm" icon={<RefreshCw />} onClick={() => void query.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
            </Notice>
          </CardBody>
        ) : (
          <DevicesTable devices={devices} loading={query.isLoading} now={now} canManage={gate.allowed} gateMessage={gate.message} />
        )}
      </Card>
      <Dialog open={pairOpen} onOpenChange={setPairOpen}>
        {pairOpen ? <PairDialog onDone={() => setPairOpen(false)} /> : null}
      </Dialog>
    </div>
  );
}

const KIND_ICON: Record<DeviceKind, typeof Monitor> = { tv: Monitor, bancada: ScanBarcode, coletor: Cpu };

const REVOKE_TEXT: Record<DeviceKind, string> = {
  tv: 'A TV sai do Modo TV na hora e não consegue mais entrar. Para usar de novo, será preciso parear outra vez.',
  bancada:
    'A bancada para de registrar bipagens na hora e mostra "Bancada desconectada". Para usar de novo, será preciso parear outra vez.',
  coletor: 'O coletor para de gravar a coleta de dados na hora. Para usar de novo, será preciso parear outra vez.',
};

function expiryLabel(d: PairedDevice, now: Date): { text: string; tone: 'neutral' | 'warn' | 'crit' } {
  const ms = Date.parse(d.expiresAt) - now.getTime();
  if (ms <= 0) return { text: 'Vencido', tone: 'crit' };
  const days = Math.ceil(ms / 86_400_000);
  return { text: `até ${formatDayShort(dayKeyOf(d.expiresAt))}`, tone: days <= 7 ? 'warn' : 'neutral' };
}

function DevicesTable({
  devices,
  loading,
  now,
  canManage,
  gateMessage,
}: {
  devices: PairedDevice[];
  loading: boolean;
  now: Date;
  canManage: boolean;
  gateMessage: string | null;
}) {
  const columns = useMemo<ColumnDef<PairedDevice>[]>(
    () => [
      {
        id: 'nome',
        header: 'Dispositivo',
        accessorKey: 'name',
        cell: ({ row }) => {
          const Icon = KIND_ICON[row.original.kind];
          return (
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-ink-3" aria-hidden="true" />
              <span className="font-medium">{row.original.name}</span>
            </span>
          );
        },
      },
      { id: 'tipo', header: 'Tipo', accessorFn: (d) => DEVICE_KIND_LABEL[d.kind], cell: ({ row }) => DEVICE_KIND_LABEL[row.original.kind] },
      { id: 'local', header: 'Local', accessorFn: (d) => d.location ?? '', cell: ({ row }) => row.original.location ?? 'Sem local' },
      {
        id: 'pareada',
        header: 'Pareada em',
        accessorKey: 'pairedAt',
        cell: ({ row }) => (
          <span>
            <span className="tabular">{formatDayShort(dayKeyOf(row.original.pairedAt))}</span>
            {row.original.approvedBy ? <span className="block text-xs text-ink-3">por {row.original.approvedBy}</span> : null}
          </span>
        ),
      },
      {
        id: 'acesso',
        header: 'Último acesso',
        accessorFn: (d) => d.lastSeenAt ?? '',
        cell: ({ row }) => (row.original.lastSeenAt ? formatRelative(row.original.lastSeenAt, now) : 'Ainda não acessou'),
      },
      {
        id: 'status',
        header: 'Situação',
        accessorKey: 'status',
        cell: ({ row }) => <DeviceStatus device={row.original} now={now} />,
      },
      {
        id: 'acoes',
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'ativo' ? <RevokeButton device={row.original} canManage={canManage} gateMessage={gateMessage} /> : null,
        meta: { align: 'right' },
      },
    ],
    [now, canManage, gateMessage],
  );

  return (
    <DataTable
      aria-label="Dispositivos pareados"
      data={devices}
      columns={columns}
      getRowId={(d) => d.id}
      loading={loading}
      loadingRows={2}
      empty={
        <EmptyState
          icon={<Monitor />}
          title="Nenhum dispositivo pareado"
          description="A máquina mostra um código de 8 letras e números: a TV ao abrir o Modo TV; a bancada e o coletor no popup da extensão, em Parear. Clique em Parear dispositivo e digite o código aqui."
        />
      }
      renderMobileCard={(d) => (
        <div className="grid gap-1.5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{d.name}</span>
            <DeviceStatus device={d} now={now} />
          </div>
          <p className="text-ink-2">
            {DEVICE_KIND_LABEL[d.kind]}, {d.location ?? 'sem local'}
          </p>
          <p className="text-xs text-ink-3">
            Pareada em {formatDayShort(dayKeyOf(d.pairedAt))}
            {d.lastSeenAt ? `, último acesso ${formatRelative(d.lastSeenAt, now)}` : ', ainda não acessou'}
          </p>
          {d.status === 'ativo' ? (
            <div>
              <RevokeButton device={d} canManage={canManage} gateMessage={gateMessage} />
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

function DeviceStatus({ device, now }: { device: PairedDevice; now: Date }) {
  if (device.status === 'revogado') return <Badge>Revogado</Badge>;
  const exp = expiryLabel(device, now);
  if (exp.tone === 'crit') return <Badge tone="crit">Vencido</Badge>;
  return <Badge tone={exp.tone === 'warn' ? 'warn' : 'ok'}>Ativo, {exp.text}</Badge>;
}

function RevokeButton({ device, canManage, gateMessage }: { device: PairedDevice; canManage: boolean; gateMessage: string | null }) {
  const { mode } = useAuth();
  const api = useMemo(() => devicesApi(mode), [mode]);
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api.revoke(device.id),
    onSuccess: ({ undo }) => {
      void qc.invalidateQueries({ queryKey: devicesKey(mode) });
      if (undo) {
        toast.undoable(`${device.name} revogado`, async () => {
          await undo();
          await qc.invalidateQueries({ queryKey: devicesKey(mode) });
        });
      } else {
        toast.success(`${device.name} revogado. Para usar de novo, pareie outra vez.`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível revogar.'),
  });

  if (!canManage) {
    return (
      <Button size="sm" variant="danger" aria-disabled onClick={() => gateMessage && toast(gateMessage)}>
        Revogar
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="danger" loading={revoke.isPending}>
          Revogar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        title={`Revogar ${device.name}?`}
        description={REVOKE_TEXT[device.kind]}
        confirmLabel="Revogar"
        danger
        onConfirm={() => revoke.mutate()}
      />
    </AlertDialog>
  );
}

function PairDialog({ onDone }: { onDone: () => void }) {
  const { mode, user } = useAuth();
  const api = useMemo(() => devicesApi(mode), [mode]);
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [validity, setValidity] = useState<string>('90');
  const [errors, setErrors] = useState<{ code?: string; name?: string; form?: string }>({});

  const approve = useMutation({
    mutationFn: () =>
      api.approve({ code, name, location, validityDays: Number(validity), approvedBy: user?.name ?? 'Administrador' }),
    onSuccess: ({ undo }) => {
      void qc.invalidateQueries({ queryKey: devicesKey(mode) });
      const msg = `${name.trim()} pareado. A máquina conclui sozinha em alguns segundos.`;
      if (undo) {
        toast.undoable(msg, async () => {
          await undo();
          await qc.invalidateQueries({ queryKey: devicesKey(mode) });
        });
      } else {
        toast.success(msg);
      }
      onDone();
    },
    onError: (e) => setErrors({ form: e instanceof Error ? e.message : 'Não foi possível parear.' }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isValidPairingCode(normalizePairingCode(code))) next.code = 'São 8 letras e números, como aparecem na máquina.';
    if (!name.trim()) next.name = 'Dê um nome para reconhecer a máquina na lista.';
    setErrors(next);
    if (next.code || next.name) return;
    approve.mutate();
  }

  const normalized = normalizePairingCode(code);

  return (
    <DialogContent
      title="Parear dispositivo"
      description="A máquina mostra um código de 8 letras e números: a TV ao abrir o Modo TV; a bancada e o coletor no popup da extensão, em Parear. O tipo vem do próprio código."
      footer={
        <>
          <Button onClick={onDone}>Cancelar</Button>
          <Button type="submit" form="pair-tv-form" variant="primary" loading={approve.isPending}>
            Parear
          </Button>
        </>
      }
    >
      <form id="pair-tv-form" onSubmit={submit} className="grid gap-4" noValidate>
        {errors.form ? <Notice tone="crit">{errors.form}</Notice> : null}
        <Field label="Código mostrado na máquina" error={errors.code} required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="K7M4-QX9P"
            className="font-mono text-base uppercase tracking-[0.12em]"
            autoFocus
          />
        </Field>
        {normalized.length === 8 && isValidPairingCode(normalized) ? (
          <p className="-mt-2 text-xs text-ink-3">
            Confira com a máquina: <span className="font-mono text-ink">{formatPairingCode(normalized)}</span>
          </p>
        ) : null}
        <Field label="Nome" error={errors.name} required help="Como a máquina aparece nesta lista e no histórico.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="TV das bancadas, Bancada 3, Coletor" />
        </Field>
        <Field label="Local" help="Opcional. Ajuda a achar a máquina se precisar revogar.">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="Parede das bancadas" />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium" id="pair-validity">
            Validade
          </span>
          <SegmentedControl
            aria-label="Validade do pareamento"
            value={validity}
            onValueChange={setValidity}
            options={VALIDITY_OPTIONS.map((d) => ({ value: String(d), label: `${d} dias` }))}
          />
          <p className="text-xs text-ink-3">
            Depois disso a máquina sai sozinha e precisa ser pareada de novo. TV vale no máximo {MAX_VALIDITY_DAYS.tv} dias, mesmo
            escolhendo mais; bancada e coletor, {MAX_VALIDITY_DAYS.bancada}.
          </p>
        </div>
      </form>
    </DialogContent>
  );
}
