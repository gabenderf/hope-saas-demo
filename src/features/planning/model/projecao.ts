/**
 * Modelo de projeção do mês corrente, portado do planejamento.js.
 *
 * Três componentes, cada um medido no próprio histórico (não chutado):
 *   1. fator de dia da semana   (segunda concentra o acúmulo do fim de semana)
 *   2. transferência de feriado (o que não foi expedido cai no próximo dia útil)
 *   3. onda de spike day        (o pico do marketplace chega em D+3)
 * mais um teto de capacidade: o que passa do maior dia medido transborda.
 *
 * simularMes é UMA função para a projeção e para o backtest, de propósito.
 */
import { diasDoMes, ehFeriado, ehUtil, feriadoParado, feriadoTrabalhado, holidaysOf } from '@/lib/calendar';
import { type DayKey, addDays, weekdayOf } from '@/lib/time';
import { dadosDias, diferencaDias } from './datas';
import { diasUteisComMovimento } from './comparar';
import type { ContextoPlanejamento, DiaUtil } from './types';

/** Fatores por dia da semana (1 = segunda ... 5 = sexta). */
export type Fatores = Record<number, number>;

/** Os meses que alimentam a projeção do mês corrente. */
export function mesesFechados(ctx: ContextoPlanejamento): string[] {
  return [ctx.chaveA, ctx.chaveB];
}

/** Média de pedidos por dia útil com movimento: a "base" de um mês. */
export function mediaDiaUtil(ctx: ContextoPlanejamento, chave: string): number {
  const ut = diasUteisComMovimento(ctx, ctx.meses[chave], chave);
  return ut.length ? ut.reduce((s, x) => s + x.pedidos, 0) / ut.length : 0;
}

export interface ResultadoFatores {
  fatores: Fatores | null;
  base: number;
  amostra?: number;
}

/**
 * Fator por dia da semana, medido nos meses de `chaves` (padrão: os dois
 * fechados; o backtest passa só o mês A).
 *
 * Exclui feriados e o dia seguinte a feriado parado (recebe a fila acumulada e
 * contaminaria o fator). O feriado TRABALHADO também fica fora do fator, mas
 * entra no total e na base: é dia de equipe reduzida.
 */
export function fatoresDiaSemana(ctx: ContextoPlanejamento, chaves?: readonly string[]): ResultadoFatores {
  const dados = dadosDias(ctx);
  const vals: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const chave of chaves ?? mesesFechados(ctx)) {
    for (const x of diasUteisComMovimento(ctx, ctx.meses[chave], chave)) {
      if (ehFeriado(x.dia)) continue;
      const anterior = addDays(x.dia, -1);
      // "dia seguinte a feriado" só importa se o anterior seria útil
      if (feriadoParado(anterior, dados) && ehUtil(anterior)) continue;
      vals[x.diaSemana]?.push(x.pedidos);
    }
  }
  let todos: number[] = [];
  for (const w of Object.keys(vals)) todos = todos.concat(vals[Number(w)] ?? []);
  if (!todos.length) return { fatores: null, base: 0 };
  const base = todos.reduce((s, v) => s + v, 0) / todos.length;
  const f: Fatores = {};
  for (const w of Object.keys(vals)) {
    const v = vals[Number(w)] ?? [];
    f[Number(w)] = v.length ? v.reduce((s, x) => s + x, 0) / v.length / base : 1;
  }
  return { fatores: f, base, amostra: todos.length };
}

export type TipoSpike = 'nn' | 'bf';

export interface SpikeDay {
  data: DayKey;
  nome: string;
  tipo: TipoSpike;
}

/**
 * Spike days de marketplace: datas N.N (9.9, 10.10...) e a Black Friday (4ª
 * sexta de novembro). `tipo` separa os dois: a onda de um é medida só contra
 * ocorrências do mesmo tipo.
 */
