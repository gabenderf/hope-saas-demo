import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Gauge, PackageSearch, RefreshCw, Search, Target, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, KpiCard } from '@/components/data';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  InfoTip,
  Input,
  Notice,
  PageHeader,
  Skeleton,
  toast,
} from '@/components/ui';
import { useNow, useOverview, useWriteGate } from '@/data/hooks';
import { formatInt, formatRate, formatTime } from '@/lib/format';
import { useForecastCanWrite, useForecastData, useSetTeamSize } from './data';
import type { ForecastData } from './data';
import { deadlineOf, divergenceOf, rankSkus, runForecast, searchSkus, watchOf, type SkuRank } from './model/forecast-model';
import { readQueue } from './model/queue-guard';

export default function ForecastPage() {
  const query = useForecastData();
  const now = useNow();

  return (
    <div className="grid gap-4 p-4 sm:p-6">
      <PageHeader
        title="Previsão de expedição"
        meta="Horário de término, ritmo necessário e demanda de estoque do dia"
        actions={
          <Button icon={<RefreshCw />} onClick={() => void query.refetch()} loading={query.isFetching && !query.isLoading}>
            Recalcular
          </Button>
        }
      />
      {query.isLoading ? (
        <ForecastSkeleton />
      ) : query.isError || !query.data ? (
        <Card>
          <EmptyState
            title="Não foi possível carregar a Previsão"
            description="A leitura das tabelas da fila falhou. Tente de novo; se continuar, confira a conexão com o banco."
            action={<Button onClick={() => void query.refetch()}>Tentar de novo</Button>}
          />
        </Card>
      ) : !query.data.config ? (
        <Card>
          <EmptyState
            icon={<Target />}
            title="A configuração da Previsão ainda não existe"
            description="A tabela config_previsao está vazia. Rode o schema.sql do projeto previsao-expedicao no banco para criar a linha padrão."
          />
        </Card>
      ) : (
        <ForecastBody data={query.data} now={now} />
      )}
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando a Previsão">
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <KpiCard key={i} label="Carregando" value="" loading />
        ))}
      </div>
      <Card>
        <CardBody className="grid gap-2 pt-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function ForecastBody({ data, now }: { data: ForecastData; now: Date }) {
  const config = data.config!;
  const watch = watchOf(data.snapshots, now);
  const reading = readQueue(data.seenToday, data.snapshots, data.pending.length);
  const noData = watch.count === 0;
  const forecast = useMemo(() => runForecast(data, config, now), [data, config, now]);
  const overview = useOverview({ range: 'hoje', compare: 'dia-util-anterior' });
  const liveRate = overview.data?.kpis.ritmo.value ?? null;

  const initial = data.plan?.obrigatorios_inicial ?? null;
  const late = forecast.baldes.atrasado;
  const finish = forecast.termino_hoje_p50;
  const deadline = deadlineOf(data.day, config);
  const piso = config.piso_ritmo_necessario;
  const div = divergenceOf(data, forecast);

  return (
    <>
      <Vigia watch={watch} />
      {reading.refused && (
        <Notice tone="crit" title="Fila incompleta na leitura">
          {reading.truncated
            ? `${reading.seen == null ? 'Nenhuma contagem de pedidos' : `${formatInt(reading.seen)} pedidos lidos`} contra ${formatInt(reading.captured)} capturados pelo coletor.`
            : `${formatInt(reading.pending)} pendentes para ${formatInt(reading.seen ?? 0)} vistos no dia, o que não é possível.`}{' '}
          Os números abaixo estão subestimados. Não republique a meta.
        </Notice>
      )}

      <Card>
        <CardHeader title="Obrigatório de hoje" description="Atrasados e pedidos que vencem hoje." />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Pedidos obrigatórios"
              icon={<Target />}
              value={formatInt(forecast.obrigatorios)}
              info={{ definition: 'Atrasados mais os que vencem hoje, ainda pendentes na fila.', source: 'fila_pendente' }}
            />
            <KpiCard
              label="Término previsto"
              icon={<Clock />}
              value={noData ? 'sem dado' : finish ? formatTime(finish) : 'não fecha'}
              info={{
                definition: `Um horário só, no ritmo padrão de ${formatRate(config.ritmo_padrao)} por pessoa e ${config.equipe_padrao} pessoas. Fim do turno: ${formatTime(deadline)}.`,
                source: 'motor de previsão',
              }}
            />
            <KpiCard
              label="Ritmo necessário"
              icon={<Gauge />}
              value={noData ? 'sem dado' : formatRate(forecast.ritmo_necessario)}
              info={{
                definition: piso
                  ? `Por pessoa, para fechar o obrigatório até o fim do turno (mínimo ${formatRate(piso)}).`
                  : 'Por pessoa, para fechar o obrigatório até o fim do turno.',
                source: 'config_previsao',
              }}
            />
            <KpiCard
              label="Ritmo atual"
              icon={<Gauge />}
              value={liveRate == null ? 'sem dado' : formatRate(liveRate)}
              loading={overview.isLoading}
              info={{
                definition: 'O mesmo ritmo da equipe da Visão Geral, contado do acesso, pela média simples dos ritmos individuais.',
                source: 'Visão Geral',
              }}
            />
          </div>
          <p className="mt-3 text-ink-2">
            {[
              late > 0 ? `${formatInt(late)} ${late === 1 ? 'pedido atrasado' : 'pedidos atrasados'}` : 'atrasados mais os que vencem hoje',
              initial != null ? `eram ${formatInt(initial)} no início do dia` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {forecast.falta_capacidade && forecast.obrigatorios > 0 && (
            <Notice tone="warn" className="mt-3" title="O obrigatório não fecha até o fim do turno">
              No ritmo padrão com {config.equipe_padrao} pessoas sobrariam {formatInt(forecast.sobra_obrigatoria_no_fim)} pedidos. Veja a equipe usada no
              cálculo mais abaixo.
            </Notice>
          )}
          <DivergenceLine info={div} />
        </CardBody>
      </Card>

      <SkuDemand data={data} />

      <Card>
        <CardHeader title="Adiantando amanhã" description="O que sobrar de gente depois do obrigatório. Não é obrigação." />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Vencem amanhã" value={formatInt(forecast.baldes.amanha)} />
            <KpiCard label="Se zerar tudo" value={forecast.termino_tudo_p50 ? formatTime(forecast.termino_tudo_p50) : 'não fecha'} />
            <KpiCard label="Ritmo para zerar tudo" value={formatRate(forecast.ritmo_para_zerar_tudo)} />
            <KpiCard label="Sem prazo" value={formatInt(forecast.baldes.sem_prazo)} />
          </div>
        </CardBody>
      </Card>

      <TeamCard current={config.equipe_padrao} />
    </>
  );
}

function Vigia({ watch }: { watch: ReturnType<typeof watchOf> }) {
  if (watch.state === 'sem-coleta') {
    return (
      <Notice tone="crit" title="Sem coleta de dados hoje">
        Verifique a máquina do coletor. Os números abaixo não são de hoje.
      </Notice>
    );
  }
  if (watch.state === 'dia-parado') {
    return <p className="text-ink-3">Hoje não é dia de expedição. Não há coleta de dados esperada.</p>;
  }
  if (watch.state === 'aguardando') {
    return <p className="text-ink-3">Aguardando a primeira coleta de dados do dia.</p>;
  }
  const late = watch.minutesAgo != null && watch.minutesAgo > 90;
  return (
    <p className="tabular text-ink-3">
      Última coleta de dados às {watch.lastAt ? formatTime(watch.lastAt) : ''}
      {late && watch.minutesAgo != null ? `, há ${Math.round(watch.minutesAgo / 60)}h` : ''} · {watch.count} no dia
    </p>
  );
}

function DivergenceLine({ info }: { info: ReturnType<typeof divergenceOf> }) {
  if (info.kind === 'sem-meta') {
    return <p className="mt-3 text-ink-3">Nenhuma meta do dia definida ainda. Ela é congelada na primeira coleta de dados do dia.</p>;
  }
  const origin = `Meta do dia ${info.metaAt ? formatTime(info.metaAt) : ''}${info.frozenAt ? ` (congelada às ${formatTime(info.frozenAt)})` : ''}`;
  const hours = String(info.hours).replace('.', ',');
  const text =
    info.kind === 'nao-fecha'
      ? `${origin} · agora a previsão é não fechar no turno`
      : info.kind === 'em-linha'
        ? `${origin} · previsão agora ${info.liveAt ? formatTime(info.liveAt) : ''}, em linha`
        : info.kind === 'atraso'
          ? `${origin} · previsão agora ${info.liveAt ? formatTime(info.liveAt) : ''}, ${hours}h de atraso em relação à meta`
          : `${origin} · previsão agora ${info.liveAt ? formatTime(info.liveAt) : ''}, ${hours}h adiantado em relação à meta`;
  return <p className="tabular mt-3 text-ink-2">{text}</p>;
}

function SkuDemand({ data }: { data: ForecastData }) {
  const [term, setTerm] = useState('');
  const ranked = useMemo(() => rankSkus(data.skus), [data.skus]);
  const rows = useMemo(() => searchSkus(ranked, term), [ranked, term]);

  const columns = useMemo<ColumnDef<SkuRank>[]>(
    () => [
      { id: 'position', header: '#', enableSorting: false, accessorFn: (r) => r.position, cell: (c) => <span className="tabular text-ink-3">{c.row.original.position}</span> },
      { id: 'sku', header: 'SKU', enableSorting: false, accessorFn: (r) => r.sku, cell: (c) => <span className="font-mono">{c.row.original.sku}</span> },
      { id: 'orders', header: 'Pedidos', enableSorting: false, accessorFn: (r) => r.orders, meta: { align: 'right' }, cell: (c) => <b className="font-semibold">{formatInt(c.row.original.orders)}</b> },
      {
        id: 'pieces',
        header: () => (
          <span className="inline-flex items-center gap-1">
            Peças (total)
            <InfoTip
              label="Peças"
              definition="Aqui a peça multiplica o prefixo NX- do SKU e não divide por embalagem. Touca, atadura, luva e seringa aparecem infladas: 100X-TOU-DESC são 100 peças, mas um pacote lacrado. O Planejamento conta peça como embalagem e mostra números menores para os mesmos produtos."
              source="demanda_sku_dia"
            />
          </span>
        ),
        enableSorting: false,
        accessorFn: (r) => r.pieces,
        meta: { align: 'right' },
        cell: (c) => formatInt(c.row.original.pieces),
      },
      { id: 'today', header: 'Peças hoje', enableSorting: false, accessorFn: (r) => r.piecesToday, meta: { align: 'right' }, cell: (c) => dash(c.row.original.piecesToday) },
      { id: 'tomorrow', header: 'Peças amanhã', enableSorting: false, accessorFn: (r) => r.piecesTomorrow, meta: { align: 'right' }, cell: (c) => dash(c.row.original.piecesTomorrow) },
    ],
    [],
  );

  const noData = data.skus.length === 0;

  return (
    <Card>
      <CardHeader
        title="Demanda de estoque por SKU"
        description="Ranqueada por pedidos, não por peças. A contagem é do dia inteiro, inclusive o que já saiu da fila."
        actions={
          <div className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Buscar SKU"
              placeholder="Buscar SKU"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pl-7"
              disabled={noData}
            />
          </div>
        }
      />
      <DataTable
        aria-label="Demanda de estoque por SKU"
        data={rows}
        columns={columns}
        getRowId={(r) => r.sku}
        density="compact"
        renderMobileCard={(r) => (
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <span className="tabular text-ink-3">#{r.position}</span>
              <span className="font-mono">{r.sku}</span>
            </div>
            <div className="tabular text-ink-2">
              {formatInt(r.orders)} pedidos · {formatInt(r.pieces)} peças · hoje {dashText(r.piecesToday)} · amanhã {dashText(r.piecesTomorrow)}
            </div>
          </div>
        )}
        empty={
          noData ? (
            <EmptyState
              icon={<PackageSearch />}
              title="Sem demanda de estoque hoje"
              description="A lista aparece depois da primeira coleta de dados do dia, quando o coletor lê a fila do UpSeller."
            />
          ) : (
            <EmptyState icon={<Search />} title="Nenhum SKU encontrado" description={`Nada com "${term.trim()}" na fila de hoje.`} />
          )
        }
      />
    </Card>
  );
}

const dash = (n: number) => (n ? formatInt(n) : <span className="text-ink-3">sem pedidos</span>);
const dashText = (n: number) => (n ? formatInt(n) : 'sem pedidos');

function TeamCard({ current }: { current: number }) {
  const gate = useWriteGate('expedicao.previsao.configurar');
  const canWrite = useForecastCanWrite();
  const save = useSetTeamSize();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(current);
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;

  const blocked = !gate.allowed || !canWrite;
  const blockMessage = !gate.allowed ? gate.message : 'A Previsão só lê os dados nesta fase. Para mudar a equipe, use o dashboard atual.';

  function submit() {
    if (blocked) {
      toast(blockMessage ?? 'Você não pode alterar a equipe.');
      return;
    }
    if (!valid) return;
    save.mutate(parsed, {
      onSuccess: (r) => {
        setDraft(null);
        toast.undoable(`Equipe do cálculo: ${current} para ${parsed} pessoas. A meta já publicada hoje não muda, só a previsão viva.`, r.undo);
      },
      onError: () => toast.error('Não foi possível salvar a equipe.'),
    });
  }

  return (
    <Card>
      <CardHeader title="Equipe usada no cálculo" />
      <CardBody>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label="Pessoas na bancada"
            className="w-[140px]"
            error={draft !== null && !valid ? 'Informe um número de 1 a 20.' : undefined}
          >
            <Input type="number" inputMode="numeric" min={1} max={20} value={value} onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" icon={<Users />} loading={save.isPending} aria-disabled={blocked || undefined}>
            Salvar
          </Button>
        </form>
        {blocked && blockMessage && <p className="mt-2 text-ink-3">{blockMessage}</p>}
        <p className="mt-3 max-w-[70ch] text-ink-2">
          O padrão é 3, mesmo quando há mais gente na bancada: o erro cai para o lado seguro. Em dia de volume alto, suba para 4 ou 5 antes da primeira
          coleta de dados. A meta do dia é congelada nela e não se move sozinha depois.
        </p>
      </CardBody>
    </Card>
  );
}
