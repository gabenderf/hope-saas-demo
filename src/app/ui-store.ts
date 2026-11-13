/**
 * Preferências de interface do usuário (persistidas no navegador).
 * A chave 'hope-ui' é lida também por public/theme-init.js antes do React
 * subir; mudar a forma do estado exige mudar aquele arquivo junto.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

interface UiState {
  theme: ThemePreference;
  /** Modo TV tem tema próprio: escuro por padrão */
  tvTheme: 'light' | 'dark';
  density: Density;
  sidebarCollapsed: boolean;
  setTheme: (theme: ThemePreference) => void;
  setTvTheme: (theme: 'light' | 'dark') => void;
  setDensity: (density: Density) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      tvTheme: 'dark',
      density: 'comfortable',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setTvTheme: (tvTheme) => set({ tvTheme }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'hope-ui', version: 1 },
  ),
);