export function spikeDays(chave: string): SpikeDay[] {
  const ano = chave.slice(0, 4);
  const mes = Number(chave.slice(5, 7));
  const lista: SpikeDay[] = [{ data: `${ano}-${String(mes).padStart(2, '0')}-${String(mes).padStart(2, '0')}`, nome: `${mes}.${mes}`, tipo: 'nn' }];

  if (mes === 11) {
    const sextas: DayKey[] = [];
    for (let i = 1; i <= 30; i++) {
      const dia = `${ano}-11-${String(i).padStart(2, '0')}`;
      if (weekdayOf(dia) === 5) sextas.push(dia);
    }
    const quartaSexta = sextas[3];
    if (quartaSexta) lista.push({ data: quartaSexta, nome: 'Black Friday', tipo: 'bf' });
  }
  return lista;
}

export interface MedicaoSpike {
  spike: string;
  tipo: TipoSpike;
  diaSpike: DayKey;
  /** dia em que a onda chegou */
  dia: DayKey;
  mes: string;
  excesso: number;
  real: number;
  esperado: number;
  base: number;
  /** dias corridos entre o spike e a chegada da onda (nem sempre 3) */
  atraso: number;
}

export interface Onda {
  excesso: number;
  medicoes: MedicaoSpike[];
}

/**
 * Excesso de pedidos que um spike day joga na expedição, medido nos meses
 * fechados (pico em D+3 nas ocorrências medidas).
 *
 * Descarta a medição se houver feriado PARADO em dia útil na janela D+0..D+3.
 * Cada spike é medido contra a média do PRÓPRIO mês.
 */
export function medirOndaSpike(ctx: ContextoPlanejamento, fat: Fatores, chaves?: readonly string[]): Onda {
  const dados = dadosDias(ctx);
  const medicoes: MedicaoSpike[] = [];
  for (const chave of chaves ?? mesesFechados(ctx)) {
    const agg = ctx.meses[chave];
    if (!agg) continue;
    const base = mediaDiaUtil(ctx, chave);
    for (const s of spikeDays(chave)) {
      let contaminado = false;
      for (let k = 0; k <= 3; k++) {
        const d = addDays(s.data, k);
        if (feriadoParado(d, dados) && ehUtil(d)) contaminado = true;
      }
      if (contaminado) continue;

      let alvo = addDays(s.data, 3);
      let guarda = 0;
      while ((!ehUtil(alvo) || feriadoParado(alvo, dados)) && guarda++ < 10) alvo = addDays(alvo, 1);
      const real = agg.dias[alvo] || 0;
      if (!real) continue;
      const esperado = base * (fat[weekdayOf(alvo)] || 1);
      if (real > esperado) {
        medicoes.push({
          spike: s.nome,
          tipo: s.tipo,
          diaSpike: s.data,
          dia: alvo,
          mes: chave,
          excesso: real - esperado,
          real,
          esperado,
          base,
          atraso: diferencaDias(s.data, alvo),
        });
      }
    }
  }
  if (!medicoes.length) return { excesso: 0, medicoes: [] };
  const soma = medicoes.reduce((s, m) => s + m.excesso, 0);
  return { excesso: soma / medicoes.length, medicoes };
}

/**
 * As medições de um TIPO de spike e a média delas. A Black Friday não herda o
 * excesso dos N.N: sem medição do mesmo tipo, a onda NÃO entra na projeção.
 */
export function ondaDoTipo(onda: Onda, tipo: TipoSpike): Onda {
  const meds = (onda.medicoes || []).filter((m) => m.tipo === tipo);
  if (!meds.length) return { excesso: 0, medicoes: [] };
  return { excesso: meds.reduce((s, m) => s + m.excesso, 0) / meds.length, medicoes: meds };
}

export interface Teto {
  teto: number;
  quando: DayKey | null;
}

/** Maior dia útil medido nos meses de `chaves` (padrão: os dois fechados). */
export function tetoObservado(ctx: ContextoPlanejamento, chaves?: readonly string[]): Teto {
  let maior = 0;
  let quando: DayKey | null = null;
  for (const chave of chaves ?? mesesFechados(ctx)) {
    for (const x of diasUteisComMovimento(ctx, ctx.meses[chave], chave)) {
      if (x.pedidos > maior) {
        maior = x.pedidos;
        quando = x.dia;
      }
    }
  }
  return { teto: maior, quando };
}

