import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth';
import { ROLE_LABEL, type Role } from '@/auth/types';
import {
  useCapabilities,
  useNow,
  usePanelUsers,
  useResendPanelUserInvite,
  useSetPanelUserRole,
  useSetPanelUserStatus,
  useWriteGate,
  type WriteGate,
} from '@/data/hooks';
import type { PanelUser } from '@/data/types';
import { DataTable } from '@/components/data';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, Select, toast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useIntent } from '@/lib/url-state';
import { InviteDialog } from './InviteDialog';
import { STATUS_LABEL } from './labels';
import { PermissionMatrix } from './PermissionMatrix';
import { deactivateBlock, roleChangeBlock, type ProtectionContext } from './rules';

/** Sem 'tv': TV entra só por pareamento (Configurações > Dispositivos). Pessoa com papel TV fica sem acesso. */
const ROLES: Role[] = ['admin', 'lideranca', 'leitura'];
const STATUS_TONE = { ativo: 'ok', convidado: 'accent', desativado: 'neutral' } as const;

export default function UsersPage() {
  const caps = useCapabilities();
  const gate = useWriteGate('usuarios.gerenciar');
  const users = usePanelUsers();
  const { user: me } = useAuth();
  const now = useNow();
  const setRole = useSetPanelUserRole();
  const setStatus = useSetPanelUserStatus();
  const resend = useResendPanelUserInvite();
  const [intent, clearIntent] = useIntent();
  const canManage = caps.userManagement;
  const [inviteOpen, setInviteOpen] = useState(intent === 'convidar' && canManage);

  useEffect(() => {
    if (intent === 'convidar') clearIntent();
  }, [intent, clearIntent]);

  const ctx: ProtectionContext = useMemo(
    () => ({ users: users.data ?? [], self: me ? { id: me.id, email: me.email } : null }),
    [users.data, me],
  );

  const changeRole = (u: PanelUser, role: Role) => {
    if (role === u.role) return;
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    setRole.mutate(
      { id: u.id, role },
      {
        onSuccess: (r) => toast.undoable(`${u.name} agora é ${ROLE_LABEL[role]}.`, r.undo),
        onError: (e) => toast.error(e.message || 'Não foi possível mudar o perfil.'),
      },
    );
  };

  const toggleStatus = (u: PanelUser) => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    const next = u.status === 'desativado' ? 'ativo' : 'desativado';
    setStatus.mutate(
      { id: u.id, status: next },
      {
        onSuccess: (r) => toast.undoable(next === 'ativo' ? `${u.name} reativado.` : `${u.name} desativado.`, r.undo),
        onError: (e) => toast.error(e.message || 'Não foi possível alterar o acesso.'),
      },
    );
  };

  const resendInvite = (u: PanelUser) => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    // Um envio por vez: a mutação é uma só para a tabela inteira, e um segundo clique durante o
    // envio faria o primeiro perder o aviso e o estado "Enviando..." (e um reenvio duplo mata o link).
    if (resend.isPending) {
      toast('Espere terminar o envio em andamento.');
      return;
    }
    resend.mutate(
      { id: u.id },
      {
        onSuccess: () => toast.success(`Convite reenviado para ${u.email ?? u.name}. O link anterior deixa de valer.`),
        onError: (e) => toast.error(e.message || 'Não foi possível reenviar o convite.'),
      },
    );
  };
  const resendingId = resend.isPending ? resend.variables?.id : undefined;

  const columns = useMemo<ColumnDef<PanelUser>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nome',
        sortDescFirst: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Avatar name={row.original.name} />
            <span className="grid min-w-0">
              <b className="truncate font-medium">{row.original.name}</b>
              <span className="truncate text-xs text-ink-3">{row.original.email ?? row.original.username ?? 'sem e-mail'}</span>
            </span>
          </span>
        ),
      },
      {
        id: 'role',
        accessorFn: (u) => ROLE_LABEL[u.role],
        header: 'Perfil',
        cell: ({ row }) => (
          <RoleControl user={row.original} ctx={ctx} canManage={canManage} gate={gate} onChange={changeRole} />
        ),
      },
      {
        accessorKey: 'status',
        header: 'Situação',
        cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>,
      },
      {
        accessorKey: 'lastSignInAt',
        header: 'Último acesso',
        cell: ({ row }) => (
          <span className="text-ink-2">{row.original.lastSignInAt ? formatRelative(row.original.lastSignInAt, now) : 'nunca entrou'}</span>
        ),
      },
      {
        accessorKey: 'mfaEnrolled',
        header: 'Verificação em 2 etapas',
        cell: ({ row }) => <span>{row.original.mfaEnrolled ? 'Sim' : 'Não'}</span>,
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Ações</span>,
              enableSorting: false,
              cell: ({ row }: { row: { original: PanelUser } }) => (
                <StatusControl
                  user={row.original}
                  ctx={ctx}
                  gate={gate}
                  onToggle={toggleStatus}
                  onResend={resendInvite}
                  resending={resendingId === row.original.id}
                />
              ),
            } satisfies ColumnDef<PanelUser>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, canManage, gate, now, resendingId],
  );

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 p-4 sm:p-6">
      <PageHeader
        title="Usuários e perfis"
        breadcrumbs={[{ label: 'Administração' }, { label: 'Usuários e perfis' }]}
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<UserPlus />}
              aria-disabled={!gate.allowed || undefined}
              onClick={() => (gate.allowed ? setInviteOpen(true) : gate.message && toast(gate.message))}
            >
              Convidar
            </Button>
          ) : null
        }
      />

      {!canManage ? (
        <Notice title="Somente consulta">
          A gestão de usuários passa para o Supabase Auth na fase da nuvem. Hoje os usuários vêm da tabela antiga, só para consulta.
        </Notice>
      ) : null}

      <Card>
        <CardHeader title="Usuários" description="Quem acessa o painel e com que perfil." />
        {users.isError ? (
          <EmptyState
            icon={<Users />}
            title="Não foi possível carregar os usuários"
            description="A leitura do banco falhou. Nada foi alterado."
            action={
              <Button size="sm" icon={<RefreshCw />} onClick={() => void users.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        ) : (
          <DataTable
            aria-label="Usuários do painel"
            data={users.data ?? []}
            columns={columns}
            getRowId={(u) => u.id}
            loading={users.isPending}
            initialSorting={[{ id: 'name', desc: false }]}
            empty={
              <EmptyState
                icon={<Users />}
                title="Nenhum usuário"
                description={canManage ? 'Convide a primeira pessoa para dar acesso ao painel.' : 'Os usuários da tabela antiga aparecem aqui quando existirem.'}
              />
            }
            footer={<span>{users.data?.length ?? 0} usuários</span>}
            renderMobileCard={(u) => (
              <div className="grid gap-2">
                <span className="flex items-center gap-2">
                  <Avatar name={u.name} />
                  <span className="grid min-w-0 flex-1">
                    <b className="truncate font-medium">{u.name}</b>
                    <span className="truncate text-xs text-ink-3">{u.email ?? u.username ?? 'sem e-mail'}</span>
                  </span>
                  <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                </span>
                <RoleControl user={u} ctx={ctx} canManage={canManage} gate={gate} onChange={changeRole} />
                <span className="text-xs text-ink-3">
                  {u.lastSignInAt ? `Último acesso ${formatRelative(u.lastSignInAt, now)}` : 'Nunca entrou'} · Verificação em 2 etapas:{' '}
                  {u.mfaEnrolled ? 'sim' : 'não'}
                </span>
                {canManage ? (
                  <StatusControl
                    user={u}
                    ctx={ctx}
                    gate={gate}
                    onToggle={toggleStatus}
                    onResend={resendInvite}
                    resending={resendingId === u.id}
                  />
                ) : null}
              </div>
            )}
          />
        )}
      </Card>

      <PermissionMatrix />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} gate={gate} />
    </div>
  );
}

