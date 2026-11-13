/**
 * Wrapper tipado do motor de previsão (cópia em ./motor-previsao.js).
 * O arquivo publica o global `FilaPrevisao`; importamos por efeito colateral e lemos o global.
 * O motor usa o relógio de parede do navegador (getHours): o galpão e o navegador estão em São Paulo.
 */
import './motor-previsao.js';

export interface MotorConfig {
  inicio_turno: string;
  inicio_producao: string;
  fim_turno: string;
  almoco_inicio: string;
  almoco_fim: string;
  ritmo_inclui_pausas: boolean;
  fator_pessimista: number;
  fatores_dia_semana: Record<string, number>;
  curva_chegada: Record<string, number>;
  piso_ritmo_necessario: number | null;
}

export interface MotorPendente {
  num_pedido: string;
  expira_em: string | null;
  prazo_origem?: string | null;
}

export interface MotorEntrada {
  pendentes: MotorPendente[];
  agora: Date;
  equipe: { pessoas: number; ritmo_ped_h: number };
  config: MotorConfig;
  vistos_hoje?: number;
  vistos_primeira_rodada?: number;
}

export interface MotorBaldes {
  atrasado: number;
  hoje: number;
  amanha: number;
  depois: number;
  sem_prazo: number;
}

export interface MotorSaida {
  agora: Date;
  baldes: MotorBaldes;
  pendentes: number;
  obrigatorios: number;
  termino_hoje_p50: Date | null;
  termino_hoje_p90: Date | null;
  termino_tudo_p50: Date | null;
  termino_tudo_p90: Date | null;
  termino_para_meta: Date | null;
  ritmo_necessario: number;
  ritmo_para_zerar_tudo: number;
  falta_capacidade: boolean;
  sobra_obrigatoria_no_fim: number;
  sobra_total_no_fim: number;
  equipe_usada: { pessoas: number; ritmo_ped_h: number };
  [campo: string]: unknown;
}

interface FilaPrevisaoGlobal {
  prever(entrada: MotorEntrada): MotorSaida;
  segmentarPorPrazo(pendentes: MotorPendente[], agora: Date): MotorBaldes;
}

function motor(): FilaPrevisaoGlobal {
  const g = (globalThis as { FilaPrevisao?: FilaPrevisaoGlobal }).FilaPrevisao;
  if (!g) throw new Error('Motor de previsão não carregou (global FilaPrevisao ausente).');
  return g;
}

export function prever(entrada: MotorEntrada): MotorSaida {
  return motor().prever(entrada);
}

export function segmentarPorPrazo(pendentes: MotorPendente[], agora: Date): MotorBaldes {
  return motor().segmentarPorPrazo(pendentes, agora);
}
