import { describe, expect, it } from 'vitest';
import { createShortcutMatcher, isEditableTarget } from './shortcuts';

const k = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe('atalhos', () => {
  it('g seguido de letra navega', () => {
    const h = createShortcutMatcher();
    expect(h(k('g'), false)).toEqual({ type: 'pending' });
    expect(h(k('o'), false)).toEqual({ type: 'go', to: '/expedicao/operadores' });
  });
  it('sequência expira', () => {
    let t = 0;
    const h = createShortcutMatcher(() => t);
    h(k('g'), false);
    t = 5000;
    expect(h(k('o'), false)).toEqual({ type: 'none' });
  });
  it('ignora tudo em campo de texto, menos Ctrl+K', () => {
    const h = createShortcutMatcher();
    expect(h(k('g'), true)).toEqual({ type: 'none' });
    expect(h(k('/'), true)).toEqual({ type: 'none' });
    expect(h(k('?'), true)).toEqual({ type: 'none' });
    expect(h(k('k', { ctrlKey: true }), true)).toEqual({ type: 'palette' });
  });
  it('barra abre a paleta e interrogação abre a ajuda fora de campo', () => {
    const h = createShortcutMatcher();
    expect(h(k('/'), false)).toEqual({ type: 'palette' });
    expect(h(k('?'), false)).toEqual({ type: 'help' });
  });
  it('reconhece campos editáveis', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
