import { describe, expect, it } from 'vitest';
import { atTime } from '@/lib/time';
import type { ForecastConfig, ForecastData, QueueSnapshot } from '../data/types';
import { rankSkus, searchSkus, summarize, watchOf } from './forecast-model';

const DAY = '2026-11-05';
const config: ForecastConfig = {
  inicio_turno: '07:40',
  inicio_producao: '08:30',
  fim_turno: '17:40',
  almoco_inicio: '13:00',
  almoco_fim: '14:00',
  equipe_padrao: 3,
  ritmo_padrao: 35,
  fatores_dia_semana: {},
  curva_chegada: {},
  piso_ritmo_necessario: 35,
  ritmo_inclui_pausas: true,
  fator_pessimista: 0.75,
};
const snap = (hh: number, mm: number, status = 'ok'): QueueSnapshot => ({
  raspado_em: atTime(DAY, hh, mm).toISOString(),
  etapa: 'para_imprimir',
  status,
  total_capturado: 100,
  rodada: `r${hh}${mm}`,
  sub_aba: null,
});

describe('vigia', () => {
  it('antes das 08:15 sem coleta de dados é só espera', () => {
    expect(watchOf([], atTime(DAY, 8, 10)).state).toBe('aguardando');
  });
  it('depois das 08:15 sem coleta de dados é falha', () => {
    expect(watchOf([], atTime(DAY, 8, 16)).state).toBe('sem-coleta');
  });
  it('domingo sem coleta de dados não é falha', () => {
    expect(watchOf([], atTime('2026-11-08', 10)).state).toBe('dia-parado');
  });
  it('feriado parado (20/11/2026, Consciência Negra) sem coleta de dados não é falha', () => {
    expect(watchOf([], atTime('2026-11-20', 10)).state).toBe('dia-parado');
  });
  it('só conta coleta de dados com status ok e informa a última', () => {
    const w = watchOf([snap(7, 40), snap(8, 0, 'incompleto'), snap(8, 15)], atTime(DAY, 8, 30));
    expect(w.state).toBe('ok');
    expect(w.count).toBe(2);
    expect(w.minutesAgo).toBe(15);
  });
});

describe('ranking de SKU', () => {
  const rows = [
    { sku: '100X-TOU-DESC', prazo: 'hoje', pedidos: 6, unidades_anuncio: 6, pecas: 600 },
    { sku: '3X-LEN-ECO-70X50', prazo: 'hoje', pedidos: 40, unidades_anuncio: 40, pecas: 120 },
    { sku: '3X-LEN-ECO-70X50', prazo: 'amanha', pedidos: 10, unidades_anuncio: 10, pecas: 30 },
  ];
  it('ordena por pedidos, não por peças, somando prazos', () => {
    const r = rankSkus(rows);
    expect(r[0]?.sku).toBe('3X-LEN-ECO-70X50');
    expect(r[0]?.orders).toBe(50);
    expect(r[0]?.piecesTomorrow).toBe(30);
  });
  it('a busca preserva a posição do ranking completo', () => {
    const r = searchSkus(rankSkus(rows), 'tou');
    expect(r).toHaveLength(1);
    expect(r[0]?.position).toBe(2);
  });
});

describe('resumo', () => {
  const pend = (n: number, expira: Date, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ num_pedido: `${tag}-${i}`, expira_em: expira.toISOString(), prazo_origem: null }));
  const base = (over: Partial<ForecastData>): ForecastData => ({
    day: DAY,
    config,
    pending: [],
    seenToday: 0,
    snapshots: [snap(7, 40)],
    plan: { meta_hora_termino: null, meta_publicada_em: null, obrigatorios_inicial: 640, pendentes_inicial: 900 },
    skus: [],
    ...over,
  });

  it('sem config devolve null', () => {
    expect(summarize(base({ config: null }), atTime(DAY, 10))).toBeNull();
  });

  it('separa obrigatório de adiantamento e fica ok quando fecha no turno', () => {
    const data = base({
      pending: [...pend(150, atTime(DAY, 12, 59), 'h'), ...pend(300, atTime('2026-11-06', 12, 59), 'a')],
      seenToday: 450,
    });
    const s = summarize(data, atTime(DAY, 10))!;
    expect(s.mandatoryPending).toBe(150);
    expect(s.aheadPending).toBe(300);
    expect(s.mandatoryInitial).toBe(640);
    expect(s.status).toBe('ok');
    expect(s.atRisk).toBe(false);
  });

  it('adiantamento enorme não gera risco', () => {
    const data = base({ pending: pend(2000, atTime('2026-11-06', 12, 59), 'a'), seenToday: 2000 });
    expect(summarize(data, atTime(DAY, 16))!.status).toBe('ok');
  });

  it('obrigatório que não cabe no turno é atenção', () => {
    const data = base({ pending: pend(1500, atTime(DAY, 12, 59), 'h'), seenToday: 1500 });
    const s = summarize(data, atTime(DAY, 10))!;
    expect(s.atRisk).toBe(true);
    expect(s.status).toBe('atencao');
  });

  it('fila truncada acende atenção', () => {
    const data = base({ pending: pend(10, atTime(DAY, 12, 59), 'h'), seenToday: 90 });
    const s = summarize(data, atTime(DAY, 10))!;
    expect(s.truncatedQueue).toBe(true);
    expect(s.status).toBe('atencao');
  });

  it('sem coleta de dados depois das 08:15 tem prioridade', () => {
    const s = summarize(base({ snapshots: [] }), atTime(DAY, 9))!;
    expect(s.status).toBe('sem-coleta');
  });

  it('domingo e feriado parado não viram status sem-coleta', () => {
    expect(summarize(base({ day: '2026-11-08', snapshots: [] }), atTime('2026-11-08', 10))!.status).toBe('ok');
    expect(summarize(base({ day: '2026-11-20', snapshots: [] }), atTime('2026-11-20', 10))!.status).toBe('ok');
  });

  it('sem nenhuma coleta de dados, término e ritmo necessário ficam sem dado', () => {
    const s = summarize(base({ snapshots: [], pending: pend(50, atTime(DAY, 12, 59), 'h'), seenToday: 50 }), atTime(DAY, 9))!;
    expect(s.noData).toBe(true);
    expect(s.projectedFinishAt).toBeNull();
    expect(s.requiredRate).toBeNull();
  });

  it('contagem de vistos ausente com captura acende atenção', () => {
    const s = summarize(base({ seenToday: null }), atTime(DAY, 10))!;
    expect(s.truncatedQueue).toBe(true);
  });
});
