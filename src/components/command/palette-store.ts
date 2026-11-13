import { create } from 'zustand';

interface PaletteState {
  paletteOpen: boolean;
  helpOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
}

export const usePaletteStore = create<PaletteState>()((set) => ({
  paletteOpen: false,
  helpOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));

export const openPalette = () => usePaletteStore.getState().setPaletteOpen(true);

const KEY = 'hope-cmd-recents';
const MAX = 5;

export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: string): void {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível: recentes são só conveniência */
  }
}
