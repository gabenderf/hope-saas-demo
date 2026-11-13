import type { DayKey } from '@/lib/time';

/** Linha de config_previsao (id = 1). */
export interface ForecastConfig {
  inicio_turno: string;
  inicio_producao: string;
  fim_turno: string;
  almoco_inicio: string;
  almoco_fim: string;
  equipe_padrao: number;
  ritmo_padrao: number;
  fatores_dia_semana: Record<string, number>;
  curva_chegada: Record<string, number>;
  piso_ritmo_necessario: number | null;
  ritmo_inclui_pausas: boolean;
  fator_pessimista: number;
}

export interface PendingOrder {
  num_pedido: string;
  expira_em: string | null;
  prazo_origem: string | null;
}

export interface QueueSnapshot {
  raspado_em: string;
  etapa: string;
  status: string;
  total_capturado: number | null;
  rodada: string;
  sub_aba: string | null;
}

/** previsao_dia: meta congelada na primeira coleta de dados do dia. */
export interface DayPlan {
  meta_hora_termino: string | null;
  meta_publicada_em: string | null;
  obrigatorios_inicial: number | null;
  pendentes_inicial: number | null;
}

/** demanda_sku_dia: uma linha por (SKU × prazo). */
export interface SkuDemandRow {
  sku: string;
  prazo: string;
  pedidos: number;
  unidades_anuncio: number;
  pecas: number;
}

export interface ForecastData {
  day: DayKey;
  config: ForecastConfig | null;
  pending: PendingOrder[];
  /** contagem exata de fila_do_dia (união do dia); null = a contagem não veio */
  seenToday: number | null;
  snapshots: QueueSnapshot[];
  plan: DayPlan | null;
  skus: SkuDemandRow[];
}

export interface ForecastSource {
  /** false = a Previsão só lê (preview de dados reais, login de demonstração). */
  readonly canWrite: boolean;
  load(day: DayKey, now: Date): Promise<ForecastData>;
  /** Grava config_previsao.equipe_padrao e devolve como desfazer. */
  setTeamSize(value: number): Promise<{ undo: () => Promise<void> }>;
}
