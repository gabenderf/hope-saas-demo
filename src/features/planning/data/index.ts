import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useToday } from '@/data/hooks';
import { useSource } from '@/data/source';
import { env } from '@/lib/env';
import { limparCache, prefixoDoCache, storageDoNavegador } from './cache';
import { type DadosPlanejamento, carregarPlanejamento } from './carregar';
import { lerFamiliasDemo, lerFamiliasSupabase, leitorDaFonte, leitorSupabase, type Progresso } from './leitores';

export type { DadosPlanejamento } from './carregar';
export type { Progresso } from './leitores';

export interface UsePlanejamento {
  dados: DadosPlanejamento | undefined;
  carregando: boolean;
  erro: Error | null;
  /** mês em leitura e quantas bipagens já vieram (só na primeira carga, sem cache) */
  progresso: Progresso | null;
  /** apaga o cache mensal e lê de novo */
  recarregar: () => Promise<void>;
  recarregando: boolean;
}

/** Dados do Planejamento: cache mensal local, leitura do banco real ou dos eventos do demo. */
export function usePlanejamento(): UsePlanejamento {
  const source = useSource();
  const hoje = useToday();
  const qc = useQueryClient();
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const modo = env.dataSource;
  const chave = ['planejamento', modo, hoje] as const;

  const query = useQuery({
    queryKey: chave,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        return await carregarPlanejamento({
          hoje,
          ler: modo === 'supabase' ? leitorSupabase() : leitorDaFonte(source),
          familias: modo === 'supabase' ? lerFamiliasSupabase : lerFamiliasDemo,
          storage: storageDoNavegador(),
          prefixoCache: prefixoDoCache(modo),
          agora: () => Date.now(),
          onProgresso: setProgresso,
        });
      } finally {
        setProgresso(null);
      }
    },
  });

  const [recarregando, setRecarregando] = useState(false);
  const recarregar = useCallback(async () => {
    setRecarregando(true);
    try {
      limparCache(storageDoNavegador(), prefixoDoCache(modo));
      await qc.invalidateQueries({ queryKey: chave });
    } finally {
      setRecarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, modo, hoje]);

  return { dados: query.data, carregando: query.isPending, erro: query.error, progresso, recarregar, recarregando };
}
