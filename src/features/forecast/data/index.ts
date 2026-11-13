import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useNow, useToday } from '@/data/hooks';
import { env } from '@/lib/env';
import type { ForecastData, ForecastSource } from './types';

export type { ForecastConfig, ForecastData, ForecastSource, SkuDemandRow } from './types';

let source: Promise<ForecastSource> | null = null;

/**
 * Fonte própria da Previsão, escolhida por env.dataSource. Import dinâmico (como src/data/source.tsx):
 * o supabase-js não entra no carregamento inicial do demo, e o demo não entra no build com dados reais.
 */
export function getForecastSource(): Promise<ForecastSource> {
  source ??= (
    env.dataSource === 'supabase'
      ? import('./supabase-source').then((m) => m.createSupabaseForecastSource({ canWrite: env.authMode === 'supabase' }))
      : import('./demo-source').then((m) => m.createDemoForecastSource())
  ).catch((e: unknown) => {
    source = null; // não guarda a falha: a próxima tentativa carrega de novo
    throw e;
  });
  return source;
}

const REFRESH_MS = 60_000;

export const forecastKey = (day: string) => ['forecast', 'data', day] as const;

/** Dados do dia, atualizados a cada 60 s. */
export function useForecastData(): UseQueryResult<ForecastData> {
  const day = useToday();
  const now = useNow();
  return useQuery({
    queryKey: forecastKey(day),
    queryFn: async () => (await getForecastSource()).load(day, now),
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
  });
}

/** Grava config_previsao.equipe_padrao (só na fonte que permite escrita). */
export function useSetTeamSize() {
  const qc = useQueryClient();
  const day = useToday();
  return useMutation({
    mutationFn: async (value: number) => {
      const r = await (await getForecastSource()).setTeamSize(value);
      return {
        // O desfazer também grava: sem recarregar, a tela seguia mostrando o valor desfeito.
        undo: async () => {
          await r.undo();
          await qc.invalidateQueries({ queryKey: forecastKey(day) });
        },
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: forecastKey(day) }),
  });
}

export function useForecastCanWrite(): boolean {
  // Enquanto a fonte carrega, não deixa gravar.
  return useQuery({ queryKey: ['forecast', 'source'], queryFn: getForecastSource, staleTime: Infinity }).data?.canWrite ?? false;
}
