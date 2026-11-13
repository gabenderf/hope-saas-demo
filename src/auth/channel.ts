/**
 * Conversa entre abas do mesmo navegador: sair numa aba sai em todas, e
 * mexer numa aba conta como atividade nas outras (senão a aba esquecida no
 * fundo derrubaria a sessão de quem está trabalhando na da frente).
 *
 * Só carrega sinal, nunca token nem dado pessoal.
 *
 * ⚠️ O nome NÃO pode ser a chave de sessão do Supabase (`hope-auth`): o
 * supabase-js usa essa string como nome do canal dele entre abas, e cada
 * "atividade" que postávamos chegava lá como um evento de sessão vazio. A tela
 * ia para o login no primeiro clique, com a sessão ainda válida (06/11/2026).
 */
import type { SignOutReason } from './types';

export type AuthChannelMessage =
  | { type: 'signout'; reason: SignOutReason }
  | { type: 'activity'; at: number }
  | { type: 'signin' };

export const AUTH_CHANNEL_NAME = 'hope-abas';
const CHANNEL_NAME = AUTH_CHANNEL_NAME;

export interface AuthChannel {
  post(message: AuthChannelMessage): void;
  close(): void;
}

function isMessage(data: unknown): data is AuthChannelMessage {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { type?: unknown }).type;
  return t === 'signout' || t === 'activity' || t === 'signin';
}

export function openAuthChannel(onMessage: (message: AuthChannelMessage) => void): AuthChannel {
  if (typeof BroadcastChannel === 'undefined') return { post() {}, close() {} };
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isMessage(event.data)) onMessage(event.data);
  };
  return {
    post(message) {
      try {
        channel.postMessage(message);
      } catch {
        /* canal fechado durante o descarregamento da página */
      }
    },
    close() {
      channel.close();
    },
  };
}
