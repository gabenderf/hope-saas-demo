import { CalendarCheck, CalendarX, OctagonAlert, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tooltip as Dica } from '@/components/ui/Tooltip';
import { formatDec1, formatInt } from '@/lib/format';
import { addDays } from '@/lib/time';
import { cn } from '@/lib/cn';
import type { Comparativo } from '../model/comparar';
import { ddmm, rotuloMes } from '../model/datas';
import {
  type ItemAgenda,
  agendaDeDecisoes,
  backtestMostraSemEventos,
  destaquesProjecao,
  produtosEmAlta,
  produtosEmQueda,
  semanasComMedia,
} from '../model/derivados';
import { ABREV_DIA } from '../model/datas';
import type { Projecao } from '../model/projecao';
import { ChartFrame, EIXO, Stat, TipBox, Variacao, nomeDiaMin, pctTxt, sinalDec1 } from './apresentacao';

function CartoesExpectativa({ pr, c }: { pr: Projecao; c: Comparativo }) {
  const d = destaquesProjecao(pr);
  const varMes = c.somaB ? (pr.totalDemanda / c.somaB - 1) * 100 : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Demanda projetada"
        value={formatInt(pr.totalDemanda)}
        detail={
          <>
            {pr.linhas.length} dias úteis · {rotuloMes(c.chaveB)} fez {formatInt(c.somaB)} (<Variacao valor={varMes} />)
          </>
        }
      />
      <Stat
        label="Dia mais pesado"
        value={d.diaMaisPesado ? formatInt(d.diaMaisPesado.demanda) : 'sem dado'}
        tone={d.diaMaisPesado?.estoura ? 'warn' : undefined}
        detail={d.diaMaisPesado ? `${ddmm(d.diaMaisPesado.dia)}, ${nomeDiaMin(d.diaMaisPesado.dia)}` : undefined}
      />
      <Stat
        label="Semana mais cheia"
        value={d.semanaMaisCheia ? formatInt(d.semanaMaisCheia.demanda) : 'sem dado'}
        detail={d.semanaMaisCheia ? `semana de ${ddmm(d.semanaMaisCheia.inicio)} · ${d.semanaMaisCheia.dias} dias úteis` : undefined}
      />
      <Stat
        label="Dias acima do teto"
        value={formatInt(d.estouram.length)}
        tone={d.estouram.length ? 'warn' : 'ok'}
        detail={pr.teto.teto && pr.teto.quando ? `teto medido: ${formatInt(pr.teto.teto)} em ${ddmm(pr.teto.quando)}` : 'sem teto medido'}
      />
    </div>
  );
}

