import { describe, expect, it } from 'vitest';
import { SUPABASE_ANON_STORAGE_KEY, SUPABASE_AUTH_STORAGE_KEY } from '@/lib/storage-keys';
import { AUTH_CHANNEL_NAME, openAuthChannel, type AuthChannelMessage } from './channel';

describe('canal entre abas', () => {
  it('não usa o nome do canal do supabase-js (a chave de sessão)', () => {
    // O supabase-js abre um BroadcastChannel com o nome da storageKey. Mensagem nossa ali
    // virava evento de sessão vazio e a tela ia para o login (06/11/2026).
    expect(AUTH_CHANNEL_NAME).not.toBe(SUPABASE_AUTH_STORAGE_KEY);
    expect(AUTH_CHANNEL_NAME).not.toBe(SUPABASE_ANON_STORAGE_KEY);
  });

  it('ignora mensagem no formato do supabase-js e entrega as nossas', async () => {
    const recebidas: AuthChannelMessage[] = [];
    const ouvinte = openAuthChannel((m) => recebidas.push(m));
    const outro = new BroadcastChannel(AUTH_CHANNEL_NAME);
    outro.postMessage({ event: 'SIGNED_IN', session: null });
    outro.postMessage({ type: 'activity', at: 123 });
    await new Promise((r) => setTimeout(r, 20));
    expect(recebidas).toEqual([{ type: 'activity', at: 123 }]);
    outro.close();
    ouvinte.close();
  });
});
