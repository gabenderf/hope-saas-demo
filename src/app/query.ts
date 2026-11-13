import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

/**
 * Fim de sessão (qualquer motivo): nada do perfil anterior fica na memória da
 * aba. Sem isto, quem entrasse depois na mesma aba veria, até a primeira
 * consulta voltar, a lista de usuários, a auditoria e o resto do anterior
 * (gcTime de 10 min). Consultas em andamento são canceladas antes.
 */
export function clearSessionQueries(client: QueryClient = queryClient): void {
  void client.cancelQueries();
  client.clear();
}
