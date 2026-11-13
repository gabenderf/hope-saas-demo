/**
 * Fonte de dados real (Supabase). Como funciona:
 * docs/dados-supabase.md. A lógica fica em source.ts; aqui só a ligação com
 * o cliente único da aplicação.
 */
import { env } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createSupabasePort } from './port';
import { createSupabaseSourceWith, type SupabaseOperationsSource } from './source';

export { DataLoadError, ReadOnlyError } from './errors';
export type { LiveMode, SupabaseOperationsSource } from './source';

function safeLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = 'hope.supabase.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export async function createSupabaseSource(): Promise<SupabaseOperationsSource> {
  return createSupabaseSourceWith({
    port: createSupabasePort(getSupabase()),
    scope: env.supabaseUrl ?? 'supabase',
    storage: safeLocalStorage(),
    // Gravação só com login de verdade. O preview "dados reais" (login de demonstração) segue somente leitura.
    canWrite: env.authMode === 'supabase',
  });
}
