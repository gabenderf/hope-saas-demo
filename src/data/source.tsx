/**
 * Escolhe e fornece a fonte de dados (demo ou Supabase) conforme o ambiente.
 * A fonte é carregada sob demanda: o build de produção com dados reais nunca
 * executa o código do demo, e vice-versa.
 */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BootScreen, FatalScreen } from '@/app/screens';
import { env } from '@/lib/env';
import type { OperationsSource } from './types';

const SourceContext = createContext<OperationsSource | null>(null);

async function loadSource(): Promise<OperationsSource> {
  if (env.dataSource === 'supabase') {
    const m = await import('./supabase');
    return m.createSupabaseSource();
  }
  const m = await import('./demo');
  return m.createDemoSource();
}

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<OperationsSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSource().then(
      (s) => alive && setSource(s),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <FatalScreen title="Não foi possível carregar os dados" detail={error} />;
  if (!source) return <BootScreen />;
  return <SourceContext.Provider value={source}>{children}</SourceContext.Provider>;
}

export function useSource(): OperationsSource {
  const s = useContext(SourceContext);
  if (!s) throw new Error('useSource fora do DataSourceProvider');
  return s;
}