function RoleControl({
  user,
  ctx,
  canManage,
  gate,
  onChange,
}: {
  user: PanelUser;
  ctx: ProtectionContext;
  canManage: boolean;
  gate: WriteGate;
  onChange: (u: PanelUser, role: Role) => void;
}) {
  if (!canManage) return <Badge>{ROLE_LABEL[user.role]}</Badge>;
  const block = roleChangeBlock(user, ctx);
  if (block) {
    return (
      <span className="grid gap-0.5">
        <Badge className="w-fit">{ROLE_LABEL[user.role]}</Badge>
        <span className="max-w-[260px] text-xs text-ink-3">{block}</span>
      </span>
    );
  }
  return (
    <Select
      aria-label={`Perfil de ${user.name}`}
      value={user.role}
      disabled={!gate.allowed}
      onValueChange={(r) => onChange(user, r as Role)}
      options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
      className="w-44"
    />
  );
}

function StatusControl({
  user,
  ctx,
  gate,
  onToggle,
  onResend,
  resending,
}: {
  user: PanelUser;
  ctx: ProtectionContext;
  gate: WriteGate;
  onToggle: (u: PanelUser) => void;
  onResend: (u: PanelUser) => void;
  resending: boolean;
}) {
  const block = deactivateBlock(user, ctx);
  const reactivate = user.status === 'desativado';
  return (
    <span className="grid justify-items-end gap-0.5">
      <span className="flex flex-wrap justify-end gap-2">
        {user.status === 'convidado' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={resending}
            aria-disabled={!gate.allowed || undefined}
            onClick={() => onResend(user)}
          >
            {resending ? 'Enviando...' : 'Reenviar convite'}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={reactivate ? 'secondary' : 'danger'}
          aria-disabled={block || !gate.allowed ? true : undefined}
          onClick={() => {
            if (block) {
              toast(block);
              return;
            }
            onToggle(user);
          }}
        >
          {reactivate ? 'Reativar' : 'Desativar'}
        </Button>
      </span>
      {block ? <span className="max-w-[220px] text-right text-xs text-ink-3">{block}</span> : null}
    </span>
  );
}
