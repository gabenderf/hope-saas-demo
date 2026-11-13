/**
 * Cliente Supabase único da aplicação.
 *
 * Quem pode importar daqui: src/auth/**, src/data/supabase/**, e as pastas
 * `data/` de features (ex.: src/features/forecast/data). O ESLint bloqueia o
 * resto. Tela nunca fala com o banco direto.
 *
 * Opções de sessão (dono: agente de segurança, ver docs/seguranca.md):
 *   - login Supabase: sessão no localStorage (precisa valer entre abas e
 *     sobreviver ao recarregar), refresh automático com rotação (o Supabase
 *     revoga a família inteira se um refresh token for reusado), PKCE no
 *     link de redefinição de senha (o código no link não vale sem o
 *     verificador guardado neste navegador).
 *   - "dados reais + login demo": cliente anônimo, sem sessão nenhuma,
 *     exatamente como o dashboard antigo. Deixa de funcionar quando o SELECT
 *     anônimo for cortado (fase 4 do plano).
 * O risco do token no localStorage é XSS; a defesa é a CSP estrita, o
 * JWT curto e o encerramento por inatividade.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_STORAGE_KEY, SUPABASE_AUTH_STORAGE_KEY } from './storage-keys';
import { env } from './env';

let client: SupabaseClient | null = null;

export function hasSupabase(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  const realAuth = env.authMode === 'supabase';
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: realAuth,
      autoRefreshToken: realAuth,
      detectSessionInUrl: realAuth,
      flowType: 'pkce',
      // Chave própria: não colide com outra app Supabase aberta no mesmo domínio.
      // É também o nome do canal entre abas do supabase-js: ver src/lib/storage-keys.ts.
      storageKey: realAuth ? SUPABASE_AUTH_STORAGE_KEY : SUPABASE_ANON_STORAGE_KEY,
      storage: realAuth ? window.localStorage : undefined,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}
