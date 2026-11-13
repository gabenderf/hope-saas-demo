/**
 * Configuração de ambiente validada na partida. Erro aqui vira tela de erro,
 * nunca um app meio funcionando.
 */
import { z } from 'zod';

const schema = z.object({
  VITE_DATA_SOURCE: z.enum(['demo', 'supabase']).default('demo'),
  VITE_AUTH_MODE: z.enum(['demo', 'supabase']).default('demo'),
  VITE_SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  VITE_ALLOW_DEMO_IN_PRODUCTION: z.enum(['true', 'false']).default('false'),
  /** Cloudflare Turnstile (CAPTCHA do login). Chave pública do site; a secreta fica no Supabase Auth. */
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
});

export interface AppEnv {
  dataSource: 'demo' | 'supabase';
  authMode: 'demo' | 'supabase';
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  isProduction: boolean;
  /** problema de configuração que impede o app de subir */
  configError: string | null;
  /** chave pública do Turnstile; null = login sem CAPTCHA (só aceitável fora de produção) */
  turnstileSiteKey?: string | null;
}

function load(): AppEnv {
  const parsed = schema.safeParse(import.meta.env);
  if (!parsed.success) {
    return {
      dataSource: 'demo',
      authMode: 'demo',
      supabaseUrl: null,
      supabaseAnonKey: null,
      isProduction: import.meta.env.PROD,
      configError: `Variáveis de ambiente inválidas: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    };
  }
  const v = parsed.data;
  const url = v.VITE_SUPABASE_URL?.trim() || null;
  const key = v.VITE_SUPABASE_ANON_KEY?.trim() || null;
  const isProduction = import.meta.env.PROD;
  let configError: string | null = null;

  const needsSupabase = v.VITE_DATA_SOURCE === 'supabase' || v.VITE_AUTH_MODE === 'supabase';
  if (needsSupabase && (!url || !key)) {
    configError = 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias quando algum modo é "supabase".';
  } else if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
    configError = 'VITE_SUPABASE_URL não parece um endereço do Supabase.';
  }

  // Login de demonstração nunca vai para produção por descuido.
  //  - Login demo com DADOS REAIS em produção é sempre erro: seria um painel
  //    sem senha sobre o banco de verdade. A liberação abaixo não vale para isso.
  //  - Demo completo (login e dados de exemplo) só com a liberação explícita,
  //    para um ambiente público de demonstração.
  if (!configError && isProduction) {
    if (v.VITE_AUTH_MODE === 'demo' && v.VITE_DATA_SOURCE === 'supabase') {
      configError = 'Build de produção com login de demonstração sobre dados reais. Use VITE_AUTH_MODE="supabase".';
    } else if ((v.VITE_AUTH_MODE === 'demo' || v.VITE_DATA_SOURCE === 'demo') && v.VITE_ALLOW_DEMO_IN_PRODUCTION !== 'true') {
      configError = 'Build de produção com modo demo. Configure VITE_AUTH_MODE e VITE_DATA_SOURCE como "supabase".';
    }
  }

  return {
    dataSource: v.VITE_DATA_SOURCE,
    authMode: v.VITE_AUTH_MODE,
    supabaseUrl: url,
    supabaseAnonKey: key,
    isProduction,
    configError,
    turnstileSiteKey: v.VITE_TURNSTILE_SITE_KEY?.trim() || null,
  };
}

export const env: AppEnv = load();
