import { MoreHorizontal, Pencil, Plus, Power, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/toast';
import { useOperators, useOverview, useSetOperatorRegistration, useWriteGate } from '@/data/hooks';
import type { Operator, OperatorRow } from '@/data/types';
import { useIntent, useUrlEnum, useUrlString } from '@/lib/url-state';
import { OperatorDrawer } from './components/OperatorDrawer';
import { OperatorFormDialog } from './components/OperatorFormDialog';
import { OperatorsTable } from './components/OperatorsTable';
import { QueryError } from './components/QueryError';
import { type StatusFilter, filterOperatorRows, mergeOperatorRows } from './components/rows';

const STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativos', label: 'Ativos' },
  { value: 'ausentes', label: 'Ausentes' },
];
const STATUS_VALUES = ['todos', 'ativos', 'ausentes'] as const;

export default function OperatorsPage() {
  const operatorsQ = useOperators();
  const overviewQ = useOverview({ range: 'hoje', compare: 'dia-util-anterior' });
  const gate = useWriteGate('expedicao.operadores.gerenciar');
  const registration = useSetOperatorRegistration();

  const [query, setQuery] = useUrlString('q');
  const [status, setStatus] = useUrlEnum<StatusFilter>('status', STATUS_VALUES, 'todos');
  const [inactive, setInactive] = useUrlEnum('inativos', ['sim', 'nao'] as const, 'nao');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intent, clearIntent] = useIntent();
  const [formOpen, setFormOpen] = useState(intent === 'novo' && gate.allowed);
  const [editing, setEditing] = useState<Operator | undefined>();

  // Intenção ?acao=novo: abre o cadastro uma vez e limpa o parâmetro.
  useEffect(() => {
    if (intent !== 'novo') return;
    clearIntent();
    if (!gate.allowed) toast(gate.message ?? 'Seu perfil não permite cadastrar operadores.');
  }, [intent, clearIntent, gate.allowed, gate.message]);

  const operators = operatorsQ.data;
  const overview = overviewQ.data;
  const rows = useMemo(
    () => (operators ? mergeOperatorRows(operators, overview?.operators ?? [], overview?.globalGoal ?? null) : []),
    [operators, overview],
  );
  const filtered = useMemo(() => filterOperatorRows(rows, { query, status, showInactive: inactive === 'sim' }), [rows, query, status, inactive]);

  const guarded = (fn: () => void) => () => {
    if (!gate.allowed) {
      toast(gate.message ?? 'Seu perfil não permite gerenciar operadores.');
      return;
    }
    fn();
  };

  const rowActions = (row: OperatorRow) => {
    const op = operators?.find((o) => o.id === row.id);
    if (!op) return null;
    const inativo = op.registration === 'inativo';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" aria-label={`Ações de ${row.name}`}>
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={<Pencil />}
            onSelect={guarded(() => {
              setEditing(op);
              setFormOpen(true);
            })}
          >
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Power />}
            onSelect={guarded(() => {
              registration.mutate(
                { id: op.id, registration: inativo ? 'ativo' : 'inativo' },
                {
                  onSuccess: (r) => toast.undoable(inativo ? `${op.name} foi reativado.` : `${op.name} foi inativado.`, r.undo),
                  onError: (e) => toast.error(e.message),
                },
              );
            })}
          >
            {inativo ? 'Reativar' : 'Inativar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const loading = operatorsQ.isPending || overviewQ.isPending;
  const error = operatorsQ.isError || overviewQ.isError;

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 p-4 md:p-6">
      <PageHeader
        title="Operadores"
        breadcrumbs={[{ label: 'Expedição', to: '/expedicao' }, { label: 'Operadores' }]}
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            aria-disabled={!gate.allowed || undefined}
            onClick={guarded(() => {
              setEditing(undefined);
              setFormOpen(true);
            })}
          >
            Novo operador
          </Button>
        }
      />

      {error ? (
        <QueryError
          what="os operadores"
          onRetry={() => {
            void operatorsQ.refetch();
            void overviewQ.refetch();
          }}
        />
      ) : (
        <Card className="py-3">
          <OperatorsTable
            aria-label="Operadores cadastrados"
            rows={filtered}
            loading={loading}
            showStart
            storageKey="hope-operators-page-columns"
            exportName="operadores-cadastro"
            onOpen={(r) => setSelectedId(r.id)}
            rowActions={rowActions}
            toolbar={
              <>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                  <Input type="search" aria-label="Buscar por nome ou ID" placeholder="Buscar por nome ou ID" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <SegmentedControl aria-label="Filtrar por status" value={status} onValueChange={(v) => setStatus(v as StatusFilter)} options={STATUS_OPTIONS} />
                <label className="inline-flex items-center gap-2 text-ink-2">
                  <Switch checked={inactive === 'sim'} onCheckedChange={(c) => setInactive(c ? 'sim' : 'nao')} />
                  Mostrar inativos
                </label>
              </>
            }
            empty={
              rows.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Nenhum operador cadastrado"
                  description="Cadastre o primeiro operador com o ID que a extensão registra em cada bipe."
                  action={
                    <Button variant="primary" icon={<Plus />} aria-disabled={!gate.allowed || undefined} onClick={guarded(() => setFormOpen(true))}>
                      Novo operador
                    </Button>
                  }
                />
              ) : (
                <EmptyState title="Nenhum operador com esses filtros" description="Limpe a busca ou mostre os inativos." />
              )
            }
          />
        </Card>
      )}

      <OperatorDrawer operatorId={selectedId} onClose={() => setSelectedId(null)} />
      <OperatorFormDialog open={formOpen} onOpenChange={setFormOpen} operator={editing} allOperators={operators ?? []} />
    </div>
  );
}
