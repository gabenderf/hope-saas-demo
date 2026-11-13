export type Severity = 'info' | 'atencao' | 'critico';

export interface NotifyInput {
  /** regra que gerou (ex.: 'bancada-parada'); usada nas preferências */
  rule: string;
  severity: Severity;
  title: string;
  body?: string;
  /** link interno para agir (ex.: '/expedicao/previsao') */
  href?: string;
  /** mesma chave dentro do intervalo de silêncio = não notifica de novo */
  dedupeKey: string;
  /** minutos de silêncio para a mesma dedupeKey (padrão 30) */
  cooldownMin?: number;
}

export interface AppNotification extends NotifyInput {
  id: string;
  createdAt: string;
  readAt: string | null;
  /** preenchido quando o problema acabou (ex.: conexão voltou) ou o dia virou */
  resolvedAt?: string | null;
}

export interface RulePref {
  ativa: boolean;
  toast: boolean;
  navegador: boolean;
}

export interface GlobalPrefs {
  navegadorPermitido: boolean;
  somNaTv: boolean;
}
