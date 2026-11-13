import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { RefreshCw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOperators, useSetIndividualGoals, type WriteGate } from '@/data/hooks';
import type { Operator } from '@/data/types';
import { DataTable } from '@/components/data';
import { Avatar, Button, Card, CardHeader, EmptyState, Input, Notice, toast } from '@/components/ui';
import { GOAL_MAX, GOAL_MIN, parseGoal } from './logic';

function GoalCell({ op, gate, ignored }: { op: Operator; gate: WriteGate; ignored: boolean }) {
  const mutation = useSetIndividualGoals();
  const [draft, setDraft] = useState(String(op.individualGoal));
  const [error, setError] = useState<string | undefined>();

  const commit = () => {
    if (draft === String(op.individualGoal)) return;
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      setDraft(String(op.individualGoal));
      return;
    }
    const r = parseGoal(draft);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(undefined);
    mutation.mutate(
      { operatorIds: [op.id], value: r.value },
      {
        onSuccess: (res) => toast.undoable(`Meta de ${op.name}: ${op.individualGoal} para ${r.value}/h.`, res.undo),
        onError: (e) => {
          setDraft(String(op.individualGoal));
          toast.error(e.message || 'Não foi possível salvar.');
        },
      },
    );
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          className={ignored ? 'w-20 text-ink-3' : 'w-20'}
          aria-label={`Meta individual de ${op.name}`}
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          value={draft}
          disabled={!gate.allowed}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(String(op.individualGoal));
              setError(undefined);
            }
          }}
        />
        <span className="text-ink-3">/h</span>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-crit">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function IndividualGoalsCard({ globalGoal, gate }: { globalGoal: number | null; gate: WriteGate }) {
  const operators = useOperators();
  const batch = useSetIndividualGoals();
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [batchValue, setBatchValue] = useState('');
  const [batchError, setBatchError] = useState<string | undefined>();

  const active = useMemo(() => (operators.data ?? []).filter((o) => o.registration === 'ativo'), [operators.data]);
  const ignored = globalGoal != null;

  const columns = useMemo<ColumnDef<Operator>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Operador',
        sortDescFirst: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Avatar name={row.original.name} />
            <b className="font-medium">{row.original.name}</b>
          </span>
        ),
      },
      {
        accessorKey: 'individualGoal',
        header: 'Meta individual',
        cell: ({ row }) => <GoalCell key={row.original.individualGoal} op={row.original} gate={gate} ignored={ignored} />,
      },
    ],
    [gate, ignored],
  );

  const applyBatch = (ids: string[]) => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    const r = parseGoal(batchValue);
    if (!r.ok) {
      setBatchError(r.error);
      return;
    }
    setBatchError(undefined);
    batch.mutate(
      { operatorIds: ids, value: r.value },
      {
        onSuccess: (res) => {
          toast.undoable(`Meta de ${ids.length} ${ids.length === 1 ? 'operador' : 'operadores'} definida em ${r.value}/h.`, res.undo);
          setSelection({});
          setBatchValue('');
        },
        onError: (e) => toast.error(e.message || 'Não foi possível salvar.'),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Metas individuais"
        description="Valem quando não há meta global. Selecione operadores para definir a mesma meta de uma vez."
      />
      {ignored ? (
        <div className="px-4 pb-3">
          <Notice title={`Meta global ativa: ${globalGoal}/h`}>Ignorada enquanto a meta global estiver ativa. Continua salva para quando ela sair.</Notice>
        </div>
      ) : null}
      {operators.isError ? (
        <EmptyState
          icon={<Users />}
          title="Não foi possível carregar os operadores"
          description="A leitura do banco falhou. Nada foi alterado."
          action={
            <Button size="sm" icon={<RefreshCw />} onClick={() => void operators.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <DataTable
          aria-label="Metas individuais dos operadores"
          data={active}
          columns={columns}
          getRowId={(o) => o.id}
          loading={operators.isPending}
          selectable
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          initialSorting={[{ id: 'name', desc: false }]}
          empty={
            <EmptyState
              icon={<Users />}
              title="Nenhum operador ativo"
              description="Cadastre operadores na tela Operadores. Eles aparecem aqui com a meta padrão de 35 pedidos por hora."
            />
          }
          footer={<span>{active.length} operadores ativos</span>}
          bulkActions={(rows) => (
            <>
              <Input
                className="w-24"
                aria-label="Meta para os selecionados"
                aria-invalid={batchError ? true : undefined}
                placeholder={`${GOAL_MIN} a ${GOAL_MAX}`}
                inputMode="numeric"
                value={batchValue}
                onChange={(e) => {
                  setBatchValue(e.target.value);
                  setBatchError(undefined);
                }}
              />
              <Button
                size="sm"
                variant="primary"
                loading={batch.isPending}
                aria-disabled={!gate.allowed || undefined}
                onClick={() => applyBatch(rows.map((r) => r.id))}
              >
                Aplicar a {rows.length}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
                Limpar seleção
              </Button>
              {batchError ? (
                <span role="alert" className="text-xs text-crit">
                  {batchError}
                </span>
              ) : null}
            </>
          )}
          renderMobileCard={(o) => (
            <div className="flex items-center gap-2">
              <Avatar name={o.name} />
              <b className="min-w-0 flex-1 truncate font-medium">{o.name}</b>
              <GoalCell key={o.individualGoal} op={o} gate={gate} ignored={ignored} />
            </div>
          )}
        />
      )}
    </Card>
  );
}
