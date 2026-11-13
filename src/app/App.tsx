import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { env } from '@/lib/env';
import { queryClient } from './query';
import { router } from './router';
import { FatalScreen } from './screens';

export function App() {
  if (env.configError) return <FatalScreen title="Configuração inválida" detail={env.configError} />;
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
