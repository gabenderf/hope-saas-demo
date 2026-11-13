/**
 * Chaves do Supabase Auth no localStorage (src/lib/supabase.ts).
 *
 * Cuidado: o supabase-js usa a MESMA string como nome do BroadcastChannel com
 * que sincroniza a sessão entre abas. Nenhum outro canal do app pode ter um
 * destes nomes: uma mensagem nossa nesse canal chega ao supabase-js como um
 * evento de sessão vazio, e a tela vai para o login com a sessão ainda válida
 * (achado no projeto de teste em 06/11/2026; ver src/auth/channel.ts).
 */
export const SUPABASE_AUTH_STORAGE_KEY = 'hope-auth';
export const SUPABASE_ANON_STORAGE_KEY = 'hope-anon';
