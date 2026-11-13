import { CalendarCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { ehFeriado } from '@/lib/calendar';
import { formatDec1, formatInt } from '@/lib/format';
import { Delta } from '@/components/charts/Delta';
import type { Comparativo } from '../model/comparar';
import { ABREV_DIA, ddmm, rotuloMes } from '../model/datas';
import {
  FAIXAS_DO_MES,
  amplitudeFaixas,
  feriadosTrabalhadosNoMes,
  mediasPorDiaSemana,
  mediasPorFaixaDoMes,
  picoDiaSemana,
  produtosAfetadosPorCombinacao,
  serieDiaria,
  variacaoResumo,
} from '../model/derivados';
import type { ContextoPlanejamento } from '../model/types';
import { weekdayOf } from '@/lib/time';
import { ChartFrame, EIXO, Stat, TipBox, Variacao, nomeDiaMin, pctTxt } from './apresentacao';

/** Faixa de combinações: só aparece quando algum produto passou a sair em pedido misto. */
export function FaixaCombinacoes({ c }: { c: Comparativo }) {
  const afetados = produtosAfetadosPorCombinacao(c);
  if (!afetados.length) return null;
  return (
    <Notice
      title={`${afetados.length} ${afetados.length === 1 ? 'produto passou' : 'produtos passaram'} a sair em pedido misto`}
      className="border-accent-fill/40"
    >
      <p>
        Em {rotuloMes(c.chaveB)} surgiram <b>{c.qtdParesNovos} combinações de SKU</b> que quase não existiam em {rotuloMes(c.chaveA)}: kit, brinde ou
        compre junto no anúncio, que viram pedido misto na bancada. O crescimento desses itens não vem de demanda própria, vem de entrarem na caixa de outro
        produto.
      </p>
      <ul className="mt-2 grid gap-1">
        {afetados.map((p) => (
          <li key={p.produto}>
            <code className="font-mono text-sm">{p.produto}</code>: total <Variacao valor={p.variacao} />, mas a <b>venda avulsa</b> dele fez{' '}
            <Variacao valor={p.varSolo} /> ({formatDec1(p.soloA)} para {formatDec1(p.soloB)} por dia útil)
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-3">Para estoque conta o total, porque a peça sai da prateleira do mesmo jeito. Para decidir anúncio e compra, olhe a venda avulsa.</p>
    </Notice>
  );
}

export function CartoesComparativo({ c }: { c: Comparativo }) {
  const v = variacaoResumo(c);
  const feriadosTrab = feriadosTrabalhadosNoMes(c.uteisB);
  const A = rotuloMes(c.chaveA);
  const dif = (a: number, b: number) => (
    <Delta value={b - a} kind="absolute" tone="none" />
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Pedidos em dia útil"
          value={formatInt(c.somaB)}
          detail={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Delta value={v.varTotal} /> vs. {formatInt(c.somaA)} em {A}
            </span>
          }
        />
        <Stat
          label="Média por dia útil"
          value={formatInt(c.mediaB)}
          detail={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Delta value={v.varMedia} /> vs. {formatInt(c.mediaA)} em {A}
            </span>
          }
        />
        <Stat
          label="Dias úteis trabalhados"
          value={formatInt(c.uteisB.length)}
          detail={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {dif(c.uteisA.length, c.uteisB.length)} vs. {c.uteisA.length} em {A}
            </span>
          }
        />
        <Stat
          label="Maior dia"
          value={c.maiorB ? formatInt(c.maiorB.pedidos) : 'sem dado'}
          detail={c.maiorB ? `${ddmm(c.maiorB.dia)}, ${nomeDiaMin(c.maiorB.dia)}` : undefined}
        />
        <Stat
          label="Sábados trabalhados"
          value={formatInt(c.sabB.dias)}
          detail={`${c.sabB.dias ? `${formatInt(c.sabB.total)} pedidos` : 'nenhum'} · ${A}: ${formatInt(c.sabA.dias)}`}
        />
      </div>
      {v.diasUteisDiferem && (
        <p className="text-ink-2">
          <b className="font-semibold text-ink">Leia a média, não o total.</b> {rotuloMes(c.chaveB)} teve {c.uteisB.length} dias úteis contra{' '}
          {c.uteisA.length} de {A}
          {v.direcaoOposta
            ? `, por isso o total ${(v.varTotal ?? 0) < 0 ? 'caiu' : 'subiu'} (${pctTxt(v.varTotal)}) enquanto o dia médio ${
                (v.varMedia ?? 0) > 0 ? 'ficou mais pesado' : 'ficou mais leve'
              } (${pctTxt(v.varMedia)}). O trabalho por dia é o que define quanta gente a bancada precisa.`
            : '. A média por dia útil é a comparação justa entre meses de tamanhos diferentes.'}
        </p>
      )}
      {feriadosTrab.length > 0 && (
        <p className="flex items-center gap-1.5 text-ink-3">
          <CalendarCheck className="size-4" aria-hidden="true" />
          Os dias úteis incluem {feriadosTrab.map((x) => ddmm(x.dia)).join(', ')} (feriado trabalhado).
        </p>
      )}
    </div>
  );
}

/** Dois meses sobrepostos por dia do mês. */
export function GraficoDiario({ ctx, c }: { ctx: ContextoPlanejamento; c: Comparativo }) {
  const sa = serieDiaria(ctx.meses[c.chaveA]!, c.chaveA);
  const sb = serieDiaria(ctx.meses[c.chaveB]!, c.chaveB);
  const A = rotuloMes(c.chaveA);
  const B = rotuloMes(c.chaveB);
  const data = sa.map((a, i) => ({ dia: String(i + 1), a, b: sb[i] ?? null }));
  const resumo = `Pedidos por dia do mês, ${A} e ${B}`;
  const detalhe = (chave: string, d: string) => {
    const key = `${chave}-${d.padStart(2, '0')}`;
    const fer = ehFeriado(key);
    return `${ABREV_DIA[weekdayOf(key)] ?? ''}${fer ? `, ${fer.name}` : ''}`;
  };
  return (
    <Card>
      <CardHeader title="Pedidos por dia" description="Os dois meses sobrepostos, dia do mês a dia do mês: mostra início, meio e fim." />
      <CardBody>
        <ChartFrame
          summary={resumo}
          legend={[
            { label: A, swatch: 'dashed' },
            { label: B, swatch: 'bar' },
          ]}
          rows={{ head: ['Dia', A, B], body: data.map((d) => [d.dia, d.a ?? 'sem dia', d.b ?? 'sem dia']) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="dia" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={EIXO} interval={1} />
              <YAxis width={44} tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatInt} />
              <Tooltip
                isAnimationActive={false}
                content={(p) => {
                  const d = p.payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!p.active || !d) return null;
                  return (
                    <TipBox
                      title={`Dia ${d.dia}`}
                      lines={[
                        ...(d.a != null ? [{ label: `${A} (${detalhe(c.chaveA, d.dia)})`, value: formatInt(d.a) }] : []),
                        ...(d.b != null ? [{ label: `${B} (${detalhe(c.chaveB, d.dia)})`, value: formatInt(d.b) }] : []),
                      ]}
                    />
                  );
                }}
              />
              <Line dataKey="a" type="monotone" stroke="var(--chart-line)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="b" type="monotone" stroke="var(--chart-bar)" strokeWidth={2.5} dot={{ r: 2, fill: 'var(--chart-bar)', stroke: 'var(--chart-bar)' }} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </CardBody>
    </Card>
  );
}

function BarrasDuplas({ labels, a, b, nomeA, nomeB, resumo }: { labels: string[]; a: number[]; b: number[]; nomeA: string; nomeB: string; resumo: string }) {
  const data = labels.map((l, i) => ({ l, a: a[i] ?? 0, b: b[i] ?? 0 }));
  return (
    <ChartFrame
      summary={resumo}
      legend={[
        { label: nomeA, swatch: 'bar-muted' },
        { label: nomeB, swatch: 'bar' },
      ]}
      height={230}
      minWidth={360}
      rows={{ head: ['Faixa', nomeA, nomeB], body: data.map((d) => [d.l, formatInt(d.a), formatInt(d.b)]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="l" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={EIXO} />
          <YAxis width={44} tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatInt} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            isAnimationActive={false}
            content={(p) => {
              const d = p.payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!p.active || !d) return null;
              return (
                <TipBox
                  title={d.l}
                  lines={[
                    { label: nomeA, value: formatInt(d.a) },
                    { label: nomeB, value: formatInt(d.b) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="a" fill="var(--chart-bar-muted)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="b" fill="var(--chart-bar)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function GraficosConcentracao({ c }: { c: Comparativo }) {
  const A = rotuloMes(c.chaveA);
  const B = rotuloMes(c.chaveB);
  const dowA = mediasPorDiaSemana(c.uteisA);
  const dowB = mediasPorDiaSemana(c.uteisB);
  const pico = picoDiaSemana(dowB);
  const nomes = ['segunda', 'terça', 'quarta', 'quinta', 'sexta'];
  const womA = mediasPorFaixaDoMes(c.uteisA);
  const womB = mediasPorFaixaDoMes(c.uteisB);
  const ampA = amplitudeFaixas(womA);
  const ampB = amplitudeFaixas(womB);
  const faixas = FAIXAS_DO_MES.map(([i, f]) => `dias ${i} a ${f}`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Por dia da semana" description="Média de pedidos por dia útil." />
        <CardBody className="grid gap-3">
          <BarrasDuplas
            labels={['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']}
            a={dowA}
            b={dowB}
            nomeA={A}
            nomeB={B}
            resumo={`Média de pedidos por dia da semana, ${A} e ${B}`}
          />
          <p className="text-ink-2">
            Em {B}, <b className="font-semibold text-ink">{nomes[pico.indice]}-feira</b> é o pico: {pctTxt(pico.acima, 0)} acima do dia útil médio. É o acúmulo
            do fim de semana chegando junto.
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Por semana do mês" description="Média por dia útil dentro de cada faixa, não o total." />
        <CardBody className="grid gap-3">
          <BarrasDuplas labels={faixas} a={womA} b={womB} nomeA={A} nomeB={B} resumo={`Média de pedidos por faixa do mês, ${A} e ${B}`} />
          <p className="text-ink-2">
            A faixa 29 a 31 tem de 1 a 3 dias; pelo total ela apareceria sempre como a mais fraca.
            {ampA != null && ampB != null && (
              <>
                {' '}
                A diferença entre a faixa mais cheia e a mais vazia era de {pctTxt(ampA, 0)} em {A} e passou a {pctTxt(ampB, 0)} em {B}
                {ampB < ampA ? ': o mês ficou mais uniforme.' : ': o mês ficou mais irregular.'}
              </>
            )}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