function GraficoProjecao({ pr }: { pr: Projecao }) {
  // Só dias FECHADOS no realizado: o dia de hoje está pela metade e desenharia uma queda que não existe.
  const data = pr.linhas.map((l) => ({
    rotulo: ddmm(l.dia),
    dia: l.dia,
    demanda: Math.round(l.demanda),
    estoura: l.estoura,
    transbordo: l.transbordo,
    realizado: l.passado && l.realizado ? l.realizado : null,
  }));
  const temReal = data.some((d) => d.realizado != null);
  return (
    <ChartFrame
      summary={`Demanda projetada por dia útil em ${rotuloMes(pr.chave)}, com o teto de capacidade medido`}
      legend={[
        { label: 'Demanda projetada (carga do dia)', swatch: 'bar' },
        { label: 'Acima do teto', swatch: 'warn' },
        ...(temReal ? [{ label: 'Realizado', swatch: 'line' as const }] : []),
        ...(pr.teto.teto ? [{ label: `Teto medido (${formatInt(pr.teto.teto)})`, swatch: 'neutral' as const }] : []),
      ]}
      height={280}
      minWidth={640}
      rows={{ head: ['Dia', 'Demanda', 'Realizado'], body: data.map((d) => [d.rotulo, d.demanda, d.realizado ?? 'sem dado']) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={EIXO} interval="preserveStartEnd" />
          <YAxis width={44} tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatInt} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            isAnimationActive={false}
            content={(p) => {
              const d = p.payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!p.active || !d) return null;
              return (
                <TipBox
                  title={`${d.rotulo}, ${nomeDiaMin(d.dia)}`}
                  lines={[
                    { label: 'Demanda', value: formatInt(d.demanda) },
                    ...(d.realizado != null ? [{ label: 'Realizado', value: formatInt(d.realizado) }] : []),
                    ...(d.estoura ? [{ label: 'Transborda', value: `~${formatInt(d.transbordo)}` }] : []),
                  ]}
                />
              );
            }}
          />
          {pr.teto.teto > 0 && <ReferenceLine y={pr.teto.teto} stroke="var(--chart-neutral)" strokeWidth={2} strokeDasharray="6 4" ifOverflow="extendDomain" />}
          <Bar dataKey="demanda" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.dia} fill={d.estoura ? 'var(--warn)' : 'var(--chart-bar)'} />
            ))}
          </Bar>
          {temReal && <Line dataKey="realizado" type="monotone" stroke="var(--chart-line)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-line)' }} isAnimationActive={false} connectNulls={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function Semanas({ pr }: { pr: Projecao }) {
  const semanas = semanasComMedia(pr.semanas);
  if (!semanas.length) return null;
  return (
    <section aria-labelledby="plan-semanas" className="grid gap-2">
      <h3 id="plan-semanas" className="text-md">
        Como cada semana deve chegar
      </h3>
      <ul className="grid gap-2">
        {semanas.map((s) => (
          <li key={s.inicio} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[110px_64px_1fr_84px_92px_20px]">
            <span className="tabular text-ink-2">
              {ddmm(s.inicio)} a {ddmm(addDays(s.inicio, 6))}
            </span>
            <span className="tabular text-ink-3 sm:order-none">
              {s.dias} {s.dias === 1 ? 'dia' : 'dias'}
            </span>
            <span className="col-span-3 h-4 overflow-hidden rounded-sm bg-sunk sm:col-span-1" aria-hidden="true">
              <span
                className={cn('block h-full rounded-sm', s.estoura ? 'bg-warn' : s.maisCheia ? 'bg-accent-fill' : 'bg-chart-bar')}
                style={{ width: `${s.largura.toFixed(1)}%`, opacity: 0.8 }}
              />
            </span>
            <span className="tabular text-right font-semibold">{formatInt(s.demanda)}</span>
            <span className="tabular text-right text-ink-3">{formatInt(s.media)} por dia</span>
            <span className="text-warn">
              {s.estoura > 0 && (
                <span role="img" aria-label={`${s.estoura} dia(s) acima do teto`}>
                  <OctagonAlert className="size-4" aria-hidden="true" />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-ink-3">
        A barra é a média por dia útil, não o total: é ela que diz o quanto a bancada aperta. Uma semana curta pode ter total baixo e ser a mais pesada do mês.
      </p>
    </section>
  );
}

function ItemDaAgenda({ item, pr }: { item: ItemAgenda; pr: Projecao }) {
  const caixa = (icone: ReactNode, titulo: string, corpo: ReactNode) => (
    <li className="flex items-start gap-3 rounded-md border border-line bg-sunk px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-ink-2" aria-hidden="true">
        {icone}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">
          {ddmm(item.data)} · {titulo}
        </p>
        <div className="mt-0.5 text-ink-2">{corpo}</div>
      </div>
    </li>
  );

  if (item.tipo === 'feriado-trabalhado') {
    const f = item.feriado;
    return caixa(
      <CalendarCheck className="size-4 text-ok" />,
      `${f.nome}, feriado trabalhado`,
      f.passado ? (
        <p>
          A equipe trabalhou o feriado{item.realizado ? ` (${formatInt(item.realizado)} pedidos)` : ''}. Entra na conta como dia útil comum, sem transferência
          para o dia seguinte.
        </p>
      ) : (
        <p>Marcado como dia trabalhado pela liderança. Projetado como {nomeDiaMin(f.data)} comum, sem transferência para o dia seguinte.</p>
      ),
    );
  }

  if (item.tipo === 'feriado-parado') {
    const f = item.feriado;
    const precedente = pr.historicoFeriados
      .map((h) => `${ddmm(h.data)} ${h.trabalhado ? `trabalhado (${formatInt(h.pedidos)} pedidos)` : 'parado'}`)
      .join(' · ');
    const transf = f.transferido ? (
      <>
        Os cerca de {formatInt(f.transferido)} pedidos do dia caem em {ddmm(f.para ?? f.data)}, que já era {nomeDiaMin(f.para ?? f.data)}.
        {item.ondaJunto && (
          <>
            {' '}
            <b className="font-semibold text-ink">No mesmo dia chega a onda do {item.ondaJunto.nome}</b>: os dois acúmulos somados passam do teto.
          </>
        )}
      </>
    ) : (
      'Sem dia útil seguinte no mês.'
    );
    return caixa(
      <CalendarX className="size-4 text-warn" />,
      `${f.nome}, feriado ${f.escopo}`,
      f.passado ? (
        <p>
          {nomeDia(f.data)} sem expedição. {transf}
        </p>
      ) : (
        <>
          <p>
            Projetado como {nomeDiaMin(f.data)} <b className="font-semibold text-ink">sem expedição</b>. {transf}
          </p>
          {precedente && <p className="mt-1">Feriados anteriores: {precedente}. Se a equipe for trabalhar, o dia entra como útil comum e a transferência some.</p>}
        </>
      ),
    );
  }

  if (item.tipo === 'spike') {
    const s = item.spike;
    const meds = s.medicoes ?? [];
    let corpo: ReactNode;
    if (item.semMedicaoBF) {
      corpo = (
        <p>
          <b className="font-semibold text-ink">Sem medição: a projeção não inclui a onda.</b> O histórico da expedição não tem nenhuma Black Friday, e o excesso
          medido nos N.N não serve de régua para ela.
          {s.para ? ` Pela regra do D+3, a onda chegaria em ${ddmm(s.para)} (${nomeDiaMin(s.para)}), que aparece projetado como dia comum.` : ''} Dimensionar a
          equipe é decisão da liderança.
        </p>
      );
    } else if (item.semOnda) {
      corpo = <p>Sem onda aplicada: nenhuma medição limpa de spike day nos dois meses fechados.</p>;
    } else {
      const mesmoDia = (dia: string) => nomeDiaMin(dia) === nomeDiaMin(s.data);
      corpo = (
        <>
          {meds.map((m) => {
            const alta = m.base > 0 ? (m.real / m.base - 1) * 100 : null;
            return (
              <p key={m.diaSpike}>
                No <b className="font-semibold text-ink">{m.spike}</b> ({nomeDiaMin(m.diaSpike)}
                {mesmoDia(m.diaSpike) ? `, como o ${s.nome}` : ''}), a expedição fez <b className="font-semibold text-ink">{formatInt(m.real)} pedidos</b> em{' '}
                {ddmm(m.dia)} ({nomeDiaMin(m.dia)})
                {alta != null && (
                  <>
                    : <b className="font-semibold text-ink">{pctTxt(alta, 0)} acima do dia útil médio</b> de {rotuloMes(m.mes)} ({formatInt(m.base)})
                  </>
                )}
                . A onda levou {m.atraso} dias para chegar na bancada.
              </p>
            );
          })}
          <p className="mt-1">
            Se o {s.nome} repetir esse padrão, o pico cai em <b className="font-semibold text-ink">{ddmm(s.para ?? s.data)}</b> ({nomeDiaMin(s.para ?? s.data)}),
            com cerca de {formatInt(s.excesso ?? 0)} pedidos acima do esperado para o dia{meds.length > 1 ? `, a média das ${meds.length} medições` : ''}.
          </p>
        </>
      );
    }
    return caixa(<Zap className="size-4 text-accent" />, `Spike day ${s.nome} no marketplace`, corpo);
  }

  const l = item.linha;
  return caixa(
    <OctagonAlert className="size-4 text-warn" />,
    'Acima da capacidade',
    <p>
      Demanda de {formatInt(l.demanda)} contra o teto medido de {formatInt(pr.teto.teto)}. Cerca de {formatInt(l.transbordo)} pedidos escorregam para o dia
      seguinte se a equipe for a de sempre.
    </p>,
  );
}

const nomeDia = (dia: string) => nomeDiaMin(dia).replace(/^./, (x) => x.toUpperCase());

function Agenda({ pr }: { pr: Projecao }) {
  const itens = agendaDeDecisoes(pr);
  if (!itens.length) {
    return <p className="text-ink-3">Nenhum feriado, spike day ou estouro de capacidade previsto para {rotuloMes(pr.chave)}.</p>;
  }
  return (
    <section aria-labelledby="plan-agenda" className="grid gap-2">
      <h3 id="plan-agenda" className="text-md">
        Datas que exigem decisão
      </h3>
      <ul className="grid gap-2">
        {itens.map((i, k) => (
          <ItemDaAgenda key={`${i.tipo}-${i.data}-${k}`} item={i} pr={pr} />
        ))}
      </ul>
    </section>
  );
}

function Tendencias({ c }: { c: Comparativo }) {
  const alta = produtosEmAlta(c.produtos);
  const queda = produtosEmQueda(c.produtos);
  const lista = (titulo: string, icone: ReactNode, itens: { produto: string; difDia: number; variacao: number | null; combinado: boolean; soloA: number; soloB: number; mantem?: boolean }[], vazio: string) => (
    <div className="min-w-0 flex-1 basis-64">
      <h3 className="mb-2 flex items-center gap-1.5 text-md">
        {icone}
        {titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-ink-3">{vazio}</p>
      ) : (
        <ul className="grid gap-1.5">
          {itens.map((p) => (
            <li key={p.produto} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-sm">{p.produto}</code>
              <span className="tabular whitespace-nowrap text-ink-3">{sinalDec1(p.difDia)} por dia</span>
              <Variacao valor={p.variacao} className="min-w-14 justify-end" />
              {p.combinado ? (
                <Dica content={`Cresceu dentro de pedido misto, acompanhando outro produto (kit ou brinde). Segue alto enquanto o anúncio existir. Venda avulsa: ${formatDec1(p.soloA)} para ${formatDec1(p.soloB)} por dia.`}>
                  <span tabIndex={0} role="img" aria-label="Cresceu em pedido misto" className="cursor-help rounded-sm text-accent focus-visible:shadow-focus">
                    ●
                  </span>
                </Dica>
              ) : p.mantem === false ? (
                <Dica content="Perdeu força na 2ª quinzena">
                  <span tabIndex={0} role="img" aria-label="Perdeu força na segunda quinzena" className="cursor-help rounded-sm text-warn focus-visible:shadow-focus">
                    ⚠
                  </span>
                </Dica>
              ) : (
                <span className="w-3" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {lista('Devem seguir em alta', <TrendingUp className="size-4 text-ok" aria-hidden="true" />, alta, 'Nenhum produto com crescimento acima de 10%.')}
        {lista('Em queda', <TrendingDown className="size-4 text-warn" aria-hidden="true" />, queda, 'Nenhum produto com queda acima de 10%.')}
      </div>
      <p className="text-ink-3">
        O ⚠ marca produto que cresceu no mês mas perdeu força na 2ª quinzena: a alta pode não se sustentar. O ● marca produto que cresceu dentro de pedido
        misto, acompanhando outro: continua alto enquanto o kit ou brinde estiver no ar, e cai junto com ele.
      </p>
    </section>
  );
}

/** O backtest é obrigatório: sem ele a aba venderia palpite com cara de medição. */
function Metodo({ pr, c }: { pr: Projecao; c: Comparativo }) {
  const f = pr.fatores;
  const fatores = [1, 2, 3, 4, 5].map((w) => `${ABREV_DIA[w]} ${(f[w] || 1).toFixed(2).replace('.', ',')}×`).join(' · ');
  const bt = pr.backtest;
  const vf = pr.validacaoFeriados;
  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer rounded-sm text-ink-2 focus-visible:shadow-focus">Como esta projeção é calculada, e o quanto ela erra</summary>
      <div className="mt-3 grid gap-2 text-ink-2">
        <p>
          <b className="font-semibold text-ink">Base:</b> {formatInt(pr.base)} pedidos por dia útil, a média de {rotuloMes(c.chaveB)}. Usa só o último mês
          fechado de propósito: a média dos dois atrasaria a resposta a qualquer mudança de patamar.
        </p>
        <p>
          <b className="font-semibold text-ink">Fator de dia da semana</b> (medido em {pr.amostraFatores ?? 0} dias úteis dos dois meses): {fatores}. Segunda é o
          pico porque recebe o acúmulo do fim de semana.
        </p>
        <p>
          <b className="font-semibold text-ink">Feriado:</b> o volume do dia não desaparece, cai no próximo dia útil.{' '}
          {vf.length
            ? `Validado nos meses fechados: ${vf
                .map((v) => {
                  const jan = v.janela.length > 1 ? `${ddmm(v.janela[0] ?? v.feriado)} a ${ddmm(v.janela[v.janela.length - 1] ?? v.feriado)}` : ddmm(v.janela[0] ?? v.feriado);
                  return `${ddmm(v.feriado)} (${v.nome}, ${nomeDiaMin(v.feriado)}) → ${jan}, ${formatInt(v.real)} pedidos: com a transferência o modelo erra ${pctTxt(v.erro)}; sem ela, erraria ${pctTxt(v.erroSem)}`;
                })
                .join('; ')}. Mede a janela até a fila acumulada se esgotar, não só o dia seguinte.`
            : 'Nenhum feriado em dia útil nos dois meses fechados para validar.'}
        </p>
        <p>
          <b className="font-semibold text-ink">Spike day:</b> a venda do 9.9 e afins não chega no mesmo dia, chega em D+3 (ou no próximo dia útil se D+3 cair
          em fim de semana ou feriado). Excesso medido sobre o esperado para aquele dia da semana, contra a média do próprio mês:{' '}
          {pr.onda.medicoes.length
            ? pr.onda.medicoes.map((m) => `${m.spike} (${ddmm(m.dia)}, +${formatInt(m.excesso)})`).join(', ')
            : 'nenhuma medição limpa disponível'}
          . Medição com feriado na janela é descartada, senão o mesmo acúmulo seria contado duas vezes.
        </p>
        <p>
          <b className="font-semibold text-ink">Teto:</b>{' '}
          {pr.teto.teto && pr.teto.quando
            ? `${formatInt(pr.teto.teto)} pedidos, o maior dia útil de ${rotuloMes(c.chaveA)} e ${rotuloMes(c.chaveB)} (${ddmm(pr.teto.quando)}). Demanda acima disso não some: transborda para o dia seguinte.`
            : 'não medido.'}
        </p>
        <p>
          <b className="font-semibold text-ink">Erro conhecido:</b>{' '}
          {bt
            ? `Aplicado a ${rotuloMes(c.chaveB)} usando só ${rotuloMes(c.chaveA)}, o modelo projetaria ${formatInt(bt.projetado)} contra ${formatInt(bt.real)} realizados: erro de ${pctTxt(bt.erro)} no total do mês${
                backtestMostraSemEventos(bt) ? ` (sem a transferência de feriado e a onda de spike, erraria ${pctTxt(bt.erroSemEventos)})` : ''
              }.`
            : 'Sem histórico suficiente para medir o erro do modelo.'}{' '}
          A projeção é um patamar esperado, não uma promessa: ela não sabe de campanha nova, ruptura de estoque nem mudança de anúncio.
        </p>
      </div>
    </details>
  );
}

export function Expectativa({ pr, c }: { pr: Projecao | null; c: Comparativo }) {
  return (
    <Card>
      <CardHeader
        title={pr ? `Expectativa para ${rotuloMes(pr.chave)}` : 'Expectativa para o mês corrente'}
        description="Projeção diária pelo fator de dia da semana, feriado, spike day e teto de capacidade."
      />
      <CardBody className="grid gap-6">
        {!pr ? (
          <EmptyState
            title="Sem dados suficientes para projetar"
            description="Os dois últimos meses fechados não têm pedidos suficientes para medir o fator de dia da semana. Quando houver, a projeção aparece aqui."
          />
        ) : (
          <>
            <CartoesExpectativa pr={pr} c={c} />
            <GraficoProjecao pr={pr} />
            <Semanas pr={pr} />
            <Agenda pr={pr} />
            <Tendencias c={c} />
            <Metodo pr={pr} c={c} />
          </>
        )}
      </CardBody>
    </Card>
  );
}
