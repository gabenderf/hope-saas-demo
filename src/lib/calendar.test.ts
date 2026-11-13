import { afterEach, describe, expect, it } from 'vitest';
import {
  type DadosDias,
  FERIADOS_TRABALHADOS_PLANEJADOS,
  diasDoMes,
  easterSunday,
  ehFeriado,
  ehUtil,
  feriadoParado,
  feriadoTrabalhado,
  holidaysOf,
  isBusinessDay,
} from './calendar';

describe('feriados calculados', () => {
  it('Páscoa 2026 a 2028', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
  });

  it('lista de 2026 (inclui 09/07 estadual, 25/01 municipal, Carnaval e Corpus Christi)', () => {
    const mapa = Object.fromEntries(holidaysOf(2026).map((h) => [h.day, h.name]));
    expect(mapa).toEqual({
      '2026-01-01': 'Confraternização Universal',
      '2026-01-25': 'Aniversário de São Paulo',
      '2026-02-16': 'Carnaval',
      '2026-02-17': 'Carnaval',
      '2026-04-03': 'Sexta-feira Santa',
      '2026-04-21': 'Tiradentes',
      '2026-05-01': 'Dia do Trabalho',
      '2026-06-04': 'Corpus Christi',
      '2026-07-09': 'Revolução Constitucionalista',
      '2026-09-07': 'Independência',
      '2026-10-12': 'Nossa Senhora Aparecida',
      '2026-11-02': 'Finados',
      '2026-11-15': 'Proclamação da República',
      '2026-11-20': 'Consciência Negra',
      '2026-12-25': 'Natal',
    });
  });

  it('escopo: estadual e municipal mantêm o rótulo antigo', () => {
    expect(ehFeriado('2026-07-09')).toMatchObject({ scope: 'estadual', scopeLabel: 'SP estadual' });
    expect(ehFeriado('2026-01-25')).toMatchObject({ scope: 'municipal', scopeLabel: 'SP municipal' });
    expect(ehFeriado('2026-02-16')).toMatchObject({ scope: 'facultativo' });
    expect(ehFeriado('2026-10-13')).toBeNull();
  });

  it('quando duas regras caem no mesmo dia, vale a última (Sexta-feira Santa em 21/04/2000)', () => {
    expect(easterSunday(2000)).toBe('2000-04-23');
    expect(ehFeriado('2000-04-21')?.name).toBe('Sexta-feira Santa');
  });

  it('ehUtil e diasDoMes', () => {
    expect(ehUtil('2026-10-12')).toBe(true);
    expect(ehUtil('2026-10-10')).toBe(false);
    expect(diasDoMes('2026-02')).toHaveLength(28);
    expect(diasDoMes('2028-02')).toHaveLength(29);
    expect(diasDoMes('2026-10')[30]).toBe('2026-10-31');
  });
});

describe('feriado trabalhado x parado', () => {
  afterEach(() => {
    for (const k of Object.keys(FERIADOS_TRABALHADOS_PLANEJADOS)) delete FERIADOS_TRABALHADOS_PLANEJADOS[k];
  });

  // Outubro/2026: mediana dos dias comuns 800; 12/10 fez 901 (trabalhado).
  const outubro: Record<string, number> = {};
  for (const d of diasDoMes('2026-10')) if (ehUtil(d) && !ehFeriado(d)) outubro[d] = 800;
  outubro['2026-10-12'] = 901;
  const dados: DadosDias = { diasDoMes: (c) => (c === '2026-10' ? outubro : undefined), hoje: '2026-11-05' };

  it('12/10/2026 teve 901 pedidos: o dado decide que foi trabalhado', () => {
    expect(feriadoTrabalhado('2026-10-12', dados)).toBe(true);
    expect(feriadoParado('2026-10-12', dados)).toBeNull();
    // ehFeriado continua dizendo que é feriado no calendário
    expect(ehFeriado('2026-10-12')?.name).toBe('Nossa Senhora Aparecida');
  });

  it('sem movimento ou com bipagem solta, o galpão parou', () => {
    const com = { ...outubro, '2026-10-12': 30 };
    const d2: DadosDias = { diasDoMes: (c) => (c === '2026-10' ? com : undefined), hoje: '2026-11-05' };
    expect(feriadoParado('2026-10-12', d2)?.name).toBe('Nossa Senhora Aparecida');
    expect(feriadoParado('2026-11-02', dados)?.name).toBe('Finados');
  });

  it('o limite é 25% da mediana (>=)', () => {
    const lim = { ...outubro, '2026-10-12': 200 };
    const quase = { ...outubro, '2026-10-12': 199 };
    const mk = (m: Record<string, number>): DadosDias => ({ diasDoMes: (c) => (c === '2026-10' ? m : undefined), hoje: '2026-11-05' });
    expect(feriadoTrabalhado('2026-10-12', mk(lim))).toBe(true);
    expect(feriadoTrabalhado('2026-10-12', mk(quase))).toBe(false);
  });

  it('hoje e o futuro não têm dado: só vale o planejado', () => {
    const hoje12: DadosDias = { ...dados, hoje: '2026-10-12' };
    expect(feriadoTrabalhado('2026-10-12', hoje12)).toBe(false);
    FERIADOS_TRABALHADOS_PLANEJADOS['2026-10-12'] = true;
    expect(feriadoTrabalhado('2026-10-12', hoje12)).toBe(true);
    expect(feriadoTrabalhado('2026-10-12')).toBe(true);
  });

  it('isBusinessDay: fim de semana nunca; feriado só se trabalhado', () => {
    expect(isBusinessDay('2026-10-14')).toBe(true);
    expect(isBusinessDay('2026-10-10')).toBe(false);
    expect(isBusinessDay('2026-10-12')).toBe(false);
    expect(isBusinessDay('2026-10-12', new Set(['2026-10-12']))).toBe(true);
    FERIADOS_TRABALHADOS_PLANEJADOS['2026-10-12'] = true;
    expect(isBusinessDay('2026-10-12')).toBe(true);
  });
});
