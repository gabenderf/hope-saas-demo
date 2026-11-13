/**
 * Lógica pura do Modo TV: rodízio de painéis, configuração de quiosque e
 * ordenação por modo de privacidade. Sem React, para testar sem navegador.
 */
import type { OperatorRow } from '@/data/types';
import { DEFAULT_INDIVIDUAL_GOAL } from '@/lib/metrics';

export type PanelId = 'agora' | 'operadores' | 'hora' | 'previsao';
export const ALL_PANELS: readonly PanelId[] = ['agora', 'operadores', 'hora', 'previsao'];
export const PANEL_LABEL: Record<PanelId, string> = {
  agora: 'Agora',
  operadores: 'Operadores',
  hora: 'Por hora',
  previsao: 'Previsão',
};

/** completo = com posição; sem-ranking = ordem alfabética; so-equipe = só totais do time. */
export type Privacy = 'completo' | 'sem-ranking' | 'so-equipe';
export const PRIVACY_MODES: readonly Privacy[] = ['completo', 'sem-ranking', 'so-equipe'];
export const PRIVACY_LABEL: Record<Privacy, string> = {
  completo: 'Completo, por pedidos',
  'sem-ranking': 'Sem ranking, ordem alfabética',
  'so-equipe': 'Só a equipe, sem nomes',
};

export const MIN_INTERVAL = 10;
export const MAX_INTERVAL = 60;
export const DEFAULT_INTERVAL = 20;
export const PAGE_SIZE = 10;

export interface TvSettings {
  panels: PanelId[];
  intervalSec: number;
  privacy: Privacy;
}

export const DEFAULT_SETTINGS: TvSettings = {
  panels: [...ALL_PANELS],
  intervalSec: DEFAULT_INTERVAL,
  privacy: 'completo',
};

export function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(n)));
}

function parsePanels(raw: string | null | undefined): PanelId[] | null {
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim());
  const unique = ALL_PANELS.filter((p) => list.includes(p));
  return unique.length ? unique : null;
}

function parsePrivacy(raw: string | null | undefined): Privacy | null {
  return raw && (PRIVACY_MODES as readonly string[]).includes(raw) ? (raw as Privacy) : null;
}

function parseInterval(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? clampInterval(n) : null;
}

/** Prioridade: URL, depois o salvo no aparelho, depois o padrão. Valor inválido cai no próximo. */
export function resolveSettings(params: URLSearchParams, stored: Partial<Record<keyof TvSettings, unknown>> | null): TvSettings {
  const storedPanels = Array.isArray(stored?.panels) ? parsePanels((stored.panels as unknown[]).join(',')) : null;
  const storedInterval = typeof stored?.intervalSec === 'number' ? parseInterval(String(stored.intervalSec)) : null;
  const storedPrivacy = typeof stored?.privacy === 'string' ? parsePrivacy(stored.privacy) : null;
  return {
    panels: parsePanels(params.get('paineis')) ?? storedPanels ?? [...DEFAULT_SETTINGS.panels],
    intervalSec: parseInterval(params.get('intervalo')) ?? storedInterval ?? DEFAULT_SETTINGS.intervalSec,
    privacy: parsePrivacy(params.get('privacidade')) ?? storedPrivacy ?? DEFAULT_SETTINGS.privacy,
  };
}

/** Query string de quiosque (compartilhável). */
export function kioskQuery(s: TvSettings): string {
  const p = new URLSearchParams();
  p.set('paineis', s.panels.join(','));
  p.set('intervalo', String(s.intervalSec));
  p.set('privacidade', s.privacy);
  return p.toString().replace(/%2C/g, ',');
}

/* ---------- rodízio ---------- */

export interface RotationState {
  /** painéis ligados nas configurações, na ordem canônica */
  enabled: PanelId[];
  forecastAvailable: boolean;
  current: PanelId;
  paused: boolean;
}

export type RotationAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toggle-pause' }
  | { type: 'set-enabled'; panels: PanelId[] }
  | { type: 'set-forecast'; available: boolean };

/** Painéis que de fato entram no rodízio: ligados e com dado. A Previsão some sem resumo. */
export function visiblePanels(enabled: readonly PanelId[], forecastAvailable: boolean): PanelId[] {
  const list = ALL_PANELS.filter((p) => enabled.includes(p) && (p !== 'previsao' || forecastAvailable));
  return list.length ? list : ['agora'];
}

export function initialRotation(enabled: readonly PanelId[], forecastAvailable: boolean): RotationState {
  const vis = visiblePanels(enabled, forecastAvailable);
  return { enabled: ALL_PANELS.filter((p) => enabled.includes(p)), forecastAvailable, current: vis[0]!, paused: false };
}

function settle(state: RotationState): RotationState {
  const vis = visiblePanels(state.enabled, state.forecastAvailable);
  if (vis.includes(state.current)) return state;
  // o painel atual saiu do rodízio: segue para o próximo na ordem canônica, ou o primeiro
  const after = ALL_PANELS.slice(ALL_PANELS.indexOf(state.current) + 1).find((p) => vis.includes(p));
  return { ...state, current: after ?? vis[0]! };
}

export function rotationReducer(state: RotationState, action: RotationAction): RotationState {
  const vis = visiblePanels(state.enabled, state.forecastAvailable);
  const i = Math.max(0, vis.indexOf(state.current));
  switch (action.type) {
    case 'next':
      return { ...state, current: vis[(i + 1) % vis.length]! };
    case 'prev':
      return { ...state, current: vis[(i - 1 + vis.length) % vis.length]! };
    case 'pause':
      return { ...state, paused: true };
    case 'resume':
      return { ...state, paused: false };
    case 'toggle-pause':
      return { ...state, paused: !state.paused };
    case 'set-enabled':
      return settle({ ...state, enabled: ALL_PANELS.filter((p) => action.panels.includes(p)) });
    case 'set-forecast':
      return settle({ ...state, forecastAvailable: action.available });
  }
}

/* ---------- operadores ---------- */

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Quem aparece e em que ordem. so-equipe devolve vazio: o painel some. */
export function orderOperators(rows: readonly OperatorRow[], privacy: Privacy): OperatorRow[] {
  if (privacy === 'so-equipe') return [];
  const shown = rows.filter((r) => r.status !== 'inativo');
  if (privacy === 'sem-ranking') return [...shown].sort((a, b) => collator.compare(a.name, b.name));
  return [...shown].sort((a, b) => b.orders - a.orders || collator.compare(a.name, b.name));
}

export function paginate<T>(items: readonly T[], size = PAGE_SIZE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** A posição (1º, 2º) só existe no modo completo. */
export const showsRank = (privacy: Privacy) => privacy === 'completo';

/**
 * Meta do time: a global, se houver; senão a média das metas efetivas de quem não está inativo.
 * TODO: trocar por averageEffectiveGoal de src/lib/metrics.ts quando existir.
 */
export function teamGoal(operators: readonly OperatorRow[], globalGoal: number | null | undefined): number {
  if (globalGoal != null) return globalGoal;
  const goals = operators.filter((o) => o.status !== 'inativo').map((o) => o.effectiveGoal);
  return goals.length ? goals.reduce((s, g) => s + g, 0) / goals.length : DEFAULT_INDIVIDUAL_GOAL;
}
