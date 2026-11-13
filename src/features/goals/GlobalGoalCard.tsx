import { useEffect, useRef, useState } from 'react';
import { useAuditLog, useCapabilities, useNow, useSetGlobalGoal, type WriteGate } from '@/data/hooks';
import type { GeneralConfig } from '@/data/types';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, toast } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useIntent } from '@/lib/url-state';
import { GOAL_MAX, GOAL_MIN, lastGlobalGoalChange, parseGoal } from './logic';

/** Quem mudou e quando. Só monta com histórico disponível (senão cai no updatedAt). */
function ChangedBy({ config }: { config: GeneralConfig }) {
  const audit = useAuditLog({ limit: 100 });
  const now = useNow();
  const last = audit.data ? lastGlobalGoalChange(audit.data) : null;
  if (last) {
    return (
      <p className="text-xs text-ink-3">
        {last.actor.name} {last.summary}, {formatRelative(last.at, now)}.
      </p>
    );
  }
  return <UpdatedAt config={config} />;
}

function UpdatedAt({ config }: { config: GeneralConfig }) {
  if (!config.updatedAt) return <p className="text-xs text-ink-3">Sem alteração registrada.</p>;
  return <p className="text-xs text-ink-3">Última alteração em {formatDateTime(config.updatedAt)}. O banco não guarda quem fez.</p>;
}

export function GlobalGoalCard({ config, gate }: { config: GeneralConfig; gate: WriteGate }) {
  const caps = useCapabilities();
  const mutation = useSetGlobalGoal();
  const [draft, setDraft] = useState<string>(config.globalGoal != null ? String(config.globalGoal) : '');
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [intent, clearIntent] = useIntent();

  useEffect(() => {
    if (intent === 'meta-global') {
      inputRef.current?.focus();
      inputRef.current?.select();
      clearIntent();
    }
  }, [intent, clearIntent]);

  const active = config.globalGoal != null;

  const save = (value: number | null) => {
    if (!gate.allowed) {
      if (gate.message) toast(gate.message);
      return;
    }
    mutation.mutate(
      { value },
      {
        onSuccess: (r) =>
          toast.undoable(value == null ? 'Meta global removida. As metas individuais voltam a valer.' : `Meta global definida em ${value}/h.`, r.undo),
        onError: (e) => toast.error(e.message || 'Não foi possível salvar a meta.'),
      },
    );
  };

  const apply = () => {
    const r = parseGoal(draft);
    if (!r.ok) {
      setError(r.error);
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    save(r.value);
  };

  return (
    <Card>
      <CardHeader title="Meta global do dia" description="Vale para todos os operadores enquanto estiver preenchida." />
      <CardBody className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
        <div className="grid content-start gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="tabular text-xl font-semibold">{active ? config.globalGoal : 'Sem meta'}</span>
            {active ? <span className="text-ink-3">pedidos/h</span> : null}
          </div>
          <div>
            <Badge tone={active ? 'accent' : 'neutral'}>{active ? 'Ativa' : 'Sem meta global'}</Badge>
          </div>
          {caps.audit ? <ChangedBy config={config} /> : <UpdatedAt config={config} />}
        </div>

        <form
          className="grid content-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="Meta por hora"
              help={`Inteiro de ${GOAL_MIN} a ${GOAL_MAX}.`}
              error={error}
              className="w-40"
            >
              <Input
                ref={inputRef}
                inputMode="numeric"
                value={draft}
                disabled={!gate.allowed}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(undefined);
                }}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              aria-disabled={!gate.allowed || undefined}
              onClick={(e) => {
                if (!gate.allowed) {
                  e.preventDefault();
                  if (gate.message) toast(gate.message);
                }
              }}
            >
              Aplicar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!active || mutation.isPending}
              aria-disabled={!gate.allowed || undefined}
              onClick={() => save(null)}
            >
              Remover
            </Button>
          </div>
          <p className="max-w-prose text-xs text-ink-3">
            Quando preenchida, a meta global sobrepõe a individual de todos, sem apagá-la: ao remover, cada operador volta à sua meta. A extensão
            do UpSeller busca esse valor a cada 60 segundos, então a mudança pode levar até 1 minuto para chegar às bancadas.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