export interface FeriadoDoMes {
  data: DayKey;
  nome: string;
  /** rótulo do escopo como no arquivo antigo ('nacional', 'SP estadual'...) */
  escopo: string;
  /** cai em segunda a sexta */
  util: boolean;
  trabalhado: boolean;
  passado: boolean;
  /** pedidos do dia que caem no próximo dia útil */
  transferido?: number;
  /** dia que recebe a transferência */
  para?: DayKey;
}

export interface SpikeProjetado extends SpikeDay {
  medicoes?: MedicaoSpike[];
  excesso?: number;
  /** dia em que a onda cairia (mesmo sem medição, para o card explicar) */
  para?: DayKey;
}

export interface LinhaProjecao {
  dia: DayKey;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
  /** o que CHEGA no dia (base x fator, mais feriado e onda). Para total, some esta. */
  nova: number;
  /** a CARGA do dia: o que chega mais o que sobrou de ontem. Para gráfico e "dia mais pesado". */
  demanda: number;
  expedido: number;
  transbordo: number;
  estoura: boolean;
  realizado: number;
  passado: boolean;
  hoje: boolean;
}

export interface SemanaProjetada {
  /** segunda-feira da semana */
  inicio: DayKey;
  /** soma do que CHEGA na semana */
  demanda: number;
  dias: number;
  realizado: number;
  estoura: number;
}

export interface Simulacao {
  chave: string;
  base: number;
  fatores: Fatores;
  onda: Onda;
  teto: Teto;
  linhas: LinhaProjecao[];
  semanas: SemanaProjetada[];
  feriados: FeriadoDoMes[];
  spikes: SpikeProjetado[];
  totalDemanda: number;
  sobraFinal: number;
}

/**
 * Simula um mês dia a dia: base x fator do dia, mais transferência de feriado,
 * mais onda de spike day, com cascata no teto. O total soma `nova`, nunca
 * `demanda` (somar a carga contaria o transbordo de novo em cada dia).
 */
export function simularMes(
  ctx: ContextoPlanejamento,
  chave: string,
  fat: Fatores,
  base: number,
  onda: Onda,
  tet: Teto,
): Simulacao {
  const dados = dadosDias(ctx);
  const aggMes = ctx.meses[chave];
  const hojeIso = ctx.hoje;

  const uteis: DayKey[] = [];
  const feriadosMes: FeriadoDoMes[] = [];
  for (const d of diasDoMes(chave)) {
    const fer = ehFeriado(d);
    // Feriado trabalhado (no histórico, ou planejado) é dia útil comum:
    // entra na conta e não transfere nada.
    const trabalhado = !!fer && ehUtil(d) && feriadoTrabalhado(d, dados);
    if (fer) {
      feriadosMes.push({
        data: d,
        nome: fer.name,
        escopo: fer.scopeLabel,
        util: ehUtil(d),
        trabalhado,
        passado: d < hojeIso,
      });
    }
    if (!ehUtil(d) || (fer && !trabalhado)) continue;
    uteis.push(d);
  }

  const demanda: Record<DayKey, number> = {};
  for (const d of uteis) demanda[d] = base * (fat[weekdayOf(d)] || 1);

  // Transferência de feriado: o que teria sido expedido no feriado cai no
  // próximo dia útil. Validada no próprio histórico por validarFeriados().
  for (const f of feriadosMes) {
    if (!f.util || f.trabalhado) continue;
    const esperado = base * (fat[weekdayOf(f.data)] || 1);
    const prox = uteis.filter((u) => u > f.data)[0];
    if (prox) {
      demanda[prox] = (demanda[prox] ?? 0) + esperado;
      f.transferido = esperado;
      f.para = prox;
    }
  }

  // Onda de spike day em D+3 (ou no próximo dia útil). A onda de cada spike
  // vem só das medições do MESMO tipo; sem nenhuma, `para` ainda diz onde
  // cairia, mas nada é somado.
  const spikes: SpikeProjetado[] = spikeDays(chave);
  for (const s of spikes) {
    const o = ondaDoTipo(onda, s.tipo);
    s.medicoes = o.medicoes;
    s.excesso = o.excesso;
    const alvo = addDays(s.data, 3);
    const cand = uteis.filter((u) => u >= alvo)[0];
    if (!cand) continue;
    s.para = cand;
    if (o.excesso) demanda[cand] = (demanda[cand] ?? 0) + o.excesso;
  }

  // Cascata com teto de capacidade: o que passa do maior dia já medido não
  // some, transborda para o dia seguinte.
  const linhas: LinhaProjecao[] = [];
  let sobra = 0;
  for (const k of uteis) {
    const nova = demanda[k] ?? 0;
    const dem = nova + sobra;
    const exp = tet.teto ? Math.min(dem, tet.teto) : dem;
    sobra = dem - exp;
    linhas.push({
      dia: k,
      diaSemana: weekdayOf(k),
      nova,
      demanda: dem,
      expedido: exp,
      transbordo: sobra,
      estoura: tet.teto > 0 && dem > tet.teto,
      realizado: aggMes ? aggMes.dias[k] || 0 : 0,
      passado: k < hojeIso,
      hoje: k === hojeIso,
    });
  }

  // Semanas (segunda a domingo), pelo que CHEGA na semana.
  const semanas: Record<DayKey, SemanaProjetada> = {};
  for (const l of linhas) {
    const seg = addDays(l.dia, -((l.diaSemana + 6) % 7));
    let sem = semanas[seg];
    if (!sem) {
      sem = { inicio: seg, demanda: 0, dias: 0, realizado: 0, estoura: 0 };
      semanas[seg] = sem;
    }
    sem.demanda += l.nova;
    sem.dias++;
    sem.realizado += l.realizado;
    if (l.estoura) sem.estoura++;
  }
  const listaSemanas = Object.keys(semanas)
    .sort()
    .map((k) => semanas[k] as SemanaProjetada);

  return {
    chave,
    base,
    fatores: fat,
    onda,
    teto: tet,
    linhas,
    semanas: listaSemanas,
    feriados: feriadosMes,
    spikes,
    totalDemanda: linhas.reduce((s, l) => s + l.nova, 0),
    sobraFinal: sobra,
  };
}

