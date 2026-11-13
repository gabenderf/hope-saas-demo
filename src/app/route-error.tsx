import { isRouteErrorResponse, useRouteError } from 'react-router';
import { FatalScreen } from './screens';

/** Erro inesperado numa rota: mensagem clara em vez de tela branca. */
export function RouteErrorScreen() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Erro desconhecido.';
  if (import.meta.env.DEV) console.error(error);
  return <FatalScreen title="Algo deu errado nesta tela" detail={detail} />;
}
