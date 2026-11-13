import { describe, expect, it } from 'vitest';
import { prever, segmentarPorPrazo, type MotorConfig } from './index';

const config: MotorConfig = {
  inicio_turno: '07:40',
  inicio_producao: '08:30',
  fim_turno: '17:40',
  almoco_inicio: '13:00',
  almoco_fim: '14:00',
  ritmo_inclui_pausas: true,
  fator_pessimista: 0.75,
  fatores_dia_semana: {},
  curva_chegada: {},
  piso_ritmo_necessario: 35,
};

// 10:00 no relógio local, o mesmo que o motor lê.
const agora = new Date(2026, 10, 5, 10, 0, 0);
const hoje = new Date(2026, 10, 5, 12, 59, 0).toISOString();
const amanha = new Date(2026, 10, 6, 12, 59, 0).toISOString();

describe('wrapper do motor', () => {
  it('segmenta por prazo', () => {
    const b = segmentarPorPrazo(
      [
        { num_pedido: '1', expira_em: new Date(2026, 10, 4, 12).toISOString() },
        { num_pedido: '2', expira_em: hoje },
        { num_pedido: '3', expira_em: amanha },
        { num_pedido: '4', expira_em: null },
      ],
      agora,
    );
    expect(b).toEqual({ atrasado: 1, hoje: 1, amanha: 1, depois: 0, sem_prazo: 1 });
  });

  it('prevê um término para o obrigatório', () => {
    const pendentes = Array.from({ length: 210 }, (_, i) => ({ num_pedido: String(i), expira_em: hoje }));
    const r = prever({ pendentes, agora, equipe: { pessoas: 3, ritmo_ped_h: 35 }, config, vistos_hoje: 210 });
    expect(r.obrigatorios).toBe(210);
    // 210 pedidos a 105/h = 2 h
    expect(r.termino_hoje_p50?.getHours()).toBe(12);
    expect(r.falta_capacidade).toBe(false);
  });

  it('acusa falta de capacidade só sobre o obrigatório', () => {
    const muitos = Array.from({ length: 3000 }, (_, i) => ({ num_pedido: String(i), expira_em: hoje }));
    const r = prever({ pendentes: muitos, agora, equipe: { pessoas: 3, ritmo_ped_h: 35 }, config });
    expect(r.falta_capacidade).toBe(true);
    const so = Array.from({ length: 400 }, (_, i) => ({ num_pedido: String(i), expira_em: amanha }));
    const r2 = prever({ pendentes: so, agora, equipe: { pessoas: 3, ritmo_ped_h: 35 }, config });
    expect(r2.falta_capacidade).toBe(false);
  });
});