/** Soma dos dias úteis com movimento: o "realizado" que o modelo projeta. */
export function realizadoUteis(ctx: ContextoPlanejamento, chave: string): number {
  return diasUteisComMovimento(ctx, ctx.meses[chave], chave).reduce((s, x) => s + x.pedidos, 0);
}

export interface Backtest {
  projetado: number;
  real: number;
  /** erro (%) do modelo completo */
  erro: number;
  /** erro (%) da mesma conta sem feriado nem spike */
  erroSemEventos: number;
}

/**
 * Backtest: projeta o mês B usando SÓ o mês A (fatores, base, onda e teto
 * medidos em A) e compara com o realizado. É o número que diz se vale
 * acreditar na projeção.
 */
export function backtest(ctx: ContextoPlanejamento): Backtest | null {
  const r = fatoresDiaSemana(ctx, [ctx.chaveA]);
  if (!r.fatores) return null;
  const fat = r.fatores;
  const base = mediaDiaUtil(ctx, ctx.chaveA);
  const real = realizadoUteis(ctx, ctx.chaveB);
  if (!base || !real) return null;

  const sim = simularMes(ctx, ctx.chaveB, fat, base, medirOndaSpike(ctx, fat, [ctx.chaveA]), tetoObservado(ctx, [ctx.chaveA]));

  let semEventos = 0;
  for (const l of sim.linhas) semEventos += base * (fat[l.diaSemana] || 1);

  return {
    projetado: sim.totalDemanda,
    real,
    erro: (sim.totalDemanda / real - 1) * 100,
    erroSemEventos: (semEventos / real - 1) * 100,
  };
}

export interface ValidacaoFeriado {
  feriado: DayKey;
  nome: string;
  janela: DayKey[];
  real: number;
  comTransferencia: number;
  semTransferencia: number;
  erro: number;
  erroSem: number;
}

/**
 * Validação da transferência de feriado no histórico dos meses fechados.
 * Compara a JANELA (do dia seguinte até a cascata do teto se esgotar, no
 * máximo 5 dias) com o que o modelo diria, com e sem a transferência.
 */
