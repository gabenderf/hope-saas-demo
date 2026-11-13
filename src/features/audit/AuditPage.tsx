import { ChevronDown, ChevronRight, Download, History, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuditLog, useCapabilities, useToday } from '@/data/hooks';
import type { AuditEntry } from '@/data/types';
import { Avatar, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { useCan } from '@/auth';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDateTime, formatTime } from '@/lib/format';
import { useUrlEnum, useUrlString } from '@/lib/url-state';
import { ACTION_GROUP_LABEL, type ActionGroup, type PeriodKey, filterEntries, groupByDay, groupOfAction, uniqueActors } from './group';

const GROUPS = ['todos', 'metas', 'operadores', 'usuarios', 'dispositivos', 'previsao'] as const;
const PERIODS = ['tudo', 'hoje', '7d', '30d'] as const;
const PERIOD_LABEL: Record<PeriodKey, string> = { tudo: 'Todo o período', hoje: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias' };

export default function AuditPage() {
  const caps = useCapabilities();
  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 p-4 sm:p-6">
      <PageHeader title="Histórico de alterações" breadcrumbs={[{ label: 'Administração' }, { label: 'Histórico' }]} />
      {caps.audit ? (
        <AuditBody />
      ) : (
        <Card>
          <EmptyState
            icon={<History />}
            title="Ainda não há histórico com autor"
            description="O histórico com autor começa na fase da nuvem: hoje o banco não registra quem fez cada alteração."
          />
        </Card>
      )}
    </div>
  );
}

function AuditBody() {
  const query = useAuditLog({ limit: 500 });
  const today = useToday();
  const canExport = useCan('expedicao.exportar');
  const [group, setGroup] = useUrlEnum<(typeof GROUPS)[number]>('tipo', GROUPS, 'todos');
  const [period, setPeriod] = useUrlEnum<PeriodKey>('periodo', PERIODS, 'tudo');
  const [actorId, setActorId] = useUrlString('autor', 'todos');
  const [q, setQ] = useUrlString('busca', '');

  const all = useMemo(() => query.data ?? [], [query.data]);
  const actors = useMemo(() => uniqueActors(all), [all]);
  const filtered = useMemo(() => filterEntries(all, { group, actorId, period, query: q }, today), [all, group, actorId, period, q, today]);
  const days = useMemo(() => groupByDay(filtered, today), [filtered, today]);

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { header: 'Data e hora', value: (e) => formatDateTime(e.at) },
      { header: 'Autor', value: (e) => e.actor.name },
      { header: 'Tipo', value: (e) => { const g = groupOfAction(e.action); return g ? ACTION_GROUP_LABEL[g] : e.action === 'outro' ? 'Outro' : 'Desfazer'; } },
      { header: 'Alteração', value: (e) => e.summary },
      { header: 'Alvo', value: (e) => e.target?.label },
    ]);
    downloadCsv(`historico-${today}.csv`, csv);
  };

  return (
    <Card>
      <CardHeader
        title="Alterações"
        description="Quem mudou o quê e quando, das mais novas para as mais antigas."
        actions={
          canExport ? (
            <Button size="sm" icon={<Download />} onClick={exportCsv} disabled={filtered.length === 0}>
              Exportar CSV
            </Button>
          ) : null
        }
      />
      <div className="grid gap-2 border-b border-line px-4 pb-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input className="pl-8" aria-label="Buscar no histórico" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select
          aria-label="Tipo de ação"
          value={group}
          onValueChange={(v) => setGroup(v as (typeof GROUPS)[number])}
          options={[{ value: 'todos', label: 'Todos os tipos' }, ...(GROUPS.slice(1) as ActionGroup[]).map((g) => ({ value: g, label: ACTION_GROUP_LABEL[g] }))]}
        />
        <Select
          aria-label="Autor"
          value={actors.some((a) => a.id === actorId) ? actorId : 'todos'}
          onValueChange={setActorId}
          options={[{ value: 'todos', label: 'Todos os autores' }, ...actors.map((a) => ({ value: a.id, label: a.name }))]}
        />
        <Select
          aria-label="Período"
          value={period}
          onValueChange={(v) => setPeriod(v as PeriodKey)}
          options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />
      </div>

      {query.isPending ? (
        <div className="grid gap-2 p-4" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={<History />}
          title="Não foi possível carregar o histórico"
          description="A leitura falhou. Nada foi alterado."
          action={
            <Button size="sm" icon={<RefreshCw />} onClick={() => void query.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Nenhuma alteração registrada"
          description="Mudanças de metas, operadores, usuários e dispositivos aparecem aqui assim que alguém fizer a primeira."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search />} title="Nada com esses filtros" description="Tire algum filtro ou mude a busca para ver mais alterações." />
      ) : (
        <div>
          {days.map((d) => (
            <section key={d.day} aria-label={d.label}>
              <h3 className="sticky top-0 border-b border-line bg-sunk px-4 py-1.5 text-xs font-medium text-ink-2">{d.label}</h3>
              <ul className="divide-y divide-line">
                {d.entries.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function show(v: unknown): string {
  if (v == null) return 'sem valor';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = entry.before !== undefined || entry.after !== undefined;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="tabular w-12 pt-0.5 font-mono text-xs text-ink-3">{formatTime(entry.at)}</span>
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <Avatar name={entry.actor.name} size="sm" />
          <span className="min-w-0">
            <b className="font-medium">{entry.actor.name}</b> {entry.summary}
            {entry.target ? <span className="text-ink-3"> ({entry.target.label})</span> : null}
          </span>
        </span>
        {hasDetail ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Chevron />}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Ocultar' : 'Antes e depois'}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 grid gap-2 sm:ml-[60px] sm:grid-cols-2">
          <div className="rounded-md bg-sunk p-2.5">
            <p className="mb-1 text-xs text-ink-3">Antes</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs">{show(entry.before)}</pre>
          </div>
          <div className="rounded-md bg-sunk p-2.5">
            <p className="mb-1 text-xs text-ink-3">Depois</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs">{show(entry.after)}</pre>
          </div>
        </div>
      ) : null}
    </li>
  );
}
