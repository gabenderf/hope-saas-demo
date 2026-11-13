import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { usePaletteStore } from './palette-store';
import { createShortcutMatcher, isEditableTarget } from './shortcuts';

/** Escuta o teclado uma vez para o app todo. */
export function GlobalShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const handle = createShortcutMatcher();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = handle(e, isEditableTarget(e.target));
      const store = usePaletteStore.getState();
      if (action.type === 'palette') {
        e.preventDefault();
        store.setPaletteOpen(!store.paletteOpen);
      } else if (action.type === 'help') {
        e.preventDefault();
        store.setHelpOpen(true);
      } else if (action.type === 'go') {
        e.preventDefault();
        void navigate(action.to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  return null;
}