export function validarFeriados(ctx: ContextoPlanejamento, fat: Fatores, tet: Teto): ValidacaoFeriado[] {
  const dados = dadosDias(ctx);
  const out: ValidacaoFeriado[] = [];
  for (const chave of mesesFechados(ctx)) {
    const agg = ctx.meses[chave];
    const base = mediaDiaUtil(ctx, chave);
    if (!agg || !base) continue;
    const uteis = diasUteisComMovimento(ctx, agg, chave);
    const dias = holidaysOf(Number(chave.slice(0, 4)))
      .map((h) => h.day)
      .sort();
    for (const k of dias) {
      if (k.slice(0, 7) !== chave) continue;
      // Feriado trabalhado não tem transferência para validar.
      if (!ehUtil(k) || feriadoTrabalhado(k, dados)) continue;
      const depois = uteis.filter((u) => u.dia > k);
      if (!depois.length) continue;

      let sobra = base * (fat[weekdayOf(k)] || 1);
      let comT = sobra;
      let semT = 0;
      let real = 0;
      const janela: DayKey[] = [];
      for (let i = 0; i < depois.length && i < 5; i++) {
        const dia = depois[i] as DiaUtil;
        const esp = base * (fat[dia.diaSemana] || 1);
        comT += esp;
        semT += esp;
        real += dia.pedidos;
        janela.push(dia.dia);
        const carga = esp + sobra;
        sobra = tet.teto ? Math.max(0, carga - tet.teto) : 0;
        if (sobra <= 0) break;
      }
      out.push({
        feriado: k,
        nome: ehFeriado(k)?.name ?? '',
        janela,
        real,
        comTransferencia: comT,
        semTransferencia: semT,
        erro: (comT / real - 1) * 100,
        erroSem: (semT / real - 1) * 100,
      });
    }
  }
  return out;
}

export interface FeriadoHistorico {
  data: DayKey;
  nome: string;
  trabalhado: boolean;
  pedidos: number;
}

/**
 * Feriados em dia útil que JÁ passaram (meses fechados e mês corrente),
 * trabalhados ou não: o precedente para decidir o próximo ("o 12/10 foi
 * trabalhado, o 02/11 não").
 */
export function historicoFeriados(ctx: ContextoPlanejamento): FeriadoHistorico[] {
  const dados = dadosDias(ctx);
  const out: FeriadoHistorico[] = [];
  for (const chave of mesesFechados(ctx).concat([ctx.chaveAtual])) {
    const agg = ctx.meses[chave];
    if (!agg) continue;
    const dias = holidaysOf(Number(chave.slice(0, 4)))
      .map((h) => h.day)
      .sort();
    for (const k of dias) {
      if (k.slice(0, 7) !== chave || k >= ctx.hoje) continue;
      if (!ehUtil(k)) continue;
      out.push({ data: k, nome: ehFeriado(k)?.name ?? '', trabalhado: feriadoTrabalhado(k, dados), pedidos: agg.dias[k] || 0 });
    }
  }
  return out;
}

export interface Projecao extends Simulacao {
  amostraFatores: number | undefined;
  historicoFeriados: FeriadoHistorico[];
  validacaoFeriados: ValidacaoFeriado[];
  backtest: Backtest | null;
}

/**
 * Projeção do mês corrente. Base = média por dia útil do ÚLTIMO mês fechado
 * (patamar mais recente). Devolve null quando não há histórico para medir o
 * fator de dia da semana: melhor dizer que não dá do que mostrar a média
 * repetida com cara de previsão.
 */
export function projetar(ctx: ContextoPlanejamento): Projecao | null {
  const r = fatoresDiaSemana(ctx);
  if (!r.fatores) return null;
  const fat = r.fatores;
  const base = mediaDiaUtil(ctx, ctx.chaveB) || r.base;
  const tet = tetoObservado(ctx);

  const pr = simularMes(ctx, ctx.chaveAtual, fat, base, medirOndaSpike(ctx, fat), tet);
  return {
    ...pr,
    amostraFatores: r.amostra,
    historicoFeriados: historicoFeriados(ctx),
    validacaoFeriados: validarFeriados(ctx, fat, tet),
    backtest: backtest(ctx),
  };
}
