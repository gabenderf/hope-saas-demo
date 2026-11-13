/** Atalhos de teclado: lógica pura (o componente só liga isto aos eventos). */

export interface GoShortcut {
  key: string;
  to: string;
  label: string;
}

/** Sequências "g" + letra. */
export const GO_SHORTCUTS: GoShortcut[] = [
  { key: 'v', to: '/expedicao', label: 'Visão Geral' },
  { key: 'o', to: '/expedicao/operadores', label: 'Operadores' },
  { key: 'p', to: '/expedicao/previsao', label: 'Previsão' },
  { key: 'l', to: '/expedicao/planejamento', label: 'Planejamento' },
  { key: 'r', to: '/expedicao/relatorios', label: 'Relatórios' },
  { key: 'm', to: '/expedicao/metas', label: 'Metas' },
  { key: 'n', to: '/notificacoes', label: 'Notificações' },
];

export const SEQUENCE_TIMEOUT_MS = 1200;

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** Foco em campo de texto (ou algo editável): nenhum atalho dispara. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as TargetLike | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type ShortcutAction =
  | { type: 'none' }
  | { type: 'pending' }
  | { type: 'palette' }
  | { type: 'help' }
  | { type: 'go'; to: string };

/**
 * Máquina de estados dos atalhos. `editable` = o foco está num campo.
 * Ctrl/Cmd+K abre a paleta mesmo em campo; o resto é ignorado em campo.
 */
export function createShortcutMatcher(now: () => number = Date.now) {
  let pendingAt: number | null = null;

  return function handle(e: KeyInfo, editable: boolean): ShortcutAction {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.ctrlKey || e.metaKey) && key === 'k') {
      pendingAt = null;
      return { type: 'palette' };
    }
    if (editable || e.ctrlKey || e.metaKey || e.altKey) {
      pendingAt = null;
      return { type: 'none' };
    }
    if (pendingAt !== null && now() - pendingAt <= SEQUENCE_TIMEOUT_MS) {
      pendingAt = null;
      const hit = GO_SHORTCUTS.find((s) => s.key === key);
      return hit ? { type: 'go', to: hit.to } : { type: 'none' };
    }
    pendingAt = null;
    if (key === 'g') {
      pendingAt = now();
      return { type: 'pending' };
    }
    if (key === '/') return { type: 'palette' };
    if (key === '?') return { type: 'help' };
    return { type: 'none' };
  };
}
